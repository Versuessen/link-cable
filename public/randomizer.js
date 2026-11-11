/*
 * In-browser Pokémon randomizer (runs in player.html before the emulator boots).
 *
 * Deterministic: the same ROM + options + seed always gives the same game, so a randomized playthrough can be
 * rebuilt on any device instead of storing a second copy of the ROM.
 * Tables are found by their structure (validated record by record), not by version-specific addresses, so
 * every language works. If a table can't be identified with confidence, that part is left untouched.
 *
 *   Gen 3  wild encounters (gWildMonHeaders → land/water/rock smash/fishing tables), trainer parties (gTrainers),
 *          starters (Ruby/Sapphire/Emerald starter table; FireRed/LeafGreen Oak's lab script)
 *   Gen 1  wild encounters (grass + water tables)
 *   Gen 2  wild encounters (grass tables: morning/day/night)
 */
(function () {
  "use strict";
  const G1DEX = [0,112,115,32,35,21,100,34,80,2,103,108,102,88,94,29,31,104,111,131,59,151,130,90,72,92,123,120,9,127,114,0,0,58,95,22,16,79,64,75,113,67,122,106,107,24,47,54,96,76,0,126,0,125,82,109,0,56,86,50,128,0,0,0,83,48,149,0,0,0,84,60,124,146,144,145,132,52,98,0,0,0,37,38,25,26,0,0,147,148,140,141,116,117,0,0,27,28,138,139,39,40,133,136,135,134,66,41,23,46,61,62,13,14,15,0,85,57,51,49,87,0,0,10,11,12,68,0,55,97,42,150,143,129,0,0,89,0,99,91,0,101,36,110,53,105,0,93,63,65,17,18,121,1,3,73,0,118,119,0,0,0,0,77,78,19,20,33,30,74,137,142,0,81,0,0,4,7,5,8,6,0,0,0,0,43,44,45,69,70,71];

  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return { next, pick: (arr) => arr[Math.floor(next() * arr.length)], shuffle: (arr) => { const a2 = arr.slice(); for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; } return a2; } };
  }
  const u16 = (h, o) => h[o] | (h[o + 1] << 8);
  const u32 = (h, o) => (h[o] | (h[o + 1] << 8) | (h[o + 2] << 16) | (h[o + 3] << 24)) >>> 0;
  const w16 = (h, o, v) => { h[o] = v & 255; h[o + 1] = (v >> 8) & 255; };

  /**
   * Species chooser. Works in National Dex numbers; `toGame`/`fromGame` convert to the game's own numbering.
   * mode: "random" (any), "similar" (base stat total within ±10 %), "swap" (one fixed replacement per species).
   */
  function chooser(R, D, dexMax, mode, allowLegends) {
    const pool = []; for (let d = 1; d <= dexMax; d++) if (D.species[d] && (allowLegends || !D.species[d].l)) pool.push(d);
    const swap = new Map();
    if (mode === "swap") { const sh = R.shuffle(pool); pool.forEach((d, i) => swap.set(d, sh[i])); }
    return (dex) => {
      if (mode === "swap") return swap.get(dex) ?? R.pick(pool);
      if (mode === "similar" && D.species[dex]) {
        const b = D.species[dex].b;
        for (let tol = 0.1; tol < 1; tol += 0.1) { const c = pool.filter((x) => Math.abs(D.species[x].b - b) <= b * tol); if (c.length >= 6) return R.pick(c); }
      }
      return R.pick(pool);
    };
  }
  const isBasic3 = (D, d) => { const s = D.species; if (!s[d] || s[d].f || s[d].l) return false; const mid = s.findIndex((x) => x && x.f === d); return mid > 0 && s.some((x) => x && x.f === mid); };

  // ================================================================ Gen 3
  function gen3(rom, game, o, D, R, log) {
    const N = rom.length, ptr = (p) => { const v = u32(rom, p); return (v >>> 25) === 4 && (v & 0x1FFFFFF) < N ? v & 0x1FFFFFF : -1; }; // 0x08xxxxxx
    const toDex = (sp) => D.g3[sp] || 0;
    const fromDex = new Map(); D.g3.forEach((d, i) => { if (d && !fromDex.has(d)) fromDex.set(d, i); });
    const validSp = (sp) => sp >= 1 && sp <= 411 && !!toDex(sp);

    // ---- wild encounters
    if (o.wild !== "off") {
      const pick = chooser(R, D, 386, o.wild, o.legendsInWild);
      const SIZES = [12, 5, 5, 10]; // land, water, rock smash, fishing
      const infoOk = (q, n) => {
        if (q < 0 || q + 8 > N || rom[q] > 100 || rom[q + 1] | rom[q + 2] | rom[q + 3]) return -1;
        const t = ptr(q + 4); if (t < 0 || t + n * 4 > N) return -1;
        for (let i = 0; i < n; i++) { const a = t + i * 4; if (!rom[a] || rom[a] > rom[a + 1] || rom[a + 1] > 100 || !validSp(u16(rom, a + 2))) return -1; }
        return t;
      };
      const headerOk = (h) => {
        if (h + 20 > N || rom[h] > 60 || rom[h + 1] > 120 || rom[h + 2] | rom[h + 3]) return null;
        const out = []; let any = false;
        for (let k = 0; k < 4; k++) { const v = u32(rom, h + 4 + k * 4); if (!v) { out.push(-1); continue; } const t = infoOk(ptr(h + 4 + k * 4), SIZES[k]); if (t < 0) return null; out.push(t); any = true; }
        return any ? out : null;
      };
      let best = { at: -1, n: 0 };
      for (let h = 0; h + 20 <= N; h += 4) {
        if (!headerOk(h)) continue;
        let n = 0; while (headerOk(h + n * 20)) n++;
        if (n > best.n) best = { at: h, n };
        h += n * 20 - 4;
      }
      if (best.n >= 40) {
        const done = new Set(); let slots = 0;
        for (let i = 0; i < best.n; i++) headerOk(best.at + i * 20).forEach((t, k) => {
          if (t < 0 || done.has(t)) return; done.add(t);
          for (let j = 0; j < SIZES[k]; j++) { const a = t + j * 4 + 2; w16(rom, a, fromDex.get(pick(toDex(u16(rom, a)))) ?? u16(rom, a)); slots++; }
        });
        log.push(`Wild Pokémon: ${best.n} areas, ${slots} encounter slots randomized`);
      } else log.push("Wild Pokémon: table not found, left unchanged");
    }

    // ---- trainer parties
    if (o.trainers !== "off") {
      const pick = chooser(R, D, 386, o.trainers === "similar" ? "similar" : "random", false);
      const rec = (t) => { // struct Trainer, 40 bytes
        if (t + 40 > N || rom[t] > 3) return null;
        const size = rom[t + 0x20]; if (size > 6 || rom[t + 0x21] | rom[t + 0x22] | rom[t + 0x23]) return null;
        let end = -1; for (let i = 0; i < 12; i++) if (rom[t + 4 + i] === 0xFF) { end = i; break; }
        if (end < 0 || (size && end < 1)) return null;
        if (!size) return { size: 0 };
        const p = ptr(t + 0x24), stride = [8, 14, 8, 16][rom[t]]; // party structs: plain / custom moves / held item / both
        if (p < 0 || p + size * stride > N) return null;
        for (let i = 0; i < size; i++) { const m = p + i * stride; if (!rom[m + 2] || rom[m + 2] > 100 || !validSp(u16(rom, m + 4))) return null; }
        return { size, p, stride };
      };
      let best = { at: -1, n: 0 };
      for (let t = 0; t + 40 <= N; t += 4) {
        if (!rec(t)) continue;
        let n = 0; while (rec(t + n * 40)) n++;
        if (n > best.n) best = { at: t, n };
        t += n * 40 - 4;
      }
      if (best.n >= 200) {
        const done = new Set(); let mons = 0;
        for (let i = 0; i < best.n; i++) {
          const r = rec(best.at + i * 40); if (!r.size || done.has(r.p)) continue; done.add(r.p);
          for (let j = 0; j < r.size; j++) { const a = r.p + j * r.stride + 4; w16(rom, a, fromDex.get(pick(toDex(u16(rom, a)))) ?? u16(rom, a)); mons++; }
        }
        log.push(`Trainers: ${best.n} trainers, ${mons} Pokémon randomized`);
      } else log.push("Trainers: table not found, left unchanged");
    }

    // ---- starters
    if (o.starters !== "off") {
      const pool = []; for (let d = 1; d <= 386; d++) if (D.species[d] && !D.species[d].l && (o.starters !== "basic" || isBasic3(D, d))) pool.push(d);
      const three = R.shuffle(pool).slice(0, 3);
      const vanilla = game.family === "FRLG" ? [1, 4, 7] : [252, 255, 258];
      const internal = vanilla.map((d) => fromDex.get(d));
      let changed = 0;
      if (game.family !== "FRLG") { // Ruby/Sapphire/Emerald: a 3-entry starter table
        for (let a = 0; a + 6 <= N; a += 2) if (u16(rom, a) === internal[0] && u16(rom, a + 2) === internal[1] && u16(rom, a + 4) === internal[2]) {
          three.forEach((d, i) => w16(rom, a + i * 2, fromDex.get(d))); changed++;
        }
      } else { // FireRed/LeafGreen: Oak's lab script (setvar/givemon/showmonpic with each starter, close together)
        const hits = [0, 1, 2].map((i) => { const s = internal[i], out = [];
          for (let a = 0; a + 5 <= N; a++) {
            if (rom[a] === 0x16 && rom[a + 2] === 0x40 && u16(rom, a + 3) === s) out.push(a + 3);       // setvar VAR_TEMP_x, species
            else if (rom[a] === 0x75 && u16(rom, a + 1) === s && rom[a + 3] < 32 && rom[a + 4] < 32) out.push(a + 1); // showmonpic species, x, y
          }
          return out; });
        // keep only hits that sit in one script region with the other two starters
        const near = (a, list) => list.some((b) => Math.abs(a - b) < 0x1000);
        hits.forEach((list, i) => list.filter((a) => near(a, hits[(i + 1) % 3]) && near(a, hits[(i + 2) % 3])).forEach((a) => { w16(rom, a, fromDex.get(three[i])); changed++; }));
      }
      log.push(changed ? `Starters: ${three.map((d) => D.species[d].n).join(", ")}` : "Starters: not found in this version, left unchanged");
    }
  }

  // ================================================================ Gen 1 / Gen 2 (wild encounters)
  function gen1(rom, o, D, R, log) {
    if (o.wild === "off") return;
    const fromDex = new Map(); G1DEX.forEach((d, i) => { if (d && !fromDex.has(d)) fromDex.set(d, i); });
    const pick = chooser(R, D, 151, o.wild, o.legendsInWild);
    const block = (a) => { // rate, then 10 × (level, internal species)
      if (a + 21 > rom.length || !rom[a] || rom[a] > 60) return false;
      for (let i = 0; i < 10; i++) { const l = rom[a + 1 + i * 2], s = rom[a + 2 + i * 2]; if (l < 2 || l > 70 || !G1DEX[s]) return false; }
      return true;
    };
    const found = []; for (let a = 0x4000; a + 21 <= rom.length; a++) if (block(a)) { found.push(a); a += 20; }
    if (found.length < 25) { log.push("Wild Pokémon: table not found, left unchanged"); return; }
    for (const a of found) for (let i = 0; i < 10; i++) { const p = a + 2 + i * 2; rom[p] = fromDex.get(pick(G1DEX[rom[p]])) ?? rom[p]; }
    log.push(`Wild Pokémon: ${found.length} tables randomized`);
  }
  function gen2(rom, o, D, R, log) {
    if (o.wild === "off") return;
    const pick = chooser(R, D, 251, o.wild, o.legendsInWild);
    const grass = (a) => { // map group, map number, 3 rates (%), then 3 × 7 × (level, species)
      if (a + 47 > rom.length || !rom[a] || rom[a] > 26 || !rom[a + 1] || rom[a + 1] > 120) return false;
      for (let i = 2; i < 5; i++) if (!rom[a + i] || rom[a + i] > 100) return false;
      for (let i = 0; i < 21; i++) { const l = rom[a + 5 + i * 2], s = rom[a + 6 + i * 2]; if (l < 2 || l > 100 || !s || s > 251) return false; }
      return true;
    };
    const found = []; for (let a = 0x4000; a + 47 <= rom.length; a++) if (grass(a)) { found.push(a); a += 46; }
    if (found.length < 20) { log.push("Wild Pokémon: table not found, left unchanged"); return; }
    for (const a of found) for (let i = 0; i < 21; i++) { const p = a + 6 + i * 2; rom[p] = pick(rom[p]); }
    log.push(`Wild Pokémon (grass): ${found.length} areas randomized`);
  }

  window.LCRandomizer = {
    /** Randomize a copy of `rom` (Uint8Array). Returns { rom, log }. */
    apply(romIn, game, opts, data) {
      const rom = new Uint8Array(romIn), log = [], R = rng(opts.seed);
      if (game.gen === 3) gen3(rom, game, opts, data, R, log);
      else if (game.gen === 1) gen1(rom, opts, data, R, log);
      else if (game.gen === 2) gen2(rom, opts, data, R, log);
      else log.push("This game can't be randomized yet");
      return { rom, log };
    },
  };
})();
