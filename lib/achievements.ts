/*
 * In-game achievements. The emulator page reports a small snapshot of the running game (see public/ach-reader.js);
 * every achievement is a plain test on that snapshot (and, for "the moment it happened" ones, on the previous one).
 * Nothing here depends on a ROM's language or revision.
 *
 * Species numbers: `owned` uses National Pokédex numbers. Party Pokémon use the game's internal numbers, which match
 * the National Dex for #1–251; Hoenn species have their own internal numbers (only a few are used below).
 */
export type PartyMon = { sp: number; lv: number; hp: number; max: number; shiny: boolean; egg: boolean; item: number };
export type GameState = {
  gen: number; family: "E" | "FRLG" | "RS"; version: "emerald" | "firered" | "leafgreen" | "ruby" | "sapphire"; lang: string;
  playSeconds: number; owned: number[]; seen: number; badges: number; badgeBits: number; champion: boolean;
  money: number | null; coins: number | null; party: PartyMon[]; partyLive: boolean; map: [number, number] | null;
};
export type Category = "story" | "dex" | "legend" | "team" | "wealth" | "time" | "feat";
export type Achievement = {
  id: string; title: string; desc: string; points: number; cat: Category;
  /** hidden until unlocked */ secret?: boolean;
  test: (s: GameState, prev: GameState | null) => boolean;
  /** 0..1, for "12 / 50"-style bars */ progress?: (s: GameState) => [number, number];
};

// ---------------------------------------------------------------- helpers
const has = (s: GameState, ...ids: number[]) => ids.every((n) => s.owned.includes(n));
const any = (s: GameState, ...ids: number[]) => ids.some((n) => s.owned.includes(n));
const team = (s: GameState) => s.party.filter((m) => !m.egg);
const alive = (s: GameState) => team(s).filter((m) => m.hp > 0);
/** true only at the moment the credits flag flips while playing */
const becameChampion = (s: GameState, p: GameState | null) => s.champion && !!p && !p.champion;
const gotBadge = (n: number) => (s: GameState, p: GameState | null) => s.badges >= n && !!p && p.badges < n;
const hours = (s: GameState) => s.playSeconds / 3600;

const owned = (id: string, n: number, title: string, points: number): Achievement =>
  ({ id, title, desc: `Own ${n} different Pokémon`, points, cat: "dex", test: (s) => s.owned.length >= n, progress: (s) => [s.owned.length, n] });
const seen = (id: string, n: number, title: string, points: number): Achievement =>
  ({ id, title, desc: `See ${n} different Pokémon`, points, cat: "dex", test: (s) => s.seen >= n, progress: (s) => [s.seen, n] });
const catchOne = (id: string, dex: number, title: string, desc: string, points: number, secret = false): Achievement =>
  ({ id, title, desc, points, cat: "legend", secret, test: (s) => has(s, dex) });

// ---------------------------------------------------------------- shared by every Gen 3 game
const COMMON: Achievement[] = [
  // --- collecting
  owned("dex-1", 1, "Gotcha!", 5), owned("dex-10", 10, "Getting the Hang of It", 5), owned("dex-25", 25, "Box Two", 10),
  owned("dex-50", 50, "Field Researcher", 10), owned("dex-100", 100, "Triple Digits", 25), owned("dex-150", 150, "The Old Slogan", 25),
  owned("dex-200", 200, "Professor's Pride", 50), owned("dex-300", 300, "National Treasure", 50), owned("dex-386", 386, "Gotta Catch 'Em All", 100),
  seen("seen-50", 50, "Sightseer", 5), seen("seen-150", 150, "Well Travelled", 10), seen("seen-300", 300, "Seen It All", 25),
  { id: "looker", title: "Window Shopper", desc: "Have seen at least 100 Pokémon, and twice as many as you own", points: 10, cat: "dex", test: (s) => s.seen >= 100 && s.seen >= s.owned.length * 2 },
  { id: "eevee-5", title: "Eeveelution Revolution", desc: "Own Vaporeon, Jolteon, Flareon, Espeon and Umbreon", points: 50, cat: "dex", test: (s) => has(s, 134, 135, 136, 196, 197), progress: (s) => [[134, 135, 136, 196, 197].filter((n) => s.owned.includes(n)).length, 5] },
  { id: "karp", title: "Worth the Splash", desc: "Own both Magikarp and Gyarados", points: 10, cat: "dex", test: (s) => has(s, 129, 130) },
  { id: "pika-line", title: "Shock Family", desc: "Own Pichu, Pikachu and Raichu", points: 10, cat: "dex", test: (s) => has(s, 172, 25, 26) },
  { id: "ditto", title: "Ask No Questions", desc: "Own a Ditto", points: 5, cat: "dex", test: (s) => has(s, 132) },
  { id: "pseudo", title: "Six Hundred Club", desc: "Own a Dragonite, Tyranitar, Salamence or Metagross", points: 25, cat: "dex", test: (s) => any(s, 149, 248, 373, 376) },
  { id: "pseudo-all", title: "Board of Directors", desc: "Own Dragonite, Tyranitar, Salamence and Metagross", points: 50, cat: "dex", test: (s) => has(s, 149, 248, 373, 376) },
  { id: "shedinja", title: "Something Left Behind", desc: "Own both Ninjask and Shedinja", points: 25, cat: "dex", test: (s) => has(s, 291, 292) },
  { id: "milotic", title: "Ugly Duckling", desc: "Own both Feebas and Milotic", points: 50, cat: "dex", test: (s) => has(s, 349, 350) },
  // --- mythical / roaming (secret: finding out is half the fun)
  catchOne("mew", 151, "Under the Truck", "Own Mew", 50, true), catchOne("celebi", 251, "Time Flies", "Own Celebi", 50, true),
  catchOne("jirachi", 385, "Make a Wish", "Own Jirachi", 50, true), catchOne("deoxys", 386, "Visitor", "Own Deoxys", 50, true),
  { id: "tower-duo", title: "Navel Gazing", desc: "Own Lugia and Ho-Oh", points: 50, cat: "legend", secret: true, test: (s) => has(s, 249, 250) },
  // --- team
  { id: "full-team", title: "Six Pack", desc: "Carry a full team of six", points: 5, cat: "team", test: (s) => team(s).length >= 6 },
  { id: "lv-30", title: "Growing Up", desc: "Raise a Pokémon to level 30", points: 5, cat: "team", test: (s) => team(s).some((m) => m.lv >= 30) },
  { id: "lv-50", title: "Halfway There", desc: "Raise a Pokémon to level 50", points: 10, cat: "team", test: (s) => team(s).some((m) => m.lv >= 50) },
  { id: "lv-100", title: "Maxed Out", desc: "Raise a Pokémon to level 100", points: 50, cat: "team", test: (s) => team(s).some((m) => m.lv >= 100) },
  { id: "all-50", title: "No Weak Links", desc: "Carry six Pokémon that are all level 50 or higher", points: 25, cat: "team", test: (s) => team(s).length >= 6 && team(s).every((m) => m.lv >= 50) },
  { id: "all-100", title: "The Dream Team", desc: "Carry six level 100 Pokémon", points: 100, cat: "team", test: (s) => team(s).length >= 6 && team(s).every((m) => m.lv >= 100) },
  { id: "shiny", title: "Different Colours", desc: "Have a shiny Pokémon in your party", points: 50, cat: "team", test: (s) => team(s).some((m) => m.shiny) },
  { id: "shiny-2", title: "Lightning Struck Twice", desc: "Have two shiny Pokémon in your party at once", points: 100, cat: "team", secret: true, test: (s) => team(s).filter((m) => m.shiny).length >= 2 },
  { id: "egg", title: "Handle With Care", desc: "Carry an Egg", points: 5, cat: "team", test: (s) => s.party.some((m) => m.egg) },
  { id: "six-kind", title: "Six of a Kind", desc: "Carry six of the same Pokémon", points: 25, cat: "team", secret: true, test: (s) => team(s).length >= 6 && team(s).every((m) => m.sp === team(s)[0].sp) },
  { id: "karp-100", title: "Karpe Diem", desc: "Have a level 100 Magikarp that never evolved", points: 50, cat: "team", secret: true, test: (s) => team(s).some((m) => m.sp === 129 && m.lv >= 100) },
  { id: "pika-50", title: "Still Not Evolving", desc: "Have a Pikachu at level 50 or higher", points: 10, cat: "team", test: (s) => team(s).some((m) => m.sp === 25 && m.lv >= 50) },
  { id: "items-6", title: "Fully Equipped", desc: "Six Pokémon in your party, each holding an item", points: 10, cat: "team", test: (s) => team(s).length >= 6 && team(s).every((m) => m.item > 0) },
  { id: "babysitter", title: "Day Care on Legs", desc: "Carry a Pokémon 60 or more levels below your strongest", points: 10, cat: "team", test: (s) => { const l = team(s).map((m) => m.lv); return l.length >= 2 && Math.max(...l) - Math.min(...l) >= 60; } },
  // --- moments (need the live party)
  { id: "one-hp", title: "Hanging by a Thread", desc: "Have a Pokémon survive on exactly 1 HP", points: 10, cat: "feat", test: (s) => s.partyLive && team(s).some((m) => m.hp === 1 && m.max > 1) },
  { id: "last-stand", title: "Last One Standing", desc: "Have five of six Pokémon fainted and one still going", points: 25, cat: "feat", test: (s) => s.partyLive && team(s).length >= 6 && alive(s).length === 1 },
  { id: "red-team", title: "Living Dangerously", desc: "Six conscious Pokémon, every one of them below a quarter of its HP", points: 25, cat: "feat", secret: true, test: (s) => s.partyLive && team(s).length >= 6 && alive(s).length === 6 && team(s).every((m) => m.hp * 4 < m.max) },
  // --- money and time
  { id: "money-50k", title: "Pocket Money", desc: "Hold ₽50,000", points: 5, cat: "wealth", test: (s) => (s.money ?? 0) >= 50000, progress: (s) => [s.money ?? 0, 50000] },
  { id: "money-250k", title: "Nest Egg", desc: "Hold ₽250,000", points: 10, cat: "wealth", test: (s) => (s.money ?? 0) >= 250000, progress: (s) => [s.money ?? 0, 250000] },
  { id: "money-max", title: "Wallet's Full", desc: "Hold ₽999,999", points: 50, cat: "wealth", test: (s) => s.money === 999999, progress: (s) => [s.money ?? 0, 999999] },
  { id: "broke", title: "Blacked Out", desc: "Have less than ₽100 after earning your third badge", points: 10, cat: "wealth", secret: true, test: (s) => s.money !== null && s.money < 100 && s.badges >= 3 },
  { id: "coins-1k", title: "Beginner's Luck", desc: "Hold 1,000 Game Corner coins", points: 10, cat: "wealth", test: (s) => (s.coins ?? 0) >= 1000, progress: (s) => [s.coins ?? 0, 1000] },
  { id: "coins-max", title: "The House Loses", desc: "Hold 9,999 Game Corner coins", points: 50, cat: "wealth", test: (s) => s.coins === 9999, progress: (s) => [s.coins ?? 0, 9999] },
  { id: "time-1", title: "Just One More Route", desc: "Play for 1 hour", points: 5, cat: "time", test: (s) => hours(s) >= 1 },
  { id: "time-10", title: "Settled In", desc: "Play for 10 hours", points: 10, cat: "time", test: (s) => hours(s) >= 10, progress: (s) => [Math.floor(hours(s)), 10] },
  { id: "time-50", title: "A Second Home", desc: "Play for 50 hours", points: 25, cat: "time", test: (s) => hours(s) >= 50, progress: (s) => [Math.floor(hours(s)), 50] },
  { id: "time-100", title: "Where Did the Time Go", desc: "Play for 100 hours", points: 50, cat: "time", test: (s) => hours(s) >= 100, progress: (s) => [Math.floor(hours(s)), 100] },
  // --- story (badge and champion names differ per region, added below)
  { id: "badge-rush", title: "No Time to Explain", desc: "Earn your fourth badge within 4 hours of play", points: 25, cat: "feat", test: (s, p) => gotBadge(4)(s, p) && hours(s) < 4 },
  { id: "champ-speed", title: "Any%", desc: "Enter the Hall of Fame in under 12 hours", points: 50, cat: "feat", test: (s, p) => becameChampion(s, p) && hours(s) < 12 },
  { id: "champ-solo", title: "Solo Act", desc: "Enter the Hall of Fame with a single Pokémon in your party", points: 100, cat: "feat", secret: true, test: (s, p) => becameChampion(s, p) && team(s).length === 1 },
  { id: "champ-trio", title: "Travelling Light", desc: "Enter the Hall of Fame with three Pokémon or fewer", points: 50, cat: "feat", test: (s, p) => becameChampion(s, p) && team(s).length <= 3 },
  { id: "champ-low", title: "Underdog", desc: "Enter the Hall of Fame with nobody above level 50", points: 50, cat: "feat", test: (s, p) => becameChampion(s, p) && team(s).every((m) => m.lv <= 50) },
  { id: "champ-clutch", title: "Photo Finish", desc: "Enter the Hall of Fame with only one Pokémon left standing", points: 50, cat: "feat", test: (s, p) => becameChampion(s, p) && s.partyLive && team(s).length >= 2 && alive(s).length === 1 },
  { id: "champ-flawless", title: "Not a Scratch", desc: "Enter the Hall of Fame with a full team and nobody fainted", points: 25, cat: "feat", test: (s, p) => becameChampion(s, p) && s.partyLive && team(s).length >= 6 && alive(s).length === 6 },
  { id: "badge8-small", title: "Skeleton Crew", desc: "Earn the eighth badge with three Pokémon or fewer", points: 25, cat: "feat", test: (s, p) => gotBadge(8)(s, p) && team(s).length <= 3 },
];

const badges = (names: string[], leaders: string[]): Achievement[] => names.map((n, i) => ({
  id: `badge-${i + 1}`, title: `${n} Badge`, desc: `Defeat ${leaders[i]}`, points: i < 4 ? 10 : 25, cat: "story" as Category, test: (s: GameState) => !!(s.badgeBits & (1 << i)),
}));

// ---------------------------------------------------------------- Hoenn (Ruby · Sapphire · Emerald)
const HOENN: Achievement[] = [
  ...badges(["Stone", "Knuckle", "Dynamo", "Heat", "Balance", "Feather", "Mind", "Rain"], ["Roxanne in Rustboro", "Brawly in Dewford", "Wattson in Mauville", "Flannery in Lavaridge", "your father, Norman", "Winona in Fortree", "Tate & Liza in Mossdeep", "the Sootopolis Gym Leader"]),
  { id: "champion", title: "Hoenn Champion", desc: "Beat the Elite Four and the Champion", points: 100, cat: "story", test: (s) => s.champion },
  { id: "starters", title: "Birch's Briefcase", desc: "Own Treecko, Torchic and Mudkip", points: 25, cat: "dex", test: (s) => has(s, 252, 255, 258) },
  { id: "fossils", title: "Root and Claw", desc: "Own both Lileep and Anorith", points: 25, cat: "dex", test: (s) => has(s, 345, 347) },
  { id: "braille", title: "First Comes Last", desc: "Own both Wailord and Relicanth", points: 25, cat: "dex", secret: true, test: (s) => has(s, 321, 369) },
  { id: "regis", title: "Sealed Chamber", desc: "Own Regirock, Regice and Registeel", points: 50, cat: "legend", test: (s) => has(s, 377, 378, 379), progress: (s) => [[377, 378, 379].filter((n) => s.owned.includes(n)).length, 3] },
  catchOne("lati", 380, "Southern Islander", "Own Latias", 25), catchOne("latios", 381, "Eon Flight", "Own Latios", 25),
  { id: "weather", title: "Weather Report", desc: "Own Kyogre, Groudon and Rayquaza", points: 100, cat: "legend", test: (s) => has(s, 382, 383, 384), progress: (s) => [[382, 383, 384].filter((n) => s.owned.includes(n)).length, 3] },
  catchOne("rayquaza", 384, "Sky Pillar Summit", "Own Rayquaza", 50),
  { id: "ray-party", title: "Leash Law", desc: "Walk around with Rayquaza in your party", points: 10, cat: "team", test: (s) => team(s).some((m) => m.sp === 406) },
  { id: "castform", title: "Whatever the Weather", desc: "Own Castform", points: 10, cat: "dex", test: (s) => has(s, 351) },
  { id: "kecleon", title: "Something Unseeable", desc: "Own Kecleon", points: 10, cat: "dex", test: (s) => has(s, 352) },
  { id: "absol", title: "Bad Omen", desc: "Own Absol", points: 10, cat: "dex", test: (s) => has(s, 359) },
  { id: "spinda", title: "One in Four Billion", desc: "Own Spinda", points: 5, cat: "dex", test: (s) => has(s, 327) },
  { id: "bagon", title: "Dreams of Flying", desc: "Own Bagon, Shelgon and Salamence", points: 25, cat: "dex", test: (s) => has(s, 371, 372, 373) },
  { id: "beldum", title: "Steven's Parting Gift", desc: "Own Beldum, Metang and Metagross", points: 25, cat: "dex", test: (s) => has(s, 374, 375, 376) },
  { id: "plusle", title: "Opposites Attract", desc: "Own both Plusle and Minun", points: 10, cat: "dex", test: (s) => has(s, 311, 312) },
  { id: "sun-moon", title: "Night and Day", desc: "Own both Lunatone and Solrock", points: 25, cat: "dex", test: (s) => has(s, 337, 338) },
  { id: "rivals", title: "Old Grudge", desc: "Own both Zangoose and Seviper", points: 25, cat: "dex", test: (s) => has(s, 335, 336) },
  { id: "wynaut", title: "Why Not?", desc: "Own Wynaut and Wobbuffet", points: 10, cat: "dex", test: (s) => has(s, 360, 202) },
];
const EMERALD_ONLY: Achievement[] = [
  { id: "em-both", title: "Peacekeeper", desc: "Own both Kyogre and Groudon in Emerald", points: 50, cat: "legend", test: (s) => has(s, 382, 383) },
  { id: "em-johto", title: "A Gift from Birch", desc: "Own a Chikorita, Cyndaquil or Totodile", points: 25, cat: "dex", secret: true, test: (s) => any(s, 152, 155, 158) },
  { id: "em-sudo", title: "That's Not a Tree", desc: "Own Sudowoodo", points: 10, cat: "dex", test: (s) => has(s, 185) },
  { id: "em-smeargle", title: "Art Critic", desc: "Own Smeargle", points: 10, cat: "dex", test: (s) => has(s, 235) },
];

// ---------------------------------------------------------------- Kanto (FireRed · LeafGreen)
const KANTO: Achievement[] = [
  ...badges(["Boulder", "Cascade", "Thunder", "Rainbow", "Soul", "Marsh", "Volcano", "Earth"], ["Brock in Pewter", "Misty in Cerulean", "Lt. Surge in Vermilion", "Erika in Celadon", "Koga in Fuchsia", "Sabrina in Saffron", "Blaine on Cinnabar", "the Viridian Gym Leader"]),
  { id: "champion", title: "Indigo Champion", desc: "Beat the Elite Four and your rival", points: 100, cat: "story", test: (s) => s.champion },
  { id: "starters", title: "Oak's Table", desc: "Own Bulbasaur, Charmander and Squirtle", points: 25, cat: "dex", test: (s) => has(s, 1, 4, 7) },
  { id: "kanto-151", title: "The Original Hundred and Fifty", desc: "Own 150 of the first 151 Pokémon", points: 100, cat: "dex", test: (s) => s.owned.filter((n) => n <= 151).length >= 150, progress: (s) => [s.owned.filter((n) => n <= 151).length, 150] },
  { id: "fossils", title: "Helix or Dome", desc: "Own Omanyte or Kabuto, and Aerodactyl", points: 25, cat: "dex", test: (s) => any(s, 138, 140) && has(s, 142) },
  { id: "birds", title: "Winged Mirages", desc: "Own Articuno, Zapdos and Moltres", points: 50, cat: "legend", test: (s) => has(s, 144, 145, 146), progress: (s) => [[144, 145, 146].filter((n) => s.owned.includes(n)).length, 3] },
  catchOne("mewtwo", 150, "Cerulean Cave", "Own Mewtwo", 50),
  { id: "beasts", title: "Still Running", desc: "Own Raikou, Entei or Suicune", points: 50, cat: "legend", test: (s) => any(s, 243, 244, 245) },
  { id: "snorlax", title: "Wake-Up Call", desc: "Own Snorlax", points: 10, cat: "dex", test: (s) => has(s, 143) },
  { id: "lapras", title: "Silph's Thank-You", desc: "Own Lapras", points: 10, cat: "dex", test: (s) => has(s, 131) },
  { id: "abra", title: "Quick Hands", desc: "Own Abra", points: 5, cat: "dex", test: (s) => has(s, 63) },
  { id: "safari", title: "Safari Regular", desc: "Own Chansey, Kangaskhan, Scyther or Pinsir, and Tauros", points: 50, cat: "dex", test: (s) => has(s, 113, 115, 128) && any(s, 123, 127) },
  { id: "corner", title: "Prize Counter", desc: "Own Porygon", points: 25, cat: "dex", test: (s) => has(s, 137) },
  { id: "dratini", title: "Worth Every Coin", desc: "Own Dratini, Dragonair and Dragonite", points: 25, cat: "dex", test: (s) => has(s, 147, 148, 149) },
  { id: "farfetch", title: "Fair Trade", desc: "Own Farfetch'd, Mr. Mime and Jynx", points: 25, cat: "dex", test: (s) => has(s, 83, 122, 124) },
  { id: "hitmons", title: "Fighting Dojo", desc: "Own both Hitmonlee and Hitmonchan", points: 25, cat: "dex", secret: true, test: (s) => has(s, 106, 107) },
  { id: "eevee-3", title: "Three Stones", desc: "Own Vaporeon, Jolteon and Flareon", points: 25, cat: "dex", test: (s) => has(s, 134, 135, 136) },
  { id: "ghost", title: "Tower Ghost", desc: "Own Gastly, Haunter and Gengar", points: 25, cat: "dex", test: (s) => has(s, 92, 93, 94) },
  { id: "cubone", title: "For Mother", desc: "Own Cubone and Marowak", points: 10, cat: "dex", test: (s) => has(s, 104, 105) },
  { id: "mew-team", title: "Oak Would Like a Word", desc: "Walk around with Mewtwo in your party", points: 10, cat: "team", test: (s) => team(s).some((m) => m.sp === 150) },
];

// ---------------------------------------------------------------- lookup
const SETS: Record<string, Achievement[]> = {
  emerald: [...HOENN, ...EMERALD_ONLY, ...COMMON], ruby: [...HOENN, ...COMMON], sapphire: [...HOENN, ...COMMON],
  firered: [...KANTO, ...COMMON], leafgreen: [...KANTO, ...COMMON],
};
const BY_CODE: Record<string, string> = { BPE: "emerald", AXV: "ruby", AXP: "sapphire", BPR: "firered", BPG: "leafgreen" };

/** Achievement set for a cartridge (by its 4-letter header code), or null if the game isn't supported yet. */
export function achievementsFor(code?: string | null): Achievement[] | null {
  const v = code ? BY_CODE[code.slice(0, 3).toUpperCase()] : undefined;
  return v ? SETS[v] : null;
}
export const totalPoints = (set: Achievement[]) => set.reduce((a, x) => a + x.points, 0);
export const CATEGORY_LABEL: Record<Category, string> = { story: "Story", dex: "Pokédex", legend: "Legendary", team: "Team", wealth: "Wealth", time: "Time", feat: "Feats" };
/** XP towards your account level per achievement point */
export const XP_PER_POINT = 5;

/** Ids that just became true. */
export function newlyUnlocked(set: Achievement[], s: GameState, prev: GameState | null, have: Record<string, number>) {
  return set.filter((a) => !have[a.id] && (() => { try { return a.test(s, prev); } catch { return false; } })());
}
