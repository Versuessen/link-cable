/*
 * PTR / Labs — profile progression.
 *
 *  XP  ← play time (2 XP / minute) + achievement steps (Bronze 150 · Silver 400 · Gold 1000)
 *  Lv  ← XP on a gentle curve (Lv 10 ≈ a weekend, Lv 50 ≈ a long-term main game, Lv 100 ≈ years)
 *  Frame tier ← level: each tier is a different *material* with its own ornament + animation,
 *               so going up a tier changes the object, not just its colour.
 *  Badges ← achievement families with Earned (colour) / Silver / Gold steps; you equip ONE.
 */

// ---------------------------------------------------------------- frames
/*
 * Classic-Overwatch-style borders. Account level runs 0 → 999.
 * Each colour tier is split into 5 stages:  plain → 1 pip → 2 pips → 3 pips → star.
 * Then the next tier (new material) starts plain again. Level 999 adds the crown + sparkles.
 */
export type GemCut = "button" | "round" | "cushion" | "emerald" | "oval" | "hex" | "brilliant" | "marquise" | "kite";
export type FrameTier = {
  id: string; name: string; level: number; material: string; blurb: string;
  extras: ("shell" | "ticks" | "beads" | "foil" | "facets")[];
  motion: "none" | "glint" | "sweep" | "holo" | "prism";
  /** shape of the progression gems on this tier */
  gem: GemCut;
};
export const MAX_LEVEL = 999;
/* Low tiers are deliberately far apart in hue/value: hard grey plastic → red-orange bronze → bright cool silver → gold. From Gold up, every tier also gets its own gem cut. */
export const FRAMES: FrameTier[] = [
  { id: "plastic", name: "Cartridge", level: 0, material: "plastic", blurb: "Hard grey shell, like the cart itself", extras: ["shell"], motion: "none", gem: "button" },
  { id: "bronze", name: "Bronze", level: 11, material: "bronze", blurb: "Warm bronze with turquoise, engraved", extras: ["ticks"], motion: "glint", gem: "round" },
  { id: "silver", name: "Silver", level: 30, material: "silver", blurb: "Mirror silver with a beaded rim", extras: ["beads"], motion: "glint", gem: "round" },
  { id: "gold", name: "Gold", level: 60, material: "gold", blurb: "Gold laurel, cushion-cut rubies", extras: [], motion: "sweep", gem: "cushion" },
  { id: "platinum", name: "Platinum", level: 100, material: "platinum", blurb: "Platinum laurel, emerald cuts", extras: [], motion: "sweep", gem: "emerald" },
  { id: "jade", name: "Jade", level: 160, material: "jade", blurb: "Polished jade, citrine cabochons", extras: [], motion: "sweep", gem: "oval" },
  { id: "cobalt", name: "Cobalt", level: 240, material: "cobalt", blurb: "Anodised cobalt, hexagon stones", extras: [], motion: "sweep", gem: "hex" },
  { id: "diamond", name: "Diamond", level: 350, material: "diamond", blurb: "Ice-blue diamond, brilliant cuts", extras: ["facets"], motion: "sweep", gem: "brilliant" },
  { id: "holo", name: "Holo Foil", level: 500, material: "holo", blurb: "Iridescent foil, marquise opals", extras: ["foil"], motion: "holo", gem: "marquise" },
  { id: "prism", name: "Prism", level: 700, material: "prism", blurb: "Cut crystal, kite diamonds", extras: ["facets"], motion: "prism", gem: "kite" },
];
/* Stages inside one tier: plain → ● → ●● → ●●● → wreath → ★ (top gem becomes a star) → ★★★ (all three). */
export const STAGE_NAMES = ["Plain", "●", "●●", "●●●", "Wreath", "★", "★★★"];
export const STAGES = STAGE_NAMES.length, TOP_STAGE = STAGES - 1;

// XP curve: Lv 10 ≈ a few evenings, Lv 100 ≈ a long-term main game, Lv 999 ≈ a lifetime
export const xpForLevel = (L: number) => (L <= 0 ? 0 : Math.round(25 * Math.pow(L, 1.45)));
export function levelFor(xp: number) {
  let L = 0;
  while (L < MAX_LEVEL && xp >= xpForLevel(L + 1)) L++;
  const cur = xpForLevel(L), next = xpForLevel(Math.min(MAX_LEVEL, L + 1));
  return { level: L, xp, into: xp - cur, need: Math.max(1, next - cur), progress: L >= MAX_LEVEL ? 1 : (xp - cur) / Math.max(1, next - cur) };
}
export const frameIndexFor = (level: number) => FRAMES.reduce((i, f, k) => (level >= f.level ? k : i), 0);

/** Tier + stage (0 plain … 6 three stars) for a level; `max` at 999. */
export function frameState(level: number) {
  const i = frameIndexFor(level), t = FRAMES[i], end = FRAMES[i + 1]?.level ?? MAX_LEVEL;
  // Cartridge (Lv 0–10) is the starter shell: no gems, no stars — it jumps straight to Bronze.
  const stage = i === 0 ? 0 : Math.min(TOP_STAGE, Math.floor(((level - t.level) / Math.max(1, end - t.level)) * STAGES));
  const nextStageAt = i === 0 ? FRAMES[1].level : stage < TOP_STAGE ? t.level + Math.ceil(((stage + 1) / STAGES) * (end - t.level)) : FRAMES[i + 1]?.level;
  return { index: i, tier: t, stage, max: level >= MAX_LEVEL, nextStageAt };
}

// ---------------------------------------------------------------- achievements → badges
export type Stats = {
  games: { system: string; playSeconds?: number; coverSource?: string }[];
  saves: number; nightSaves: number; earlySaves: number; devices: number;
  accountDays: number; users: number; owner: boolean;
  /** seconds with the site open and active */ linkSeconds: number;
  /** longest run of days in a row with a cloud save */ bestStreak: number;
  /** most cloud saves on one day */ dayMaxSaves: number;
  /** points from in-game achievements, all games */ gamePoints?: number;
};
export type Family = {
  id: string; name: string; art: string; desc: (n: number) => string;
  steps: [number, number, number]; value: (s: Stats) => number; unit?: string;
};
export const STEP_NAMES = ["Earned", "Silver", "Gold"] as const; // step 1 = full colour, 2 = silvered, 3 = gilded
export const STEP_XP = [150, 400, 1000];

export const FAMILIES: Family[] = [
  { id: "collector", name: "Collector", art: "carts", steps: [3, 10, 25], value: (s) => s.games.length, desc: (n) => `Own ${n} games`, unit: "games" },
  { id: "marathon", name: "Marathon", art: "stopwatch", steps: [5, 20, 50], value: (s) => Math.floor(Math.max(0, ...s.games.map((g) => g.playSeconds ?? 0)) / 3600), desc: (n) => `${n} hours in one game`, unit: "h" },
  { id: "archivist", name: "Archivist", art: "save", steps: [10, 100, 500], value: (s) => s.saves, desc: (n) => `${n} cloud saves`, unit: "saves" },
  { id: "night-owl", name: "Night Owl", art: "moon", steps: [1, 10, 50], value: (s) => s.nightSaves, desc: (n) => `Save ${n}× between midnight and 4 am`, unit: "late saves" },
  { id: "early-bird", name: "Early Bird", art: "sunrise", steps: [1, 10, 50], value: (s) => s.earlySaves, desc: (n) => `Save ${n}× between 5 and 8 am`, unit: "early saves" },
  { id: "link-up", name: "Link Up", art: "link", steps: [2, 3, 5], value: (s) => s.devices, desc: (n) => `Play on ${n} devices`, unit: "devices" },
  { id: "historian", name: "Historian", art: "systems", steps: [2, 3, 4], value: (s) => new Set(s.games.map((g) => g.system)).size, desc: (n) => `Games on ${n} systems`, unit: "systems" },
  { id: "curator", name: "Curator", art: "frame", steps: [1, 5, 15], value: (s) => s.games.filter((g) => g.coverSource === "custom").length, desc: (n) => `${n} custom cover${n > 1 ? "s" : ""}`, unit: "covers" },
  { id: "party", name: "Party", art: "party", steps: [2, 4, 8], value: (s) => s.users, desc: (n) => `${n} people on this PC`, unit: "people" },
  { id: "veteran", name: "Veteran", art: "medal", steps: [7, 90, 365], value: (s) => s.accountDays, desc: (n) => `Member for ${n} days`, unit: "days" },
  { id: "plugged-in", name: "Plugged In", art: "hourglass", steps: [10, 100, 500], value: (s) => Math.floor(s.linkSeconds / 3600), desc: (n) => `Spend ${n} hours in Link Cable`, unit: "h" },
  { id: "streak", name: "On a Roll", art: "flame", steps: [3, 7, 30], value: (s) => s.bestStreak, desc: (n) => `Play ${n} days in a row`, unit: "days" },
  { id: "quick-saver", name: "Quick Saver", art: "bolt", steps: [10, 25, 50], value: (s) => s.dayMaxSaves, desc: (n) => `${n} cloud saves in one day`, unit: "saves" },
  { id: "completionist", name: "Completionist", art: "trophy", steps: [5, 10, 14], value: () => 0, desc: (n) => `Earn ${n} other badges`, unit: "badges" },
  { id: "host", name: "Host", art: "house", steps: [1, 1, 1], value: (s) => (s.owner ? 1 : 0), desc: () => "Owner of this PC" },
];

export type Earned = { family: Family; step: number; value: number; next?: number }; // step: 0 none, 1 bronze, 2 silver, 3 gold
export function evaluate(s: Stats, opts: { all?: boolean } = {}) {
  const one = (f: Family, v: number): Earned => {
    const step = opts.all ? 3 : f.id === "host" ? (v ? 3 : 0) : f.steps.filter((t) => v >= t).length;
    return { family: f, step, value: v, next: f.id === "host" ? undefined : f.steps[step] };
  };
  const base = FAMILIES.map((f) => one(f, f.value(s)));
  // Completionist counts the *other* badges you've earned
  const others = base.filter((e) => e.family.id !== "completionist" && e.step > 0).length;
  const earned = base.map((e) => (e.family.id === "completionist" ? one(e.family, others) : e));
  const playXp = Math.floor(s.games.reduce((a, g) => a + (g.playSeconds ?? 0), 0) / 60) * 2;
  const achXp = earned.reduce((a, e) => a + STEP_XP.slice(0, e.step).reduce((x, y) => x + y, 0), 0) + (s.gamePoints ?? 0) * 5;
  return { earned, playXp, achXp, ...levelFor(playXp + achXp) };
}

/** What gets published to the profile and shown to others (only in Labs-enabled browsers). */
export type FlairSnapshot = { level: number; frame?: string; badge?: { id: string; step: number } | null };
/** What to draw for a published snapshot: own tier at its stage, or a lower (completed) tier at ★. */
export function resolveFrame(snap?: FlairSnapshot | null) {
  if (!snap || snap.frame === "none") return null;
  const st = frameState(snap.level);
  const pick = FRAMES.findIndex((f) => f.id === snap.frame);
  if (pick >= 0 && pick < st.index) return { tier: FRAMES[pick], stage: TOP_STAGE, max: false };
  return { tier: st.tier, stage: st.stage, max: st.max };
}
