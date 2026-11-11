/*
 * Live game-state reader for the achievement system (runs inside player.html, next to the emulator).
 *
 * How it finds the game's memory without any per-language address tables:
 *  1. The cartridge save (SRAM) tells us the trainer's name + ID — 14 bytes that sit at the very start of the
 *     game's "save block 2" structure.
 *  2. Those bytes are searched for in the emulator's memory. Several copies exist (the save file buffer, …);
 *     the live one is the copy whose play-time counter keeps ticking.
 *  3. Everything else (Pokédex, flags, money, party) is found relative to it and validated with the games'
 *     own checksums, so a wrong guess is never read as data.
 *
 * Supported: Generation 3 (Ruby, Sapphire, Emerald, FireRed, LeafGreen), every language.
 * Output: a small plain-object snapshot, posted to the parent page, which decides what is unlocked.
 */
(function () {
  "use strict";

  // ---- per-game layout (offsets inside the two save blocks; identical in every language) ----
  const LAYOUT = {
    E:    { flags: 0x1270, money: 0x490, coins: 0x494, party: 0x234, key: 0xAC,  badge0: 0x867, clear: 0x864, liveParty: -0x568 },
    FRLG: { flags: 0xEE0,  money: 0x290, coins: 0x294, party: 0x034, key: 0xF20, badge0: 0x820, clear: 0x82C, liveParty: -0x304 },
    RS:   { flags: 0x1220, money: 0x490, coins: 0x494, party: 0x234, key: -1,    badge0: 0x807, clear: 0x804, liveParty: null },
  };
  const FAMILY = { BPE: "E", BPR: "FRLG", BPG: "FRLG", AXV: "RS", AXP: "RS" };
  const VERSION = { BPE: "emerald", BPR: "firered", BPG: "leafgreen", AXV: "ruby", AXP: "sapphire" };

  // order of the four 12-byte sub-structures inside a Pokémon, chosen by personality % 24 (G = growth)
  const ORDER = ["GAEM", "GAME", "GEAM", "GEMA", "GMAE", "GMEA", "AGEM", "AGME", "AEGM", "AEMG", "AMGE", "AMEG",
    "EGAM", "EGMA", "EAGM", "EAMG", "EMGA", "EMAG", "MGAE", "MGEA", "MAGE", "MAEG", "MEGA", "MEAG"];

  const u16 = (h, o) => h[o] | (h[o + 1] << 8);
  const u32 = (h, o) => (h[o] | (h[o + 1] << 8) | (h[o + 2] << 16) | (h[o + 3] << 24)) >>> 0;

  /** Decode one 100-byte party Pokémon at `o`; null unless its checksum is right. */
  function readMon(h, o) {
    if (o < 0 || o + 100 > h.length) return null;
    const pid = u32(h, o), ot = u32(h, o + 4);
    if (!pid && !ot) return null;
    const key = (pid ^ ot) >>> 0;
    const d = new Uint8Array(48);
    let sum = 0;
    for (let i = 0; i < 48; i += 4) {
      const v = (u32(h, o + 0x20 + i) ^ key) >>> 0;
      d[i] = v & 255; d[i + 1] = (v >>> 8) & 255; d[i + 2] = (v >>> 16) & 255; d[i + 3] = v >>> 24;
      sum = (sum + (v & 0xFFFF) + (v >>> 16)) & 0xFFFF;
    }
    if (sum !== u16(h, o + 0x1C)) return null;
    const ord = ORDER[pid % 24], g = ord.indexOf("G") * 12, m = ord.indexOf("M") * 12;
    const species = u16(d, g);
    const level = h[o + 0x54];
    if (!species || species > 439 || level > 100) return null;
    const ivs = u32(d, m + 4);
    return {
      pid, sp: species, item: u16(d, g + 2), lv: level, hp: u16(h, o + 0x56), max: u16(h, o + 0x58),
      egg: !!((ivs >>> 30) & 1),
      shiny: (((ot & 0xFFFF) ^ (ot >>> 16) ^ (pid & 0xFFFF) ^ (pid >>> 16)) & 0xFFFF) < 8,
    };
  }
  /** A party: up to six valid Pokémon in a row. */
  function readParty(h, o, max) {
    const out = [];
    for (let i = 0; i < (max || 6); i++) { const m = readMon(h, o + i * 100); if (!m) break; out.push(m); }
    return out;
  }

  /** Newest "save block 2" header (trainer name, gender, ID) in a Gen 3 cartridge save. */
  function trainerSignature(sram) {
    if (!sram || sram.length < 0x20000) return null;
    let best = null, bestIdx = -1;
    for (let s = 0; s < 28; s++) {
      const o = s * 0x1000;
      if (u32(sram, o + 0xFF8) !== 0x08012025 || u16(sram, o + 0xFF4) !== 0) continue;
      const idx = u32(sram, o + 0xFFC);
      if (idx >= bestIdx) { bestIdx = idx; best = sram.slice(o, o + 14); }
    }
    if (!best) return null;
    // a blank name (new file) isn't a usable needle
    if (best.slice(0, 7).every((b) => b === 0 || b === 0xFF)) return null;
    return best;
  }

  function findAll(h, needle, limit) {
    const hits = [], n0 = needle[0], N = needle.length;
    let i = h.indexOf(n0, 0);
    outer: while (i !== -1 && i + N <= h.length) {
      for (let k = 1; k < N; k++) if (h[i + k] !== needle[k]) { i = h.indexOf(n0, i + 1); continue outer; }
      hits.push(i); if (hits.length >= (limit || 64)) break;
      i = h.indexOf(n0, i + 1);
    }
    return hits;
  }

  const R = { fam: null, version: null, lang: "", sig: null, cands: null, sb2: -1, sb1: -1, party: -1, lastTry: 0, note: "starting" };

  function heap() {
    const g = window.EJS_emulator && window.EJS_emulator.gameManager, M = g && g.Module;
    if (!M) return null;
    if (M.HEAPU8 && M.HEAPU8.length) return M.HEAPU8;
    const mem = M.wasmMemory || (M.asm && M.asm.memory) || (M.wasmExports && M.wasmExports.memory);
    return mem ? new Uint8Array(mem.buffer) : null;
  }

  const playBytes = (h, o) => h[o + 0x0E] | (h[o + 0x0F] << 8) | (h[o + 0x10] << 16) | (h[o + 0x11] << 24) | 0;
  const ticks = (h, o) => `${playBytes(h, o)}:${h[o + 0x12]}`;

  /** Step 1+2: find the live save block 2. Spread over several calls (needs two looks, a moment apart). */
  function locate(h) {
    const now = Date.now();
    if (!R.sig) {
      if (now - R.lastTry < 8000) return;
      R.lastTry = now;
      let sram = null;
      try { sram = window.EJS_emulator.gameManager.getSaveFile(); } catch (e) {}
      R.sig = trainerSignature(sram);
      R.note = R.sig ? "searching" : "waiting for the first in-game save";
      if (!R.sig) return;
    }
    if (!R.cands) {
      if (now - R.lastTry < 1500 && R.note !== "searching") return;
      R.lastTry = now;
      const hits = findAll(h, R.sig, 200);
      R.cands = hits.map((o) => ({ o, t: ticks(h, o) }));
      R.note = hits.length ? "checking " + hits.length + " copies" : "trainer not found in memory yet";
      if (!hits.length) R.cands = null;
      return;
    }
    const live = R.cands.filter((c) => c.o + 0x100 < h.length && ticks(h, c.o) !== c.t && findAll(h.subarray(c.o, c.o + 14), R.sig, 1).length);
    if (live.length) { R.sb2 = live[0].o; R.note = "tracking"; R.cands = null; locateRest(h); }
    else if (now - R.lastTry > 6000) { R.cands = null; R.note = "game paused or not in the overworld yet"; } // look again from scratch
  }

  /** Step 3: save block 1 and the live party, both found by checksum-validated search around save block 2. */
  function locateRest(h) {
    const L = LAYOUT[R.fam], b2 = R.sb2;
    R.sb1 = -1; R.party = -1;
    // save block 1 comes after save block 2; its saved copy of the party proves the spot
    for (let d = 0x400; d <= 0x3000; d += 4) {
      const o = b2 + d, n = u32(h, o + L.party);
      if (n < 1 || n > 6) continue;
      if (readParty(h, o + L.party + 4, 6).length !== n) continue;
      if (h[o + 4] > 60) continue; // map group
      R.sb1 = o; break;
    }
    // live party: prefer the known spot, else the nearby run of valid Pokémon that best matches the saved party
    const saved = R.sb1 >= 0 ? readParty(h, R.sb1 + L.party + 4, 6).map((m) => m.pid) : [];
    const copyAt = R.sb1 >= 0 ? R.sb1 + L.party + 4 : -1;
    if (L.liveParty != null && readParty(h, b2 + L.liveParty, 1).length) R.party = b2 + L.liveParty;
    else {
      let best = -1, score = 0;
      for (let o = Math.max(0, b2 - 0x3000); o < b2 + 0x400; o += 4) {
        if (o === copyAt) continue;
        const p = readParty(h, o, 6);
        if (!p.length) continue;
        const s = p.filter((m) => saved.includes(m.pid)).length;
        if (s > score) { score = s; best = o; }
        o += p.length * 100 - 4;
      }
      if (best >= 0) R.party = best;
    }
  }

  function snapshot(h) {
    const L = LAYOUT[R.fam], b2 = R.sb2, b1 = R.sb1;
    // still the same trainer at that spot? (a loaded state can move things)
    for (let k = 0; k < 14; k++) if (h[b2 + k] !== R.sig[k]) { R.sb2 = -1; R.cands = null; R.note = "re-locating"; return null; }
    const owned = [], seenBits = h.subarray(b2 + 0x5C, b2 + 0x5C + 52);
    let seen = 0;
    for (let i = 0; i < 412; i++) {
      if (h[b2 + 0x28 + (i >> 3)] & (1 << (i & 7))) owned.push(i + 1);
      if (seenBits[i >> 3] & (1 << (i & 7))) seen++;
    }
    const s = {
      gen: 3, family: R.fam, version: R.version, lang: R.lang,
      playSeconds: u16(h, b2 + 0x0E) * 3600 + h[b2 + 0x10] * 60 + h[b2 + 0x11],
      owned, seen, badges: 0, badgeBits: 0, champion: false, money: null, coins: null, party: [], partyLive: false, map: null,
    };
    if (b1 >= 0) {
      const flag = (id) => !!(h[b1 + L.flags + (id >> 3)] & (1 << (id & 7)));
      for (let i = 0; i < 8; i++) if (flag(L.badge0 + i)) { s.badges++; s.badgeBits |= 1 << i; }
      s.champion = flag(L.clear);
      const key = L.key >= 0 ? u32(h, b2 + L.key) : 0;
      const money = (u32(h, b1 + L.money) ^ key) >>> 0, coins = (u16(h, b1 + L.coins) ^ (key & 0xFFFF)) & 0xFFFF;
      if (money <= 999999) s.money = money;
      if (coins <= 9999) s.coins = coins;
      s.map = [h[b1 + 4], h[b1 + 5]];
      let party = R.party >= 0 ? readParty(h, R.party, 6) : [];
      s.partyLive = party.length > 0;
      if (!party.length) party = readParty(h, b1 + L.party + 4, Math.min(6, u32(h, b1 + L.party)));
      s.party = party.map((m) => ({ sp: m.sp, lv: m.lv, hp: m.hp, max: m.max, shiny: m.shiny, egg: m.egg, item: m.item }));
    }
    return s;
  }

  let lastJson = "";
  function tick() {
    try {
      if (!R.fam || !window.EJS_emulator || window.EJS_emulator.paused) return;
      const h = heap();
      if (!h) { R.note = "emulator memory not available"; return; }
      if (R.sb2 < 0) { locate(h); if (R.sb2 < 0) return; }
      const s = snapshot(h);
      if (!s) return;
      const j = JSON.stringify(s);
      if (j === lastJson) return;
      lastJson = j;
      parent.postMessage({ source: "pokepc", type: "game-state", state: s }, location.origin);
    } catch (e) { R.note = "error: " + e.message; }
  }

  window.LCReader = {
    /** Call once the game runs. `code` is the 4-letter cartridge code from the ROM header (e.g. BPEE). */
    start(code) {
      const c = String(code || "").toUpperCase();
      R.fam = FAMILY[c.slice(0, 3)] || null;
      R.version = VERSION[c.slice(0, 3)] || null;
      R.lang = c[3] || "";
      R.note = R.fam ? "starting" : "this game isn't supported yet";
      if (R.fam) setInterval(tick, 1000);
      setInterval(() => parent.postMessage({ source: "pokepc", type: "reader-status", note: R.note, tracking: R.sb2 >= 0, supported: !!R.fam, sb1: R.sb1 >= 0, liveParty: R.party >= 0 }, location.origin), 3000);
    },
    /** After a state / save is loaded, memory may have changed under us. */
    reset() { R.sig = null; R.cands = null; R.sb2 = R.sb1 = R.party = -1; R.lastTry = 0; lastJson = ""; },
    _internals: { readMon, readParty, trainerSignature, findAll, R },
  };
})();
