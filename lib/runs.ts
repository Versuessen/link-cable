/*
 * Playthroughs ("runs"): several independent playthroughs of one cartridge, each with its own saves.
 * A run can be Normal, Nuzlocke or Soul Link (2–4 players), optionally randomized.
 *
 * Storage (shared space, so Soul Link partners can read each other):
 *   shared/runs/<id>/meta.json        settings, players, status          (written by the server)
 *   shared/runs/<id>/p-<uid>.json     one player's tracker state         (written only by that player)
 * Splitting per player means two people playing at once never overwrite each other's progress.
 */
import data from "./pokedata.json";
import type { GameInfo } from "./achievements";

export type Mode = "normal" | "nuzlocke" | "soullink";
export type Rules = { dupes: boolean; shiny: boolean; levelCaps: boolean; typeClause: boolean };
export type RandomOpts = { seed: number; wild: "off" | "random" | "similar" | "swap"; trainers: "off" | "random" | "similar"; starters: "off" | "random" | "basic"; legendsInWild: boolean };
export type Player = { uid: string; name: string; color: string; romId?: string; game?: string; joined: boolean };
export type RunMeta = {
  id: string; name: string; mode: Mode; region: string; game: string; createdAt: number; owner: string;
  rules: Rules; random: RandomOpts | null; players: Player[]; status: "active" | "won" | "lost"; endedAt?: number;
};
/** One Pokémon as the tracker knows it. */
export type RunMon = {
  id: string; sp: number; lv: number; area: string; caughtAt: number;
  state: "alive" | "dead" | "extra" | "released"; shiny?: boolean; diedAt?: number; cause?: string; hp?: number; max?: number; inParty?: boolean;
};
export type PlayerState = {
  uid: string; updatedAt: number;
  mons: Record<string, RunMon>;
  /** areas the player marked by hand (encounter fled/fainted before it could be caught) */ failed: Record<string, number>;
  log: { at: number; text: string; kind: "catch" | "death" | "warn" | "info" | "link" }[];
  badges: number; playing?: string;
};
export const emptyState = (uid: string): PlayerState => ({ uid, updatedAt: 0, mons: {}, failed: {}, log: [], badges: 0 });

// ---------------------------------------------------------------- species / names
type Sp = { n: string; t: string[]; b: number; l: number; f: number; c: number };
export const SPECIES = data.species as (Sp | null)[];
const G3 = data.g3 as number[];
/** National Dex number for a species as the reader reports it (Gen 3 party Pokémon use internal numbers). */
export const dexOf = (gen: number, sp: number) => (gen === 3 ? G3[sp] ?? 0 : sp);
export const speciesName = (dex: number) => SPECIES[dex]?.n ?? `#${dex}`;
export const typesOf = (dex: number) => SPECIES[dex]?.t ?? [];
export const spriteUrl = (dex: number) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dex}.png`;

/** Which region a game belongs to: Soul Link partners must play the same region so areas line up. */
export const REGION: Record<string, string> = {
  red: "kanto-rby", blue: "kanto-rby", yellow: "kanto-rby", firered: "kanto-frlg", leafgreen: "kanto-frlg",
  gold: "johto-gsc", silver: "johto-gsc", crystal: "johto-gsc", heartgold: "johto-hgss", soulsilver: "johto-hgss",
  ruby: "hoenn", sapphire: "hoenn", emerald: "hoenn", diamond: "sinnoh", pearl: "sinnoh", platinum: "sinnoh",
  black: "unova", white: "unova", black2: "unova2", white2: "unova2",
};
export const REGION_LABEL: Record<string, string> = {
  "kanto-rby": "Red · Blue · Yellow", "kanto-frlg": "FireRed · LeafGreen", "johto-gsc": "Gold · Silver · Crystal", "johto-hgss": "HeartGold · SoulSilver",
  hoenn: "Ruby · Sapphire · Emerald", sinnoh: "Diamond · Pearl · Platinum", unova: "Black · White", unova2: "Black 2 · White 2",
};

/** The area a Pokémon counts for: where it was caught, or (games that don't record that) where the player was. */
export function areaOf(gen: number, version: string, mon: { met?: number | null }, here?: string | null): string {
  const L = data.loc as Record<string, Record<string, string>>;
  if (gen === 3 && mon.met != null) {
    if (mon.met === 0xFD) return "Egg"; if (mon.met === 0xFE) return "In-game trade"; if (mon.met === 0xFF) return "Gift";
    return L["3"][String(mon.met)] ?? `Area ${mon.met}`;
  }
  if ((gen === 4 || gen === 5) && mon.met) return L[String(gen)][String(mon.met)] ?? `Area ${mon.met}`;
  if (gen === 2 && version === "crystal" && mon.met) { if (mon.met >= 0x7E) return "Gift"; return L["2"][String(mon.met)] ?? `Area ${mon.met}`; }
  if (here) { const [k, v] = here.split(":"); return L[k]?.[v] ?? "Unknown area"; }
  return "Unknown area";
}

// ---------------------------------------------------------------- level caps (the next gym leader's / champion's ace)
const CAPS: Record<string, number[]> = {
  red: [14, 21, 24, 29, 43, 43, 47, 50, 65], blue: [14, 21, 24, 29, 43, 43, 47, 50, 65], yellow: [12, 21, 28, 32, 50, 50, 54, 55, 65],
  firered: [14, 21, 24, 29, 43, 43, 47, 50, 63], leafgreen: [14, 21, 24, 29, 43, 43, 47, 50, 63],
  gold: [9, 16, 20, 25, 30, 35, 31, 40, 50], silver: [9, 16, 20, 25, 30, 35, 31, 40, 50], crystal: [9, 16, 20, 25, 30, 35, 34, 41, 50],
  heartgold: [13, 17, 19, 25, 31, 35, 34, 41, 50], soulsilver: [13, 17, 19, 25, 31, 35, 34, 41, 50],
  ruby: [15, 18, 23, 28, 31, 33, 42, 43, 58], sapphire: [15, 18, 23, 28, 31, 33, 42, 43, 58], emerald: [15, 19, 24, 29, 31, 33, 42, 46, 58],
  diamond: [14, 22, 30, 30, 36, 39, 42, 49, 66], pearl: [14, 22, 30, 30, 36, 39, 42, 49, 66], platinum: [14, 22, 26, 32, 37, 41, 44, 50, 62],
  black: [14, 20, 23, 27, 31, 35, 39, 43, 54], white: [14, 20, 23, 27, 31, 35, 39, 43, 54], black2: [13, 18, 24, 30, 33, 39, 48, 51, 59], white2: [13, 18, 24, 30, 33, 39, 48, 51, 59],
};
/** The level cap for the next fight (by badges held), or null if the game isn't known. */
export const levelCap = (version: string, badges: number) => { const c = CAPS[version]; return c ? c[Math.min(badges, c.length - 1)] : null; };

// ---------------------------------------------------------------- the rules engine
export type Snapshot = { gen: number; version: string; party: { sp: number; lv: number; hp: number; max: number; shiny: boolean; egg: boolean; id?: string; met?: number | null }[]; badges: number; here?: string | null };
export type Alert = { text: string; kind: PlayerState["log"][number]["kind"]; big?: boolean };

/**
 * Fold one reading of the game into the player's tracker state. Returns the new state and what to tell the player.
 * `partners` are the other players' states (Soul Link), used for linked deaths and the type clause.
 */
export function step(meta: RunMeta, me: PlayerState, s: Snapshot, partners: PlayerState[], now = Date.now()): { state: PlayerState; alerts: Alert[] } {
  const st: PlayerState = { ...me, mons: { ...me.mons }, log: [...me.log], badges: s.badges };
  const alerts: Alert[] = [];
  const say = (text: string, kind: Alert["kind"], big = false) => { alerts.push({ text, kind, big }); st.log.push({ at: now, text, kind }); };
  const nuz = meta.mode !== "normal";
  const firstEver = Object.keys(st.mons).length === 0;
  const usedArea = (area: string) => Object.values(st.mons).some((m) => m.area === area && m.state !== "extra") || !!st.failed[area];
  const inParty = new Set<string>();

  for (const p of s.party) {
    if (p.egg || !p.id) continue;
    inParty.add(p.id);
    const dex = dexOf(s.gen, p.sp);
    const known = st.mons[p.id];
    if (!known) {
      const area = firstEver && Object.keys(st.mons).length === 0 ? "Starter" : areaOf(s.gen, s.version, p, s.here);
      let state: RunMon["state"] = "alive";
      if (nuz && area !== "Starter" && usedArea(area) && !(meta.rules.shiny && p.shiny)) {
        state = "extra";
        say(`${speciesName(dex)} was caught in ${area}, but that area was already used. Box or release it.`, "warn", true);
      } else {
        const dupe = meta.rules.dupes && Object.values(st.mons).some((m) => m.state !== "extra" && SPECIES[m.sp]?.c === SPECIES[dex]?.c);
        say(`${speciesName(dex)} joined the team · ${area}${p.shiny ? " · shiny!" : ""}${dupe ? " (a species line you already have — dupes clause would have let you skip it)" : ""}`, "catch");
      }
      st.mons[p.id] = { id: p.id, sp: dex, lv: p.lv, area, caughtAt: now, state, shiny: p.shiny || undefined, hp: p.hp, max: p.max, inParty: true };
      continue;
    }
    const m = { ...known, sp: dex, lv: p.lv, hp: p.hp, max: p.max, inParty: true };
    if (nuz && m.state === "alive" && p.hp === 0) {
      m.state = "dead"; m.diedAt = now; m.cause = "fainted";
      say(`${speciesName(dex)} (${m.area}) fainted. Rest in peace.`, "death", true);
    } else if (nuz && m.state === "dead" && p.hp > 0 && known.hp === 0) {
      say(`${speciesName(dex)} was revived, but it already died. It can't battle again.`, "warn", true);
    }
    st.mons[p.id] = m;
  }
  for (const [id, m] of Object.entries(st.mons)) if (m.inParty && !inParty.has(id)) st.mons[id] = { ...m, inParty: false };

  if (nuz) {
    // level cap: nobody above the next leader's ace
    const cap = meta.rules.levelCaps ? levelCap(s.version, s.badges) : null;
    const over = cap ? s.party.filter((p) => !p.egg && p.lv > cap) : [];
    if (over.length && !me.log.slice(-5).some((l) => l.kind === "warn" && l.text.startsWith("Level cap"))) say(`Level cap is ${cap}: ${over.map((p) => speciesName(dexOf(s.gen, p.sp))).join(", ")} ${over.length > 1 ? "are" : "is"} over it.`, "warn");
    // Soul Link: a partner's death takes the Pokémon from the same area with it
    if (meta.mode === "soullink") for (const other of partners) for (const om of Object.values(other.mons)) {
      if (om.state !== "dead") continue;
      const mine = Object.values(st.mons).find((m) => m.area === om.area && m.state === "alive");
      if (!mine) continue;
      st.mons[mine.id] = { ...mine, state: "dead", diedAt: now, cause: `linked to ${partnerName(meta, other.uid)}'s ${speciesName(om.sp)}` };
      say(`${speciesName(mine.sp)} (${mine.area}) is gone: its partner ${partnerName(meta, other.uid)}'s ${speciesName(om.sp)} fainted. Box or release it.`, "link", true);
    }
    // whole team down
    const team = s.party.filter((p) => !p.egg);
    if (team.length && team.every((p) => p.hp === 0) && !me.log.slice(-3).some((l) => l.text.startsWith("Your whole team"))) say("Your whole team fainted. In a Nuzlocke, that ends the run.", "death", true);
  }
  st.log = st.log.slice(-200);
  st.updatedAt = alerts.length || JSON.stringify(me.mons) !== JSON.stringify(st.mons) ? now : me.updatedAt;
  return { state: st, alerts };
}
export const partnerName = (meta: RunMeta, uid: string) => meta.players.find((p) => p.uid === uid)?.name ?? "partner";

/** Soul Link board: every area anyone has used, with each player's Pokémon there. */
export function links(meta: RunMeta, states: PlayerState[]) {
  const areas = new Map<string, { area: string; at: number; by: Record<string, RunMon | "failed" | undefined> }>();
  for (const s of states) {
    for (const m of Object.values(s.mons)) {
      if (m.state === "extra") continue;
      const a = areas.get(m.area) ?? { area: m.area, at: m.caughtAt, by: {} };
      a.by[s.uid] = m; a.at = Math.min(a.at, m.caughtAt); areas.set(m.area, a);
    }
    for (const [area, at] of Object.entries(s.failed)) {
      const a = areas.get(area) ?? { area, at, by: {} };
      a.by[s.uid] ??= "failed"; areas.set(area, a);
    }
  }
  const list = [...areas.values()].sort((x, y) => x.at - y.at);
  // type clause: linked Pokémon must not share a primary type with another link
  const clash = new Set<string>();
  if (meta.mode === "soullink" && meta.rules.typeClause) {
    const seen = new Map<string, string>();
    for (const l of list) for (const m of Object.values(l.by)) {
      if (!m || m === "failed" || m.state !== "alive") continue;
      const t = typesOf(m.sp)[0], k = `${t}`;
      if (seen.has(k) && seen.get(k) !== l.area) clash.add(l.area); else seen.set(k, l.area);
    }
  }
  return { list, clash };
}

export const DEFAULT_RULES: Rules = { dupes: true, shiny: true, levelCaps: true, typeClause: false };
export const randomizerSupported = (g: GameInfo | null) => !!g && g.gen <= 3;
