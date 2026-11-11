/*
 * Live game-state reader for the achievement system (runs inside player.html, next to the emulator).
 *
 * Approach (adapted from how RetroAchievements' rcheevos reads GBA games, MIT licence):
 *  - Memory comes from the core's own snapshot of the console, not from guessing inside the emulator process.
 *    Once a second we take a save state (≈3 ms) and use the GBA work RAM inside it:
 *      IWRAM  0x03000000–0x03007FFF   (state + 0x19000)
 *      EWRAM  0x02000000–0x0203FFFF   (state + 0x21000)
 *    i.e. the same two regions rcheevos maps for the GBA, addressed by their real console addresses.
 *  - Emerald, FireRed and LeafGreen move their save data around in RAM on every map change (an anti-cheat
 *    measure). Like the achievement sets on RetroAchievements, we never remember where the data *was*:
 *    we follow the game's own pointers (gSaveBlock1Ptr / gSaveBlock2Ptr in IWRAM) every time we read.
 *    Our version finds those pointers itself, so every language and revision works without address tables.
 *  - Every snapshot passes sanity checks before it is used (the trainer is the one from the cartridge save,
 *    the clock is running, the Pokédex is consistent, …) and must look the same twice in a row.
 *    Anything doubtful is dropped rather than reported.
 */
(function () {
  "use strict";

  const EW = 0x02000000, IW = 0x03000000, EW_SIZE = 0x40000, IW_SIZE = 0x8000;

  // offsets inside the save blocks; identical across languages
  const LAYOUT = {
    E:    { flags: 0x1270, money: 0x490, coins: 0x494, party: 0x234, key: 0xAC,  badge0: 0x867, clear: 0x864, moves: true },
    FRLG: { flags: 0xEE0,  money: 0x290, coins: 0x294, party: 0x034, key: 0xF20, badge0: 0x820, clear: 0x82C, moves: true },
    RS:   { flags: 0x1220, money: 0x490, coins: 0x494, party: 0x234, key: -1,    badge0: 0x807, clear: 0x804, moves: false },
  };
  const FAMILY = { BPE: "E", BPR: "FRLG", BPG: "FRLG", AXV: "RS", AXP: "RS" };
  const VERSION = { BPE: "emerald", BPR: "firered", BPG: "leafgreen", AXV: "ruby", AXP: "sapphire" };
  const DEX = 386; // National Pokédex size in Gen 3

  const ORDER = ["GAEM", "GAME", "GEAM", "GEMA", "GMAE", "GMEA", "AGEM", "AGME", "AEGM", "AEMG", "AMGE", "AMEG",
    "EGAM", "EGMA", "EAGM", "EAMG", "EMGA", "EMAG", "MGAE", "MGEA", "MAGE", "MAEG", "MEGA", "MEAG"];

  const u16 = (h, o) => h[o] | (h[o + 1] << 8);
  const u32 = (h, o) => (h[o] | (h[o + 1] << 8) | (h[o + 2] << 16) | (h[o + 3] << 24)) >>> 0;

  // ---------------------------------------------------------------- console memory (rcheevos-style map)
  let ew = null, iw = null;
  /** Take a fresh snapshot of the GBA's work RAM. Returns false if the core's state isn't the expected mGBA layout. */
  function snapshotRam() {
    const s = window.EJS_emulator.gameManager.getState();
    if (!s || s.length < 0x61000) return false;
    // RetroArch wraps the core's state in "RASTATE" blocks; the core data follows the "MEM " block header
    let base = 0;
    if (s[0] === 0x52 && s[1] === 0x41 && s[2] === 0x53 && s[3] === 0x54) { // "RAST"
      base = -1;
      for (let o = 8; o < 64; o += 4) if (s[o] === 0x4D && s[o + 1] === 0x45 && s[o + 2] === 0x4D && s[o + 3] === 0x20) { base = o + 8; break; }
      if (base < 0) return false;
    }
    if (s.length < base + 0x61000) return false;
    iw = s.subarray(base + 0x19000, base + 0x19000 + IW_SIZE);
    ew = s.subarray(base + 0x21000, base + 0x21000 + EW_SIZE);
    return true;
  }
  /** Console address → [buffer, offset], or null outside work RAM. */
  function at(addr) {
    if (addr >= EW && addr + 4 <= EW + EW_SIZE) return [ew, addr - EW];
    if (addr >= IW && addr + 4 <= IW + IW_SIZE) return [iw, addr - IW];
    return null;
  }

  // ---------------------------------------------------------------- Pokémon data
  function readMon(h, o) {
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
    const species = u16(d, g), level = h[o + 0x54], hp = u16(h, o + 0x56), max = u16(h, o + 0x58);
    if (!species || species > 439 || level < 1 || level > 100 || hp > max || max > 999) return null;
    const ivs = u32(d, m + 4);
    return {
      pid, sp: species, item: u16(d, g + 2), lv: level, hp, max, egg: !!((ivs >>> 30) & 1),
      shiny: (((ot & 0xFFFF) ^ (ot >>> 16) ^ (pid & 0xFFFF) ^ (pid >>> 16)) & 0xFFFF) < 8,
    };
  }
  /** Exactly `n` valid Pokémon in a row, or null. */
  function readParty(h, o, n) {
    const out = [];
    for (let i = 0; i < n; i++) { const m = readMon(h, o + i * 100); if (!m) return null; out.push(m); }
    return out;
  }
  /** As many valid Pokémon in a row as there are (up to six): the live party can differ from the saved one. */
  function readRun(h, o) {
    const out = [];
    for (let i = 0; i < 6; i++) { const m = readMon(h, o + i * 100); if (!m) break; out.push(m); }
    return out;
  }

  /** Trainer name, gender and ID from the newest save of "save block 2" in the cartridge save. */
  function trainerSignature(sram) {
    if (!sram || sram.length < 0x20000) return null;
    let best = null, bestIdx = -1;
    for (let s = 0; s < 32; s++) {
      const o = s * 0x1000;
      if (u32(sram, o + 0xFF8) !== 0x08012025 || u16(sram, o + 0xFF4) !== 0) continue;
      const idx = u32(sram, o + 0xFFC);
      if (idx >= bestIdx) { bestIdx = idx; best = sram.slice(o, o + 14); }
    }
    if (!best || best.slice(0, 7).every((b) => b === 0 || b === 0xFF)) return null;
    return best;
  }
  function findAll(h, needle, from, to, step) {
    const hits = [];
    for (let i = from; i + needle.length <= to; i += step) {
      let k = 0; while (k < needle.length && h[i + k] === needle[k]) k++;
      if (k === needle.length) hits.push(i);
    }
    return hits;
  }
  const sigAt = (o) => { for (let k = 0; k < 14; k++) if (ew[o + k] !== R.sig[k]) return false; return true; };

  // ---------------------------------------------------------------- locating the game's data
  const R = { fam: null, version: null, lang: "", sig: null, ptr2: 0, ptr1: 0, sb2: -1, sb1: -1, party: -1, lastSig: 0, note: "starting", last: null, stable: null };

  /** Emerald / FireRed / LeafGreen: find gSaveBlock2Ptr (and gSaveBlock1Ptr right before it) in IWRAM. */
  function findPointers() {
    const hits = findAll(ew, R.sig, 0, EW_SIZE, 4);
    for (const o of hits) {
      const addr = EW + o;
      for (let p = 4; p + 4 <= IW_SIZE; p += 4) {
        if (u32(iw, p) !== addr) continue;
        const sb1 = u32(iw, p - 4);
        if (sb1 < EW || sb1 >= EW + EW_SIZE) continue;
        if (validSb1(sb1 - EW)) { R.ptr2 = IW + p; R.ptr1 = IW + p - 4; return true; }
      }
    }
    return false;
  }
  /** Save block 1 holds a copy of the party with a count in front: both must check out. */
  function validSb1(o) {
    const L = LAYOUT[R.fam];
    if (o < 0 || o + 0x3D00 > EW_SIZE) return false;
    const n = u32(ew, o + L.party);
    if (n < 1 || n > 6) return false;
    return !!readParty(ew, o + L.party + 4, n);
  }
  /** Ruby / Sapphire don't move their data: find it once by the trainer and the saved party. */
  function findStatic() {
    const hits = findAll(ew, R.sig, 0, EW_SIZE, 4);
    for (const o of hits) for (let d = 0x400; d <= 0x3000; d += 4) if (validSb1(o + d)) { R.sb2 = o; R.sb1 = o + d; return true; }
    return false;
  }
  /** The live party (changes in battle) sits at a fixed spot; it's the run of Pokémon that matches the saved party. */
  function findLiveParty() {
    const L = LAYOUT[R.fam], n = u32(ew, R.sb1 + L.party), saved = readParty(ew, R.sb1 + L.party + 4, n);
    if (!saved) return;
    const pid0 = saved[0].pid, copy = R.sb1 + L.party + 4;
    for (let o = 0; o + 100 <= EW_SIZE; o += 4) {
      if (o === copy || u32(ew, o) !== pid0) continue;
      const p = readParty(ew, o, 1);
      if (p && Math.abs(o - copy) > 600) { R.party = o; return; }
    }
  }

  function locate() {
    const now = Date.now();
    if (!R.sig || now - R.lastSig > 30000) {
      R.lastSig = now;
      let sram = null;
      try { sram = window.EJS_emulator.gameManager.getSaveFile(); } catch (e) {}
      const sig = trainerSignature(sram);
      if (sig && R.sig && sig.some((b, i) => b !== R.sig[i])) reset(); // a different trainer (new game)
      R.sig = sig;
    }
    if (!R.sig) { R.note = "waiting for the first in-game save"; return false; }
    if (LAYOUT[R.fam].moves) {
      if (!R.ptr2 && !findPointers()) { R.note = "trainer not in memory yet"; return false; }
      const p2 = at(R.ptr2), p1 = at(R.ptr1);
      R.sb2 = u32(p2[0], p2[1]) - EW; R.sb1 = u32(p1[0], p1[1]) - EW;
      if (R.sb2 < 0 || R.sb2 >= EW_SIZE || !sigAt(R.sb2) || !validSb1(R.sb1)) { R.ptr2 = 0; R.note = "title screen or loading"; return false; }
    } else {
      if (R.sb2 < 0 && !findStatic()) { R.note = "trainer not in memory yet"; return false; }
      if (!sigAt(R.sb2) || !validSb1(R.sb1)) { R.sb2 = R.sb1 = -1; R.note = "title screen or loading"; return false; }
    }
    if (R.party < 0) findLiveParty();
    return true;
  }

  // ---------------------------------------------------------------- one validated reading
  function read() {
    const L = LAYOUT[R.fam], b2 = R.sb2, b1 = R.sb1;
    const owned = [];
    let seen = 0;
    for (let i = 0; i < 52 * 8; i++) {
      const o = ew[b2 + 0x28 + (i >> 3)] & (1 << (i & 7)), s = ew[b2 + 0x5C + (i >> 3)] & (1 << (i & 7));
      if (i >= DEX && (o || s)) return { bad: "Pokédex data out of range" };
      if (o && !s) return { bad: "Pokédex owned/seen mismatch" }; // you can't own what you haven't seen
      if (o) owned.push(i + 1);
      if (s) seen++;
    }
    const flag = (id) => !!(ew[b1 + L.flags + (id >> 3)] & (1 << (id & 7)));
    let badges = 0, badgeBits = 0;
    for (let i = 0; i < 8; i++) if (flag(L.badge0 + i)) { badges++; badgeBits |= 1 << i; }
    const key = L.key >= 0 ? u32(ew, b2 + L.key) : 0;
    const money = (u32(ew, b1 + L.money) ^ key) >>> 0, coins = (u16(ew, b1 + L.coins) ^ (key & 0xFFFF)) & 0xFFFF;
    if (money > 999999 || coins > 9999) return { bad: "money out of range" };
    const savedN = u32(ew, b1 + L.party);
    let party = R.party >= 0 ? readRun(ew, R.party) : null;
    if (party && !party.length) party = null;
    const partyLive = !!party;
    if (!party) party = readParty(ew, b1 + L.party + 4, savedN) || [];
    return {
      gen: 3, family: R.fam, version: R.version, lang: R.lang,
      playSeconds: u16(ew, b2 + 0x0E) * 3600 + ew[b2 + 0x10] * 60 + ew[b2 + 0x11],
      clock: ew[b2 + 0x12],
      owned, seen, badges, badgeBits, champion: flag(L.clear), money, coins,
      party: party.map((m) => ({ sp: m.sp, lv: m.lv, hp: m.hp, max: m.max, shiny: m.shiny, egg: m.egg, item: m.item })),
      partyLive, map: [ew[b1 + 4], ew[b1 + 5]],
    };
  }

  /** The parts of a reading that must agree twice in a row before anything is reported. */
  const core = (s) => `${s.owned.length}|${s.seen}|${s.badgeBits}|${s.champion}|${s.money}|${s.party.map((m) => m.sp + ":" + m.lv).join(",")}`;

  let lastJson = "";
  function tick() {
    try {
      const E = window.EJS_emulator;
      if (!R.fam || !E || E.paused || !E.gameManager) return;
      if (!snapshotRam()) { R.note = "this emulator core isn't supported for achievements"; return; }
      if (!locate()) { R.last = null; return; }
      const s = read();
      if (s.bad) { R.note = "skipped a bad reading: " + s.bad; R.ptr2 = 0; R.sb2 = R.sb1 = -1; R.last = null; return; }
      // the game's clock must be running (frozen = menu/transition/stale data); compare with the last reading
      const prev = R.last;
      R.last = s;
      if (!prev || (prev.clock === s.clock && prev.playSeconds === s.playSeconds)) { R.note = "waiting for the game clock"; return; }
      if (core(prev) !== core(s)) { R.note = "tracking"; return; } // changed this second: wait for it to settle
      R.note = "tracking";
      const out = Object.assign({}, s); delete out.clock;
      const j = JSON.stringify(out);
      if (j === lastJson) return;
      lastJson = j;
      parent.postMessage({ source: "pokepc", type: "game-state", state: out }, location.origin);
    } catch (e) { R.note = "error: " + e.message; }
  }

  function reset() { R.ptr2 = R.ptr1 = 0; R.sb2 = R.sb1 = R.party = -1; R.last = null; lastJson = ""; }

  window.LCReader = {
    /** Call once the game runs. `code` is the cartridge's 4-letter game code from its header (e.g. BPEE). */
    start(code) {
      const c = String(code || "").toUpperCase();
      R.fam = FAMILY[c.slice(0, 3)] || null;
      R.version = VERSION[c.slice(0, 3)] || null;
      R.lang = c[3] || "";
      R.note = R.fam ? "starting" : "this game isn't supported yet";
      if (R.fam) setInterval(tick, 1000);
      setInterval(() => parent.postMessage({ source: "pokepc", type: "reader-status", note: R.note, tracking: R.note === "tracking", supported: !!R.fam }, location.origin), 3000);
    },
    /** After a state / cloud save is loaded, start over (it may be a different point in time or trainer). */
    reset() { reset(); R.sig = null; R.lastSig = 0; },
    _internals: { readMon, readParty, trainerSignature, R, at, snapshotRam },
  };
})();
