/*
 * Live game-state reader for the achievement system (runs inside player.html, next to the emulator).
 *
 * Memory access (the idea is adapted from RetroAchievements' rcheevos, MIT licence): rcheevos reads each
 * console's RAM through the emulator core's memory map, addressed by real console addresses. EmulatorJS has no
 * such hook, but every core can produce a save state, and the state contains the console's RAM. So once a second
 * we take a state (a few ms) and read the RAM out of it:
 *   GBA    (mGBA)      IWRAM 0x03000000 · EWRAM 0x02000000    fixed offsets in the core's state
 *   GB/GBC (gambatte)  WRAM $C000–$DFFF                       the state's labelled "wram" field
 *   DS     (melonDS)   main RAM 0x02000000 (4 MB)            right after the "NDSG" section header
 *
 * Finding the game's data — no address tables, no in-game save needed:
 *   Gen 1/2  the party list has a fixed shape (count, species list ending in $FF, then the Pokémon whose first
 *            byte repeats the species); everything else sits at fixed distances from it.
 *   Gen 3    the game keeps pointers to its save data in IWRAM (Emerald/FRLG move the data on every map change,
 *            so — like RetroAchievements' sets — we follow the pointers on every read).
 *   Gen 4/5  the Pokédex block starts with the magic number 0xBEEFCAFE; the rest of the save data sits at fixed
 *            distances from it (the same layout the games write to the cartridge).
 * Every reading must pass consistency checks (checksums, owned ⊆ seen, ranges, a running clock where there is
 * one) and look the same twice in a row before anything is reported. Doubtful readings are dropped.
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------- helpers
  const u16 = (h, o) => h[o] | (h[o + 1] << 8);
  const u32 = (h, o) => (h[o] | (h[o + 1] << 8) | (h[o + 2] << 16) | (h[o + 3] << 24)) >>> 0;
  const be16 = (h, o) => (h[o] << 8) | h[o + 1];
  const bits = (h, o, nBits) => { const out = []; for (let i = 0; i < nBits; i++) if (h[o + (i >> 3)] & (1 << (i & 7))) out.push(i + 1); return out; };
  const anyBitsFrom = (h, o, from, toByte) => { for (let i = from; i < toByte * 8; i++) if (h[o + (i >> 3)] & (1 << (i & 7))) return true; return false; };
  const subset = (a, b) => { const s = new Set(b); return a.every((x) => s.has(x)); };
  const bcd = (h, o, n) => { let v = 0; for (let i = 0; i < n; i++) { const hi = h[o + i] >> 4, lo = h[o + i] & 15; if (hi > 9 || lo > 9) return -1; v = v * 100 + hi * 10 + lo; } return v; };
  const popcount = (x) => { let c = 0; while (x) { c += x & 1; x >>>= 1; } return c; };
  function findAll(h, needle, from, to, step) {
    const hits = [];
    for (let i = from; i + needle.length <= to; i += step) {
      let k = 0; while (k < needle.length && h[i + k] === needle[k]) k++;
      if (k === needle.length) hits.push(i);
    }
    return hits;
  }

  // ---------------------------------------------------------------- RAM out of the core's save state
  function coreState() {
    const s = window.EJS_emulator.gameManager.getState();
    if (!s || s.length < 64) return null;
    // RetroArch wraps the core's data in "RASTATE" blocks; the core's own state follows the "MEM " block header
    if (s[0] === 0x52 && s[1] === 0x41 && s[2] === 0x53 && s[3] === 0x54) {
      for (let o = 8; o < 64; o += 4) if (s[o] === 0x4D && s[o + 1] === 0x45 && s[o + 2] === 0x4D && s[o + 3] === 0x20) return s.subarray(o + 8);
      return null;
    }
    return s;
  }
  const RAM = {
    gba(s) { // mGBA: IWRAM at 0x19000, EWRAM at 0x21000
      if (s.length < 0x61000) return null;
      return { iw: s.subarray(0x19000, 0x21000), ew: s.subarray(0x21000, 0x61000) };
    },
    gb(s) { // gambatte: 0x00, version, 3-byte thumbnail length + thumbnail, then fields (NUL-terminated label, 3-byte big-endian length, data)
      if (s[0] !== 0) return null;
      for (let o = 5 + ((s[2] << 16) | (s[3] << 8) | s[4]); o < s.length - 8;) {
        let e = o; while (e < s.length && s[e]) e++;
        const label = String.fromCharCode.apply(null, s.subarray(o, e));
        const len = (s[e + 1] << 16) | (s[e + 2] << 8) | s[e + 3], d = e + 4;
        if (label === "wram") return len >= 0x2000 ? { wram: s.subarray(d, d + len) } : null;
        if (!len && !label) return null;
        o = d + len;
      }
      return null;
    },
    nds(s) { // melonDS: main RAM is the first thing in the "NDSG" section
      for (let o = 0; o < 0x100; o += 4) if (s[o] === 0x4E && s[o + 1] === 0x44 && s[o + 2] === 0x53 && s[o + 3] === 0x47) {
        const d = o + 0x10;
        return s.length >= d + 0x400000 ? { main: s.subarray(d, d + 0x400000) } : null;
      }
      return null;
    },
  };

  // ================================================================ Gen 1 (Red · Blue · Yellow) and Gen 2 (Gold · Silver · Crystal)
  // Gen 1 internal species index → National Dex number
  const G1DEX = [0,112,115,32,35,21,100,34,80,2,103,108,102,88,94,29,31,104,111,131,59,151,130,90,72,92,123,120,9,127,114,0,0,58,95,22,16,79,64,75,113,67,122,106,107,24,47,54,96,76,0,126,0,125,82,109,0,56,86,50,128,0,0,0,83,48,149,0,0,0,84,60,124,146,144,145,132,52,98,0,0,0,37,38,25,26,0,0,147,148,140,141,116,117,0,0,27,28,138,139,39,40,133,136,135,134,66,41,23,46,61,62,13,14,15,0,85,57,51,49,87,0,0,10,11,12,68,0,55,97,42,150,143,129,0,0,89,0,99,91,0,101,36,110,53,105,0,93,63,65,17,18,121,1,3,73,0,118,119,0,0,0,0,77,78,19,20,33,30,74,137,142,0,81,0,0,4,7,5,8,6,0,0,0,0,43,44,45,69,70,71];
  /* Gen 1, distances from wPartyCount (English/European layout; Yellow is shifted as a whole, so the same):
   * Pokémon +8 (44 bytes) · Pokédex owned +0x194, seen +0x1A7 (19 bytes each) · money +0x1E4 (3 bytes BCD) · badges +0x1F3 */
  const GB1 = { mons: 8, size: 44, owned: 0x194, seen: 0x1A7, dexBytes: 19, dexMax: 151, money: 0x1E4, badges: 0x1F3 };
  /* Gen 2: Pokémon +8 (48 bytes) · caught +0x1C2, seen +0x1E2 (32 bytes) · money differs per game (below) */
  const GB2 = { mons: 8, size: 48, owned: 0x1C2, seen: 0x1E2, dexBytes: 32, dexMax: 251 };
  const GB2_MONEY = { gs: -0x4AF, crystal: -0x489 }; // Johto badges = money + 9, Kanto badges = money + 10

  /** WRAM bank 0 + bank 1 as one 8 KB view addressed $C000–$DFFF (the Game Boy Color has more banks after it). */
  const flatWram = (w) => (w.length === 0x2000 ? w : w.subarray(0, 0x2000));

  function gbParty(w, p, gen) {
    const L = gen === 1 ? GB1 : GB2, n = w[p];
    if (n < 1 || n > 6 || w[p + 1 + n] !== 0xFF) return null;
    const out = [];
    for (let i = 0; i < n; i++) {
      const listed = w[p + 1 + i], o = p + L.mons + i * L.size;
      if (o + L.size > w.length) return null;
      if (gen === 2 && listed === 0xFD) { out.push({ sp: 0, lv: 0, hp: 0, max: 0, shiny: false, egg: true, item: 0 }); continue; }
      if (w[o] !== listed) return null;
      const lv = gen === 1 ? w[o + 0x21] : w[o + 0x1F];
      const hp = be16(w, o + (gen === 1 ? 1 : 0x22)), max = be16(w, o + (gen === 1 ? 0x22 : 0x24));
      if (lv < 1 || lv > 100 || !max || hp > max || max > 999) return null;
      const sp = gen === 1 ? G1DEX[listed] || 0 : listed;
      if (!sp || sp > L.dexMax) return null;
      const ot = be16(w, o + (gen === 1 ? 0x0C : 0x06)), dv = be16(w, o + (gen === 1 ? 0x1B : 0x15));
      const id = `${ot.toString(16)}.${dv.toString(16)}`;
      let shiny = false;
      if (gen === 2) { const a = w[o + 0x15] >> 4, d = w[o + 0x15] & 15, s = w[o + 0x16] >> 4, c = w[o + 0x16] & 15; shiny = d === 10 && s === 10 && c === 10 && [2, 3, 6, 7, 10, 11, 14, 15].includes(a); }
      const met = gen === 2 ? w[o + 0x1E] & 0x7F : 0; // Crystal: landmark where it was caught (0 = not recorded)
      out.push({ sp, lv, hp, max, shiny, egg: false, item: gen === 2 ? w[o + 1] : 0, id, met: met || null });
    }
    return out;
  }
  function gbRead(w, p, gen, ver) {
    const L = gen === 1 ? GB1 : GB2;
    const party = gbParty(w, p, gen);
    if (!party) return { bad: "party" };
    if (p + L.seen + L.dexBytes > w.length) return { bad: "range" };
    const owned = bits(w, p + L.owned, L.dexMax), seenL = bits(w, p + L.seen, L.dexMax);
    if (anyBitsFrom(w, p + L.owned, L.dexMax, L.dexBytes) || anyBitsFrom(w, p + L.seen, L.dexMax, L.dexBytes)) return { bad: "Pokédex out of range" };
    if (!subset(owned, seenL)) return { bad: "owned/seen" };
    if (!subset(party.filter((m) => !m.egg).map((m) => m.sp), owned)) return { bad: "party not in Pokédex" };
    let money, badgeBits, kanto = 0;
    if (gen === 1) { money = bcd(w, p + GB1.money, 3); badgeBits = w[p + GB1.badges]; }
    else {
      const m = p + GB2_MONEY[ver === "crystal" ? "crystal" : "gs"];
      if (m < 0) return { bad: "range" };
      money = (w[m] << 16) | (w[m + 1] << 8) | w[m + 2]; badgeBits = w[m + 9]; kanto = w[m + 10];
    }
    if (money < 0 || money > 999999) return { bad: "money" };
    // where the player is now (Gen 1: wCurMap; Gen 2: wMapGroup/wMapNumber), used for games that don't record catch locations
    let here = null;
    if (gen === 1) here = `g1map:${w[p + 0x1FB]}`;
    else { const g = w[p - 0x22], n = w[p - 0x21]; if (g >= 1 && g <= 26 && n >= 1 && n <= 100) here = `${ver === "crystal" ? "cmap" : "gsmap"}:${g}.${n}`; }
    return {
      gen, playSeconds: null, owned, seen: seenL.length, here,
      badges: popcount(badgeBits) + popcount(kanto), badgeBits: badgeBits | (kanto << 8),
      champion: gen === 2 && kanto > 0, money, coins: null, party, partyLive: true, map: null,
    };
  }
  /** Find wPartyCount by the shape of the party list (the player's party comes before the enemy's). */
  function gbLocate(w, gen, ver) {
    for (let p = 0x1000; p < 0x2000 - 8; p++) {
      const n = w[p];
      if (n < 1 || n > 6 || w[p + 1 + n] !== 0xFF) continue;
      if (!gbRead(w, p, gen, ver).bad) return p;
    }
    return -1;
  }

  // ================================================================ Gen 3 (Ruby · Sapphire · Emerald · FireRed · LeafGreen)
  const EW = 0x02000000, EW_SIZE = 0x40000, IW_SIZE = 0x8000;
  const G3 = {
    E:    { flags: 0x1270, money: 0x490, coins: 0x494, party: 0x234, key: 0xAC,  badge0: 0x867, clear: 0x864, moves: true },
    FRLG: { flags: 0xEE0,  money: 0x290, coins: 0x294, party: 0x034, key: 0xF20, badge0: 0x820, clear: 0x82C, moves: true },
    RS:   { flags: 0x1220, money: 0x490, coins: 0x494, party: 0x234, key: -1,    badge0: 0x807, clear: 0x804, moves: false, sb2Size: 0x890 },
  };
  const ORDER = ["GAEM", "GAME", "GEAM", "GEMA", "GMAE", "GMEA", "AGEM", "AGME", "AEGM", "AEMG", "AMGE", "AMEG",
    "EGAM", "EGMA", "EAGM", "EAMG", "EMGA", "EMAG", "MGAE", "MGEA", "MAGE", "MAEG", "MEGA", "MEAG"];
  function g3Mon(h, o) {
    if (o < 0 || o + 100 > h.length) return null;
    const pid = u32(h, o), ot = u32(h, o + 4);
    if (!pid && !ot) return null;
    const key = (pid ^ ot) >>> 0, d = new Uint8Array(48);
    let sum = 0;
    for (let i = 0; i < 48; i += 4) {
      const v = (u32(h, o + 0x20 + i) ^ key) >>> 0;
      d[i] = v & 255; d[i + 1] = (v >>> 8) & 255; d[i + 2] = (v >>> 16) & 255; d[i + 3] = v >>> 24;
      sum = (sum + (v & 0xFFFF) + (v >>> 16)) & 0xFFFF;
    }
    if (sum !== u16(h, o + 0x1C)) return null;
    const ord = ORDER[pid % 24], g = ord.indexOf("G") * 12, m = ord.indexOf("M") * 12;
    const sp = u16(d, g), lv = h[o + 0x54], hp = u16(h, o + 0x56), max = u16(h, o + 0x58);
    if (!sp || sp > 439 || lv < 1 || lv > 100 || hp > max || max > 999) return null;
    return { pid, ot, sp, item: u16(d, g + 2), lv, hp, max, egg: !!((u32(d, m + 4) >>> 30) & 1), met: d[m + 1],
      shiny: (((ot & 0xFFFF) ^ (ot >>> 16) ^ (pid & 0xFFFF) ^ (pid >>> 16)) & 0xFFFF) < 8 };
  }
  const g3Exact = (h, o, n) => { const out = []; for (let i = 0; i < n; i++) { const m = g3Mon(h, o + i * 100); if (!m) return null; out.push(m); } return out; };
  const g3Run = (h, o) => { const out = []; for (let i = 0; i < 6; i++) { const m = g3Mon(h, o + i * 100); if (!m) break; out.push(m); } return out; };
  /** A plausible save block 2: a terminated trainer name and a sane play clock. */
  function g3Sb2(ew, o) {
    if (o < 0 || o + 0x100 > EW_SIZE) return false;
    let end = -1; for (let i = 0; i < 8; i++) if (ew[o + i] === 0xFF) { end = i; break; }
    if (end < 1) return false;
    for (let i = 0; i < end; i++) if (!ew[o + i] || ew[o + i] > 0xEE) return false; // Gen 3 text characters
    return ew[o + 8] <= 1 && ew[o + 0x10] < 60 && ew[o + 0x11] < 60 && ew[o + 0x12] < 60 && u16(ew, o + 0x0E) <= 999;
  }
  function g3Sb1(ew, o, L) {
    if (o < 0 || o + 0x3D00 > EW_SIZE) return false;
    const n = u32(ew, o + L.party);
    return n >= 1 && n <= 6 && !!g3Exact(ew, o + L.party + 4, n);
  }
  function g3Read(m, R) {
    const L = G3[R.fam], ew = m.ew;
    let b2, b1;
    if (L.moves) {
      if (!R.ptr) { // gSaveBlock1Ptr, gSaveBlock2Ptr: two neighbouring IWRAM words pointing at valid save blocks
        for (let p = 4; p + 8 <= IW_SIZE; p += 4) {
          const a = u32(m.iw, p), b = u32(m.iw, p + 4);
          if (a < EW || a >= EW + EW_SIZE || b < EW || b >= EW + EW_SIZE) continue;
          if (g3Sb1(ew, a - EW, L) && g3Sb2(ew, b - EW)) { R.ptr = p; break; }
        }
        if (!R.ptr) return { wait: "looking for your trainer (pick a starter first)" };
      }
      b1 = u32(m.iw, R.ptr) - EW; b2 = u32(m.iw, R.ptr + 4) - EW;
      if (!g3Sb1(ew, b1, L) || !g3Sb2(ew, b2)) { R.ptr = 0; return { wait: "title screen or loading" }; }
    } else {
      if (R.sb1 < 0) { // Ruby/Sapphire: the two blocks sit side by side and never move
        for (let o = L.sb2Size; o + 0x3D00 <= EW_SIZE; o += 4) if (g3Sb1(ew, o, L) && g3Sb2(ew, o - L.sb2Size)) { R.sb1 = o; break; }
        if (R.sb1 < 0) return { wait: "looking for your trainer (pick a starter first)" };
      }
      b1 = R.sb1; b2 = b1 - L.sb2Size;
      if (!g3Sb1(ew, b1, L) || !g3Sb2(ew, b2)) { R.sb1 = -1; return { wait: "title screen or loading" }; }
    }
    if (R.party < 0) { // the live party (changes in battle) sits at a fixed spot outside the save blocks
      const n = u32(ew, b1 + L.party), saved = g3Exact(ew, b1 + L.party + 4, n), copy = b1 + L.party + 4;
      for (let o = 0; saved && o + 100 <= EW_SIZE; o += 4) if (Math.abs(o - copy) > 600 && u32(ew, o) === saved[0].pid && g3Mon(ew, o)) { R.party = o; break; }
    }
    const owned = bits(ew, b2 + 0x28, 386), seenL = bits(ew, b2 + 0x5C, 386);
    if (anyBitsFrom(ew, b2 + 0x28, 386, 52) || anyBitsFrom(ew, b2 + 0x5C, 386, 52)) return { bad: "Pokédex out of range" };
    if (!subset(owned, seenL)) return { bad: "owned/seen" };
    const flag = (id) => !!(ew[b1 + L.flags + (id >> 3)] & (1 << (id & 7)));
    let badgeBits = 0; for (let i = 0; i < 8; i++) if (flag(L.badge0 + i)) badgeBits |= 1 << i;
    const key = L.key >= 0 ? u32(ew, b2 + L.key) : 0;
    const money = (u32(ew, b1 + L.money) ^ key) >>> 0, coins = (u16(ew, b1 + L.coins) ^ (key & 0xFFFF)) & 0xFFFF;
    if (money > 999999 || coins > 9999) return { bad: "money" };
    let party = R.party >= 0 ? g3Run(ew, R.party) : [];
    const partyLive = party.length > 0;
    if (!partyLive) party = g3Exact(ew, b1 + L.party + 4, u32(ew, b1 + L.party)) || [];
    return {
      gen: 3, playSeconds: u16(ew, b2 + 0x0E) * 3600 + ew[b2 + 0x10] * 60 + ew[b2 + 0x11], clock: ew[b2 + 0x12],
      owned, seen: seenL.length, badges: popcount(badgeBits), badgeBits, champion: flag(L.clear), money, coins,
      party: party.map((x) => ({ sp: x.sp, lv: x.lv, hp: x.hp, max: x.max, shiny: x.shiny, egg: x.egg, item: x.item, id: `${x.pid.toString(16)}.${x.ot.toString(16)}`, met: x.met })),
      partyLive, map: [ew[b1 + 4], ew[b1 + 5]], here: null,
    };
  }

  // ================================================================ Gen 4/5 (DS)
  /* Distances inside the save data (the layout the games also write to the cartridge, as documented by PKHeX),
   * from the start of the general block. dex = the Pokédex block, which starts with 0xBEEFCAFE. */
  const DS = {
    dp:   { gen: 4, dex: 0x12DC, name: 0x64, money: 0x78, badges: 0x7E, time: 0x86, count: 0x94, party: 0x98, size: 236, dexMax: 493, caught: 0x04, seen: 0x44, seenN: 1, seenLen: 0x40 },
    pt:   { gen: 4, dex: 0x1328, name: 0x68, money: 0x7C, badges: 0x82, time: 0x8A, count: 0x9C, party: 0xA0, size: 236, dexMax: 493, caught: 0x04, seen: 0x44, seenN: 1, seenLen: 0x40 },
    hgss: { gen: 4, dex: 0x12B8, name: 0x64, money: 0x78, badges: 0x7E, kanto: 0x83, time: 0x86, count: 0x94, party: 0x98, size: 236, dexMax: 493, caught: 0x04, seen: 0x44, seenN: 1, seenLen: 0x40 },
    bw:   { gen: 5, dex: 0x21600, name: 0x19404, money: 0x21200, badges: 0x21204, time: 0x19424, count: 0x18E04, party: 0x18E08, size: 220, dexMax: 649, caught: 0x08, seen: 0x5C, seenN: 4, seenLen: 0x54 },
    b2w2: { gen: 5, dex: 0x21400, name: 0x19404, money: 0x21100, badges: 0x21104, time: 0x19424, count: 0x18E04, party: 0x18E08, size: 220, dexMax: 649, caught: 0x08, seen: 0x5C, seenN: 4, seenLen: 0x54 },
  };
  const ABCD = ["ABCD", "ABDC", "ACBD", "ACDB", "ADBC", "ADCB", "BACD", "BADC", "BCAD", "BCDA", "BDAC", "BDCA",
    "CABD", "CADB", "CBAD", "CBDA", "CDAB", "CDBA", "DABC", "DACB", "DBAC", "DBCA", "DCAB", "DCBA"];
  const lcg = (s) => (Math.imul(s, 0x41C64E6D) + 0x6073) >>> 0;
  /** One DS-era party Pokémon (Gen 4/5 share the format): decrypt, verify the checksum, read the basics. */
  function dsMon(h, o, size) {
    if (o + size > h.length) return null;
    const pid = u32(h, o), chk = u16(h, o + 6);
    if (!pid && !chk) return null;
    if (u16(h, o + 4) & 7) return null; // the game is editing this Pokémon right now (decrypted in place): try again next time
    const d = new Uint8Array(128);
    let seed = chk, sum = 0;
    for (let i = 0; i < 128; i += 2) { seed = lcg(seed); const v = (u16(h, o + 8 + i) ^ (seed >>> 16)) & 0xFFFF; d[i] = v & 255; d[i + 1] = v >> 8; sum = (sum + v) & 0xFFFF; }
    if (sum !== chk) return null;
    const ord = ABCD[((pid >>> 13) & 31) % 24], a = ord.indexOf("A") * 32, b = ord.indexOf("B") * 32, dd = ord.indexOf("D") * 32;
    const sp = u16(d, a), item = u16(d, a + 2), tid = u16(d, a + 4), sid = u16(d, a + 6);
    const st = new Uint8Array(20); seed = pid;
    for (let i = 0; i < 20; i += 2) { seed = lcg(seed); const v = (u16(h, o + 0x88 + i) ^ (seed >>> 16)) & 0xFFFF; st[i] = v & 255; st[i + 1] = v >> 8; }
    const lv = st[4], hp = u16(st, 6), max = u16(st, 8);
    if (!sp || sp > 700 || lv < 1 || lv > 100 || hp > max || max > 999) return null;
    // met location: Gen 4 Pt/HGSS "extended" field (0x46) if set, else the original one (0x80)
    const met = u16(d, b + 0x1E) || u16(d, dd + 0x18);
    return { sp, item, lv, hp, max, egg: !!((u32(d, b + 0x10) >>> 30) & 1), shiny: ((tid ^ sid ^ (pid & 0xFFFF) ^ (pid >>> 16)) & 0xFFFF) < 8,
      id: `${pid.toString(16)}.${tid.toString(16)}${sid.toString(16)}`, met };
  }
  /** Shape checks for a DS save image at base `b`: Pokédex magic, a terminated name, sane numbers, a valid party. */
  function dsCheck(h, b, L) {
    if (b < 0 || b + L.dex + 0x200 > h.length || u32(h, b + L.dex) !== 0xBEEFCAFE) return false;
    let end = -1; for (let i = 0; i < 8; i++) if (u16(h, b + L.name + i * 2) === 0xFFFF) { end = i; break; }
    if (end < 1) return false;
    const t = b + L.time;
    if (u16(h, t) > 999 || h[t + 2] > 59 || h[t + 3] > 59 || u32(h, b + L.money) > 999999) return false;
    const n = h[b + L.count];
    if (n < 1 || n > 6) return false;
    return !!dsMon(h, b + L.party, L.size);
  }
  function dsRead(m, R) {
    const L = DS[R.ds], h = m.main;
    if (R.base < 0) {
      // every copy of the Pokédex magic is a candidate; the live one is the copy whose play clock is running
      const now = findAll(h, [0xFE, 0xCA, 0xEF, 0xBE], 0, h.length, 4).map((o) => o - L.dex).filter((b) => dsCheck(h, b, L))
        .map((b) => ({ b, t: `${u16(h, b + L.time)}:${h[b + L.time + 2]}:${h[b + L.time + 3]}` }));
      if (R.cands) { const live = now.find((x) => R.cands.some((c) => c.b === x.b && c.t !== x.t)); if (live) R.base = live.b; }
      R.cands = now;
      if (R.base < 0) return { wait: now.length ? "checking" : "looking for your trainer (pick a starter first)" };
    }
    const b = R.base;
    if (!dsCheck(h, b, L)) { R.base = -1; R.cands = null; return { wait: "title screen or loading" }; }
    const owned = bits(h, b + L.dex + L.caught, L.dexMax);
    const seenSet = new Set();
    for (let k = 0; k < L.seenN; k++) for (const n of bits(h, b + L.dex + L.seen + k * L.seenLen, L.dexMax)) seenSet.add(n);
    if (!subset(owned, [...seenSet])) return { bad: "owned/seen" };
    const n = h[b + L.count], party = [];
    for (let i = 0; i < n; i++) { const x = dsMon(h, b + L.party + i * L.size, L.size); if (!x) return { bad: "party" }; party.push(x); }
    if (!subset(party.filter((x) => !x.egg).map((x) => x.sp), owned)) return { bad: "party not in Pokédex" };
    const badgeBits = h[b + L.badges] | (L.kanto ? h[b + L.kanto] << 8 : 0);
    return {
      gen: L.gen, playSeconds: u16(h, b + L.time) * 3600 + h[b + L.time + 2] * 60 + h[b + L.time + 3], clock: h[b + L.time + 3],
      owned, seen: seenSet.size, badges: popcount(badgeBits), badgeBits, champion: !!L.kanto && h[b + L.kanto] > 0,
      money: u32(h, b + L.money), coins: null, party, partyLive: true, map: null, here: null,
    };
  }

  // ================================================================ driver
  const R = { sys: "", gen: 0, version: "", fam: "", ds: "", gbBase: -1, ptr: 0, sb1: -1, party: -1, base: -1, cands: null, note: "starting", last: null };
  const core = (s) => `${s.owned.length}|${s.seen}|${s.badgeBits}|${s.champion}|${s.money}|${s.party.map((x) => x.sp + ":" + x.lv).join(",")}`;
  let lastJson = "";

  function readOnce() {
    const s = coreState();
    if (!s) return { wait: "no save state from the emulator" };
    if (R.sys === "gba") { const m = RAM.gba(s); return m ? g3Read(m, R) : { unsupported: true }; }
    if (R.sys === "nds") { const m = RAM.nds(s); return m ? dsRead(m, R) : { unsupported: true }; }
    if (R.sys === "gb") {
      const m = RAM.gb(s); if (!m) return { unsupported: true };
      const w = flatWram(m.wram);
      if (R.gbBase < 0 || gbRead(w, R.gbBase, R.gen, R.version).bad) {
        R.gbBase = gbLocate(w, R.gen, R.version);
        if (R.gbBase < 0) return { wait: "looking for your party (pick a starter first)" };
      }
      return gbRead(w, R.gbBase, R.gen, R.version);
    }
    return { unsupported: true };
  }

  function tick() {
    try {
      const E = window.EJS_emulator;
      if (!R.sys || !E || E.paused || !E.gameManager) return;
      const s = readOnce();
      if (s.unsupported) { R.note = "this emulator core isn't supported for achievements"; return; }
      if (s.wait) { R.note = s.wait; R.last = null; return; }
      if (s.bad) { R.note = "skipped a bad reading (" + s.bad + ")"; R.ptr = 0; R.sb1 = R.base = R.gbBase = -1; R.cands = null; R.last = null; return; }
      const prev = R.last;
      R.last = s;
      if (!prev) { R.note = "checking"; return; }
      // where the game has a clock, it must be running (frozen = menus, transitions or stale data)
      if (s.clock !== undefined && prev.clock === s.clock && prev.playSeconds === s.playSeconds) { R.note = "waiting for the game clock"; return; }
      if (core(prev) !== core(s)) { R.note = "tracking"; return; } // changed this second: let it settle first
      R.note = "tracking";
      const out = Object.assign({ version: R.version, family: R.fam }, s); delete out.clock;
      const j = JSON.stringify(out);
      if (j === lastJson) return;
      lastJson = j;
      parent.postMessage({ source: "pokepc", type: "game-state", state: out }, location.origin);
    } catch (e) { R.note = "error: " + e.message; }
  }
  function reset() { R.ptr = 0; R.sb1 = R.party = R.base = R.gbBase = -1; R.cands = null; R.last = null; lastJson = ""; }

  window.LCReader = {
    /** Call once the game runs, with the game descriptor from lib/achievements (system, gen, version, family, ds). */
    start(game) {
      if (game) {
        R.sys = game.system === "gbc" ? "gb" : game.system; R.gen = game.gen; R.version = game.version; R.fam = game.family || ""; R.ds = game.ds || "";
        setInterval(tick, 1000);
      } else R.note = "this game doesn't have achievements yet";
      setInterval(() => parent.postMessage({ source: "pokepc", type: "reader-status", note: R.note, tracking: R.note === "tracking", supported: !!game }, location.origin), 3000);
    },
    reset,
    _internals: { R, coreState, RAM, gbRead, gbLocate, g3Read, dsRead, dsMon, dsCheck, G1DEX },
  };
})();
