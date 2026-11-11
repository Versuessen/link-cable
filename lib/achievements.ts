/*
 * In-game achievements for every supported Pokémon game.
 *
 * The emulator page reports a small snapshot of the running game (see public/ach-reader.js); every achievement is a
 * plain test on that snapshot (and, for "the moment it happened" ones, on the previous snapshot).
 *
 * Species are National Pokédex numbers everywhere, except Gen 3 party Pokémon, which use the game's internal numbers
 * (identical to the National Dex for #1–251; a few Hoenn ones are used below).
 */
import type { System } from "./games";

export type PartyMon = { sp: number; lv: number; hp: number; max: number; shiny: boolean; egg: boolean; item: number };
export type GameState = {
  gen: number; version: string; family?: string;
  /** seconds on the game's clock (Gen 1/2: time played here, filled in by the page) */ playSeconds: number;
  owned: number[]; seen: number; badges: number; badgeBits: number; champion: boolean;
  money: number | null; coins: number | null; party: PartyMon[]; partyLive: boolean; map: [number, number] | null;
};
export type Category = "story" | "dex" | "legend" | "team" | "wealth" | "time" | "feat";
type Cap = "shiny" | "egg" | "items" | "coins" | "hof" | "champion";
export type Achievement = {
  id: string; title: string; desc: string; points: number; cat: Category;
  /** hidden until unlocked */ secret?: boolean;
  /** only for games that can report this */ needs?: Cap;
  /** only for games whose Pokédex goes at least this far */ minDex?: number;
  test: (s: GameState, prev: GameState | null) => boolean;
  progress?: (s: GameState) => [number, number];
};

// ---------------------------------------------------------------- the games
export type GameInfo = {
  key: string; name: string; system: System; gen: 1 | 2 | 3 | 4 | 5; version: string;
  family?: "E" | "FRLG" | "RS"; ds?: "dp" | "pt" | "hgss" | "bw" | "b2w2";
  dexMax: number; caps: Cap[];
  /** reading verified on real cartridges (shown as "beta" otherwise) */ verified: boolean;
};
const GB1_TITLES: [RegExp, string][] = [[/^POKEMON (RED|ROT|ROUGE|ROSSO|ROJO)/, "red"], [/^POKEMON (BLUE|BLAU|BLEU|BLU|AZUL)/, "blue"], [/^POKEMON (YEL|GELB|JAUNE|GIAL|AMAR)/, "yellow"]];
const GB2_TITLES: [RegExp, string][] = [[/^POKEMON_GLD/, "gold"], [/^POKEMON_SLV/, "silver"], [/^PM_CRYSTAL/, "crystal"]];
const GBA_CODES: Record<string, [string, "E" | "FRLG" | "RS"]> = { BPE: ["emerald", "E"], BPR: ["firered", "FRLG"], BPG: ["leafgreen", "FRLG"], AXV: ["ruby", "RS"], AXP: ["sapphire", "RS"] };
const NDS_CODES: Record<string, [string, "dp" | "pt" | "hgss" | "bw" | "b2w2", 4 | 5]> = {
  ADA: ["diamond", "dp", 4], APA: ["pearl", "dp", 4], CPU: ["platinum", "pt", 4], IPK: ["heartgold", "hgss", 4], IPG: ["soulsilver", "hgss", 4],
  IRB: ["black", "bw", 5], IRA: ["white", "bw", 5], IRE: ["black2", "b2w2", 5], IRD: ["white2", "b2w2", 5],
};
const NAMES: Record<string, string> = {
  red: "Red", blue: "Blue", yellow: "Yellow", gold: "Gold", silver: "Silver", crystal: "Crystal", ruby: "Ruby", sapphire: "Sapphire", emerald: "Emerald",
  firered: "FireRed", leafgreen: "LeafGreen", diamond: "Diamond", pearl: "Pearl", platinum: "Platinum", heartgold: "HeartGold", soulsilver: "SoulSilver",
  black: "Black", white: "White", black2: "Black 2", white2: "White 2",
};

/** Which Pokémon game a cartridge is (from its header), or null if it isn't one we have achievements for. */
export function gameFor(rom: { system: System; header?: { title?: string; code?: string; region?: string } }): GameInfo | null {
  const h = rom.header ?? {}, title = (h.title ?? "").toUpperCase(), code = (h.code ?? "").toUpperCase().slice(0, 3);
  const info = (version: string, gen: GameInfo["gen"], dexMax: number, caps: Cap[], extra: Partial<GameInfo> = {}, verified = false): GameInfo =>
    ({ key: version, name: NAMES[version], system: rom.system, gen, version, dexMax, caps, verified, ...extra });
  if (rom.system === "gb" || rom.system === "gbc") {
    if (h.region === "japan") return null; // Japanese Gen 1/2 use a different memory layout
    for (const [re, v] of GB1_TITLES) if (re.test(title)) return info(v, 1, 151, []);
    for (const [re, v] of GB2_TITLES) if (re.test(title)) return info(v, 2, 251, ["shiny", "egg", "items", "champion"]);
    return null;
  }
  if (rom.system === "gba" && GBA_CODES[code]) {
    const [v, family] = GBA_CODES[code];
    return info(v, 3, 386, ["shiny", "egg", "items", "coins", "hof", "champion"], { family }, family === "FRLG");
  }
  if (rom.system === "nds" && NDS_CODES[code]) {
    const [v, ds, gen] = NDS_CODES[code];
    return info(v, gen, gen === 4 ? 493 : 649, ["shiny", "egg", "items", ...(ds === "hgss" ? ["champion" as Cap] : [])], { ds });
  }
  return null;
}

// ---------------------------------------------------------------- helpers
const has = (s: GameState, ...ids: number[]) => ids.every((n) => s.owned.includes(n));
const any = (s: GameState, ...ids: number[]) => ids.some((n) => s.owned.includes(n));
const count = (s: GameState, ids: number[]) => ids.filter((n) => s.owned.includes(n)).length;
const inRange = (s: GameState, a: number, b: number) => s.owned.filter((n) => n >= a && n <= b).length;
const team = (s: GameState) => s.party.filter((m) => !m.egg);
const alive = (s: GameState) => team(s).filter((m) => m.hp > 0);
const inParty = (s: GameState, sp: number) => team(s).some((m) => m.sp === sp);
const becameChampion = (s: GameState, p: GameState | null) => s.champion && !!p && !p.champion;
const gotBadges = (n: number) => (s: GameState, p: GameState | null) => s.badges >= n && !!p && p.badges < n;
const hours = (s: GameState) => s.playSeconds / 3600;
const minDexOf = (ids: number[]) => Math.max(...ids);

const owned = (id: string, n: number, title: string, points: number): Achievement =>
  ({ id, title, desc: `Own ${n} different Pokémon`, points, cat: "dex", minDex: n, test: (s) => s.owned.length >= n, progress: (s) => [s.owned.length, n] });
const seen = (id: string, n: number, title: string, points: number): Achievement =>
  ({ id, title, desc: `See ${n} different Pokémon`, points, cat: "dex", minDex: n, test: (s) => s.seen >= n, progress: (s) => [s.seen, n] });
/** own all of these */
const set = (id: string, title: string, desc: string, points: number, ids: number[], cat: Category = "dex", secret = false): Achievement =>
  ({ id, title, desc, points, cat, secret, minDex: minDexOf(ids), test: (s) => has(s, ...ids), progress: ids.length > 2 ? (s) => [count(s, ids), ids.length] : undefined });
const one = (id: string, dex: number, title: string, desc: string, points: number, secret = false, cat: Category = "legend"): Achievement =>
  ({ id, title, desc, points, cat, secret, minDex: dex, test: (s) => has(s, dex) });

// ---------------------------------------------------------------- shared by every game
const COMMON: Achievement[] = [
  // --- collecting
  owned("dex-1", 1, "Gotcha!", 5), owned("dex-10", 10, "Getting the Hang of It", 5), owned("dex-25", 25, "Box Two", 10),
  owned("dex-50", 50, "Field Researcher", 10), owned("dex-100", 100, "Triple Digits", 25), owned("dex-150", 150, "The Old Slogan", 25),
  owned("dex-200", 200, "Professor's Pride", 50), owned("dex-300", 300, "National Treasure", 50), owned("dex-386", 386, "Gotta Catch 'Em All", 100),
  owned("dex-450", 450, "Encyclopedic", 100), owned("dex-493", 493, "Arceus Would Approve", 100), owned("dex-600", 600, "Six Hundred Strong", 100), owned("dex-649", 649, "The Complete Works", 100),
  seen("seen-50", 50, "Sightseer", 5), seen("seen-150", 150, "Well Travelled", 10), seen("seen-300", 300, "Seen It All", 25), seen("seen-450", 450, "Birdwatcher", 25),
  { id: "looker", title: "Window Shopper", desc: "Have seen at least 100 Pokémon, and twice as many as you own", points: 10, cat: "dex", minDex: 100, test: (s) => s.seen >= 100 && s.seen >= s.owned.length * 2 },
  set("eevee-5", "Eeveelution Revolution", "Own Vaporeon, Jolteon, Flareon, Espeon and Umbreon", 50, [134, 135, 136, 196, 197]),
  set("eevee-7", "Seven Stones", "Own all seven Eeveelutions up to Glaceon", 50, [134, 135, 136, 196, 197, 470, 471]),
  set("karp", "Worth the Splash", "Own both Magikarp and Gyarados", 10, [129, 130]),
  set("pika-line", "Shock Family", "Own Pichu, Pikachu and Raichu", 10, [172, 25, 26]),
  one("ditto", 132, "Ask No Questions", "Own a Ditto", 5, false, "dex"),
  { id: "pseudo", title: "Six Hundred Club", desc: "Own a Dragonite, Tyranitar, Salamence, Metagross, Garchomp or Hydreigon", points: 25, cat: "dex", test: (s) => any(s, 149, 248, 373, 376, 445, 635) },
  set("pseudo-all", "Board of Directors", "Own Dragonite, Tyranitar, Salamence and Metagross", 50, [149, 248, 373, 376]),
  set("shedinja", "Something Left Behind", "Own both Ninjask and Shedinja", 25, [291, 292]),
  set("milotic", "Ugly Duckling", "Own both Feebas and Milotic", 50, [349, 350]),
  one("mew", 151, "Under the Truck", "Own Mew", 50, true), one("celebi", 251, "Time Flies", "Own Celebi", 50, true),
  one("jirachi", 385, "Make a Wish", "Own Jirachi", 50, true), one("deoxys", 386, "Visitor", "Own Deoxys", 50, true),
  set("tower-duo", "Navel Gazing", "Own Lugia and Ho-Oh", 50, [249, 250], "legend", true),
  // --- team
  { id: "full-team", title: "Six Pack", desc: "Carry a full team of six", points: 5, cat: "team", test: (s) => team(s).length >= 6 },
  { id: "lv-30", title: "Growing Up", desc: "Raise a Pokémon to level 30", points: 5, cat: "team", test: (s) => team(s).some((m) => m.lv >= 30) },
  { id: "lv-50", title: "Halfway There", desc: "Raise a Pokémon to level 50", points: 10, cat: "team", test: (s) => team(s).some((m) => m.lv >= 50) },
  { id: "lv-100", title: "Maxed Out", desc: "Raise a Pokémon to level 100", points: 50, cat: "team", test: (s) => team(s).some((m) => m.lv >= 100) },
  { id: "all-50", title: "No Weak Links", desc: "Carry six Pokémon that are all level 50 or higher", points: 25, cat: "team", test: (s) => team(s).length >= 6 && team(s).every((m) => m.lv >= 50) },
  { id: "all-100", title: "The Dream Team", desc: "Carry six level 100 Pokémon", points: 100, cat: "team", test: (s) => team(s).length >= 6 && team(s).every((m) => m.lv >= 100) },
  { id: "shiny", title: "Different Colours", desc: "Have a shiny Pokémon in your party", points: 50, cat: "team", needs: "shiny", test: (s) => team(s).some((m) => m.shiny) },
  { id: "shiny-2", title: "Lightning Struck Twice", desc: "Have two shiny Pokémon in your party at once", points: 100, cat: "team", needs: "shiny", secret: true, test: (s) => team(s).filter((m) => m.shiny).length >= 2 },
  { id: "egg", title: "Handle With Care", desc: "Carry an Egg", points: 5, cat: "team", needs: "egg", test: (s) => s.party.some((m) => m.egg) },
  { id: "eggs-3", title: "Nest Builder", desc: "Carry three Eggs at once", points: 10, cat: "team", needs: "egg", test: (s) => s.party.filter((m) => m.egg).length >= 3 },
  { id: "six-kind", title: "Six of a Kind", desc: "Carry six of the same Pokémon", points: 25, cat: "team", secret: true, test: (s) => team(s).length >= 6 && team(s).every((m) => m.sp === team(s)[0].sp) },
  { id: "karp-100", title: "Karpe Diem", desc: "Have a level 100 Magikarp that never evolved", points: 50, cat: "team", secret: true, test: (s) => team(s).some((m) => m.sp === 129 && m.lv >= 100) },
  { id: "pika-50", title: "Still Not Evolving", desc: "Have a Pikachu at level 50 or higher", points: 10, cat: "team", test: (s) => team(s).some((m) => m.sp === 25 && m.lv >= 50) },
  { id: "items-6", title: "Fully Equipped", desc: "Six Pokémon in your party, each holding an item", points: 10, cat: "team", needs: "items", test: (s) => team(s).length >= 6 && team(s).every((m) => m.item > 0) },
  { id: "babysitter", title: "Day Care on Legs", desc: "Carry a Pokémon 60 or more levels below your strongest", points: 10, cat: "team", test: (s) => { const l = team(s).map((m) => m.lv); return l.length >= 2 && Math.max(...l) - Math.min(...l) >= 60; } },
  { id: "one-hp", title: "Hanging by a Thread", desc: "Have a Pokémon survive on exactly 1 HP", points: 10, cat: "feat", test: (s) => s.partyLive && team(s).some((m) => m.hp === 1 && m.max > 1) },
  { id: "last-stand", title: "Last One Standing", desc: "Have five of six Pokémon fainted and one still going", points: 25, cat: "feat", test: (s) => s.partyLive && team(s).length >= 6 && alive(s).length === 1 },
  { id: "red-team", title: "Living Dangerously", desc: "Six conscious Pokémon, every one of them below a quarter of its HP", points: 25, cat: "feat", secret: true, test: (s) => s.partyLive && team(s).length >= 6 && alive(s).length === 6 && team(s).every((m) => m.hp * 4 < m.max) },
  // --- money and time
  { id: "money-50k", title: "Pocket Money", desc: "Hold ₽50,000", points: 5, cat: "wealth", test: (s) => (s.money ?? 0) >= 50000, progress: (s) => [s.money ?? 0, 50000] },
  { id: "money-250k", title: "Nest Egg", desc: "Hold ₽250,000", points: 10, cat: "wealth", test: (s) => (s.money ?? 0) >= 250000, progress: (s) => [s.money ?? 0, 250000] },
  { id: "money-max", title: "Wallet's Full", desc: "Hold ₽999,999", points: 50, cat: "wealth", test: (s) => s.money === 999999, progress: (s) => [s.money ?? 0, 999999] },
  { id: "broke", title: "Blacked Out", desc: "Have less than ₽100 after earning your third badge", points: 10, cat: "wealth", secret: true, test: (s) => s.money !== null && s.money < 100 && s.badges >= 3 },
  { id: "coins-1k", title: "Beginner's Luck", desc: "Hold 1,000 Game Corner coins", points: 10, cat: "wealth", needs: "coins", test: (s) => (s.coins ?? 0) >= 1000, progress: (s) => [s.coins ?? 0, 1000] },
  { id: "coins-max", title: "The House Loses", desc: "Hold 9,999 Game Corner coins", points: 50, cat: "wealth", needs: "coins", test: (s) => s.coins === 9999, progress: (s) => [s.coins ?? 0, 9999] },
  { id: "time-1", title: "Just One More Route", desc: "Play for 1 hour", points: 5, cat: "time", test: (s) => hours(s) >= 1 },
  { id: "time-10", title: "Settled In", desc: "Play for 10 hours", points: 10, cat: "time", test: (s) => hours(s) >= 10, progress: (s) => [Math.floor(hours(s)), 10] },
  { id: "time-50", title: "A Second Home", desc: "Play for 50 hours", points: 25, cat: "time", test: (s) => hours(s) >= 50, progress: (s) => [Math.floor(hours(s)), 50] },
  { id: "time-100", title: "Where Did the Time Go", desc: "Play for 100 hours", points: 50, cat: "time", test: (s) => hours(s) >= 100, progress: (s) => [Math.floor(hours(s)), 100] },
  // --- feats
  { id: "badge-rush", title: "No Time to Explain", desc: "Earn your fourth badge within 4 hours of play", points: 25, cat: "feat", test: (s, p) => gotBadges(4)(s, p) && hours(s) < 4 },
  { id: "badge8-small", title: "Skeleton Crew", desc: "Earn your eighth badge with three Pokémon or fewer", points: 25, cat: "feat", test: (s, p) => gotBadges(8)(s, p) && team(s).length <= 3 },
  { id: "badge8-solo", title: "One-Pokémon Army", desc: "Earn your eighth badge with a single Pokémon in your party", points: 50, cat: "feat", secret: true, test: (s, p) => gotBadges(8)(s, p) && team(s).length === 1 },
  { id: "champ-speed", title: "Any%", desc: "Enter the Hall of Fame in under 12 hours", points: 50, cat: "feat", needs: "hof", test: (s, p) => becameChampion(s, p) && hours(s) < 12 },
  { id: "champ-solo", title: "Solo Act", desc: "Enter the Hall of Fame with a single Pokémon in your party", points: 100, cat: "feat", needs: "hof", secret: true, test: (s, p) => becameChampion(s, p) && team(s).length === 1 },
  { id: "champ-trio", title: "Travelling Light", desc: "Enter the Hall of Fame with three Pokémon or fewer", points: 50, cat: "feat", needs: "hof", test: (s, p) => becameChampion(s, p) && team(s).length <= 3 },
  { id: "champ-low", title: "Underdog", desc: "Enter the Hall of Fame with nobody above level 50", points: 50, cat: "feat", needs: "hof", test: (s, p) => becameChampion(s, p) && team(s).every((m) => m.lv <= 50) },
  { id: "champ-clutch", title: "Photo Finish", desc: "Enter the Hall of Fame with only one Pokémon left standing", points: 50, cat: "feat", needs: "hof", test: (s, p) => becameChampion(s, p) && s.partyLive && team(s).length >= 2 && alive(s).length === 1 },
  { id: "champ-flawless", title: "Not a Scratch", desc: "Enter the Hall of Fame with a full team and nobody fainted", points: 25, cat: "feat", needs: "hof", test: (s, p) => becameChampion(s, p) && s.partyLive && team(s).length >= 6 && alive(s).length === 6 },
];

/** Badge achievements by bit (Gen 1–3, where the bit order is the game's own badge order). */
const badgeBits = (names: string[], leaders: string[], shift = 0, prefix = "badge"): Achievement[] => names.map((n, i) => ({
  id: `${prefix}-${i + 1}`, title: `${n} Badge`, desc: `Defeat ${leaders[i]}`, points: i < 4 ? 10 : 25, cat: "story" as Category,
  test: (s: GameState) => !!(s.badgeBits & (1 << (i + shift))),
}));
/** Badge achievements by count (Gen 4/5: the gyms come in a fixed order, so the n-th badge is always the same one). */
const badgeCount = (names: string[], leaders: string[]): Achievement[] => names.map((n, i) => ({
  id: `badge-${i + 1}`, title: `${n} Badge`, desc: `Defeat ${leaders[i]}`, points: i < 4 ? 10 : 25, cat: "story" as Category,
  test: (s: GameState) => (s.badgeBits & 0xFF).toString(2).split("1").length - 1 >= i + 1,
}));

// ================================================================ Kanto (Red · Blue · Yellow · FireRed · LeafGreen)
const KANTO_BADGES = badgeBits(["Boulder", "Cascade", "Thunder", "Rainbow", "Soul", "Marsh", "Volcano", "Earth"], ["Brock in Pewter", "Misty in Cerulean", "Lt. Surge in Vermilion", "Erika in Celadon", "Koga in Fuchsia", "Sabrina in Saffron", "Blaine on Cinnabar", "the Viridian Gym Leader"]);
const KANTO: Achievement[] = [
  ...KANTO_BADGES,
  { id: "champion", title: "Indigo Champion", desc: "Beat the Elite Four and your rival", points: 100, cat: "story", needs: "hof", test: (s) => s.champion },
  set("starters", "Oak's Table", "Own Bulbasaur, Charmander and Squirtle", 25, [1, 4, 7]),
  { id: "kanto-151", title: "The Original Hundred and Fifty", desc: "Own 150 of the first 151 Pokémon", points: 100, cat: "dex", test: (s) => inRange(s, 1, 151) >= 150, progress: (s) => [inRange(s, 1, 151), 150] },
  { id: "fossils", title: "Helix or Dome", desc: "Own Omanyte or Kabuto, and Aerodactyl", points: 25, cat: "dex", test: (s) => any(s, 138, 140) && has(s, 142) },
  set("birds", "Winged Mirages", "Own Articuno, Zapdos and Moltres", 50, [144, 145, 146], "legend"),
  one("mewtwo", 150, "Cerulean Cave", "Own Mewtwo", 50),
  { id: "beasts", title: "Still Running", desc: "Own Raikou, Entei or Suicune", points: 50, cat: "legend", minDex: 245, test: (s) => any(s, 243, 244, 245) },
  one("snorlax", 143, "Wake-Up Call", "Own Snorlax", 10, false, "dex"),
  one("lapras", 131, "Silph's Thank-You", "Own Lapras", 10, false, "dex"),
  one("abra", 63, "Quick Hands", "Own Abra", 5, false, "dex"),
  { id: "safari", title: "Safari Regular", desc: "Own Chansey, Kangaskhan, Scyther or Pinsir, and Tauros", points: 50, cat: "dex", test: (s) => has(s, 113, 115, 128) && any(s, 123, 127) },
  one("corner", 137, "Prize Counter", "Own Porygon", 25, false, "dex"),
  set("dratini", "Worth Every Coin", "Own Dratini, Dragonair and Dragonite", 25, [147, 148, 149]),
  set("farfetch", "Fair Trade", "Own Farfetch'd, Mr. Mime and Jynx", 25, [83, 122, 124]),
  set("hitmons", "Fighting Dojo", "Own both Hitmonlee and Hitmonchan", 25, [106, 107], "dex", true),
  set("eevee-3", "Three Stones", "Own Vaporeon, Jolteon and Flareon", 25, [134, 135, 136]),
  set("ghost", "Tower Ghost", "Own Gastly, Haunter and Gengar", 25, [92, 93, 94]),
  set("cubone", "For Mother", "Own Cubone and Marowak", 10, [104, 105]),
  { id: "mew-team", title: "Oak Would Like a Word", desc: "Walk around with Mewtwo in your party", points: 10, cat: "team", test: (s) => inParty(s, 150) },
  set("bugs", "Bug Catcher's Dream", "Own every Bug-type in Viridian Forest and beyond: Caterpie to Beedrill", 25, [10, 11, 12, 13, 14, 15]),
  set("trade-evos", "Link Cable Required", "Own Alakazam, Machamp, Golem and Gengar", 50, [65, 68, 76, 94]),
  set("rods", "Gone Fishing", "Own Magikarp, Poliwag, Goldeen, Horsea and Krabby", 25, [129, 60, 118, 116, 98]),
  { id: "voltorb", title: "Not an Item", desc: "Own Voltorb and Electrode", points: 10, cat: "dex", secret: true, test: (s) => has(s, 100, 101) },
  set("stones", "Moon Stone Collector", "Own Nidoking, Nidoqueen, Clefable and Wigglytuff", 25, [34, 31, 36, 40]),
];
const YELLOW: Achievement[] = [
  { id: "y-pika", title: "Best Friends", desc: "Have Pikachu in your party at level 50 or higher", points: 25, cat: "team", test: (s) => team(s).some((m) => m.sp === 25 && m.lv >= 50) },
  set("y-gifts", "Doorstep Gifts", "Own Bulbasaur, Charmander and Squirtle in Yellow", 50, [1, 4, 7]),
];

// ================================================================ Johto (Gold · Silver · Crystal · HeartGold · SoulSilver)
const JOHTO_NAMES = ["Zephyr", "Hive", "Plain", "Fog", "Mineral", "Storm", "Glacier", "Rising"];
const JOHTO_LEADERS = ["Falkner in Violet", "Bugsy in Azalea", "Whitney in Goldenrod", "Morty in Ecruteak", "Jasmine in Olivine", "Chuck in Cianwood", "Pryce in Mahogany", "Clair in Blackthorn"];
const KANTO_NAMES = ["Boulder", "Cascade", "Thunder", "Rainbow", "Soul", "Marsh", "Volcano", "Earth"];
const KANTO_LEADERS = ["Brock", "Misty", "Lt. Surge", "Erika", "Janine", "Sabrina", "Blaine", "Blue"];
const kantoCount = (s: GameState) => ((s.badgeBits >> 8) & 0xFF).toString(2).split("1").length - 1;
const JOHTO: Achievement[] = [
  { id: "champion", title: "Johto Champion", desc: "Beat the Elite Four and Lance (counted when you earn your first Kanto badge)", points: 100, cat: "story", needs: "champion", test: (s) => s.champion },
  { id: "kanto-1", title: "The Other Side of the Mountain", desc: "Earn a Kanto badge", points: 25, cat: "story", test: (s) => kantoCount(s) >= 1 },
  { id: "kanto-8", title: "Two Regions, One Trainer", desc: "Earn all eight Kanto badges", points: 50, cat: "story", test: (s) => kantoCount(s) >= 8, progress: (s) => [kantoCount(s), 8] },
  { id: "badges-16", title: "Sixteen", desc: "Hold all sixteen badges", points: 100, cat: "story", test: (s) => s.badges >= 16, progress: (s) => [s.badges, 16] },
  set("starters", "Elm's Lab", "Own Chikorita, Cyndaquil and Totodile", 25, [152, 155, 158]),
  set("j-beasts", "Burned Tower Survivors", "Own Raikou, Entei and Suicune", 50, [243, 244, 245], "legend"),
  one("lugia", 249, "Whirl Islands", "Own Lugia", 50), one("hooh", 250, "Bell Tower", "Own Ho-Oh", 50),
  { id: "red-gyarados", title: "Lake of Rage", desc: "Have a shiny Gyarados in your party", points: 25, cat: "team", needs: "shiny", test: (s) => team(s).some((m) => m.sp === 130 && m.shiny) },
  one("unown", 201, "Ruins of Alph", "Own Unown", 10, false, "dex"),
  one("sudo", 185, "That's Not a Tree", "Own Sudowoodo", 10, false, "dex"),
  set("babies", "Nursery Rhymes", "Own Pichu, Cleffa, Igglybuff, Togepi, Tyrogue, Smoochum, Elekid and Magby", 50, [172, 173, 174, 175, 236, 238, 239, 240]),
  set("larvitar", "Mt. Silver Monster", "Own Larvitar, Pupitar and Tyranitar", 50, [246, 247, 248]),
  set("j-eevee", "Day and Night", "Own Espeon and Umbreon", 25, [196, 197]),
  set("j-steel", "Metal Coat", "Own Scizor and Steelix", 25, [212, 208]),
  set("kingdra", "Dragon Scale", "Own Kingdra", 25, [230]),
  { id: "j-new", title: "New Kids on the Block", desc: "Own 50 Pokémon first found in Johto (#152–251)", points: 50, cat: "dex", test: (s) => inRange(s, 152, 251) >= 50, progress: (s) => [inRange(s, 152, 251), 50] },
  { id: "johto-100", title: "Johto Complete", desc: "Own all 100 Pokémon first found in Johto (#152–251)", points: 100, cat: "dex", test: (s) => inRange(s, 152, 251) >= 100, progress: (s) => [inRange(s, 152, 251), 100] },
  set("heracross", "Headbutt Trees", "Own Heracross and Aipom", 10, [214, 190]),
  set("tauros-miltank", "Moomoo Farm", "Own Miltank and Tauros", 10, [241, 128]),
  { id: "togepi", title: "Hatched Something Special", desc: "Own Togepi and Togetic", points: 10, cat: "dex", test: (s) => has(s, 175, 176) },
  { id: "ho-party", title: "Rainbow Wing", desc: "Walk around with Ho-Oh or Lugia in your party", points: 10, cat: "team", minDex: 250, test: (s) => inParty(s, 249) || inParty(s, 250) },
  ...badgeBits(KANTO_NAMES, KANTO_LEADERS.map((l) => `${l} in Kanto`), 8, "kbadge"),
];
const JOHTO_GB: Achievement[] = [...badgeBits(JOHTO_NAMES, JOHTO_LEADERS), ...JOHTO];
const JOHTO_DS: Achievement[] = [
  ...badgeCount(JOHTO_NAMES, JOHTO_LEADERS),
  ...JOHTO.map((a) => (a.id.startsWith("kbadge") ? { ...a, test: (s: GameState) => kantoCount(s) >= +a.id.split("-")[1] } : a)),
  set("hgss-weather", "Embedded Tower", "Own Kyogre, Groudon and Rayquaza", 100, [382, 383, 384], "legend"),
  one("arceus-hgss", 493, "Sinjoh Ruins", "Own Arceus", 50, true),
  set("hgss-sinnoh", "Fan Mail from Sinnoh", "Own the Sinnoh starters: Turtwig, Chimchar and Piplup", 50, [387, 390, 393]),
];

// ================================================================ Hoenn (Ruby · Sapphire · Emerald)
const HOENN: Achievement[] = [
  ...badgeBits(["Stone", "Knuckle", "Dynamo", "Heat", "Balance", "Feather", "Mind", "Rain"], ["Roxanne in Rustboro", "Brawly in Dewford", "Wattson in Mauville", "Flannery in Lavaridge", "your father, Norman", "Winona in Fortree", "Tate & Liza in Mossdeep", "the Sootopolis Gym Leader"]),
  { id: "champion", title: "Hoenn Champion", desc: "Beat the Elite Four and the Champion", points: 100, cat: "story", needs: "hof", test: (s) => s.champion },
  set("starters", "Birch's Briefcase", "Own Treecko, Torchic and Mudkip", 25, [252, 255, 258]),
  set("fossils", "Root and Claw", "Own both Lileep and Anorith", 25, [345, 347]),
  set("braille", "First Comes Last", "Own both Wailord and Relicanth", 25, [321, 369], "dex", true),
  set("regis", "Sealed Chamber", "Own Regirock, Regice and Registeel", 50, [377, 378, 379], "legend"),
  one("lati", 380, "Southern Islander", "Own Latias", 25), one("latios", 381, "Eon Flight", "Own Latios", 25),
  set("weather", "Weather Report", "Own Kyogre, Groudon and Rayquaza", 100, [382, 383, 384], "legend"),
  one("rayquaza", 384, "Sky Pillar Summit", "Own Rayquaza", 50),
  { id: "ray-party", title: "Leash Law", desc: "Walk around with Rayquaza in your party", points: 10, cat: "team", test: (s) => inParty(s, 406) },
  one("castform", 351, "Whatever the Weather", "Own Castform", 10, false, "dex"),
  one("kecleon", 352, "Something Unseeable", "Own Kecleon", 10, false, "dex"),
  one("absol", 359, "Bad Omen", "Own Absol", 10, false, "dex"),
  one("spinda", 327, "One in Four Billion", "Own Spinda", 5, false, "dex"),
  set("bagon", "Dreams of Flying", "Own Bagon, Shelgon and Salamence", 25, [371, 372, 373]),
  set("beldum", "Steven's Parting Gift", "Own Beldum, Metang and Metagross", 25, [374, 375, 376]),
  set("plusle", "Opposites Attract", "Own both Plusle and Minun", 10, [311, 312]),
  set("sun-moon", "Night and Day", "Own both Lunatone and Solrock", 25, [337, 338]),
  set("rivals", "Old Grudge", "Own both Zangoose and Seviper", 25, [335, 336]),
  set("wynaut", "Why Not?", "Own Wynaut and Wobbuffet", 10, [360, 202]),
];
const EMERALD_ONLY: Achievement[] = [
  set("em-both", "Peacekeeper", "Own both Kyogre and Groudon in Emerald", 50, [382, 383], "legend"),
  { id: "em-johto", title: "A Gift from Birch", desc: "Own a Chikorita, Cyndaquil or Totodile", points: 25, cat: "dex", secret: true, test: (s) => any(s, 152, 155, 158) },
  one("em-sudo", 185, "That's Not a Tree", "Own Sudowoodo", 10, false, "dex"),
  one("em-smeargle", 235, "Art Critic", "Own Smeargle", 10, false, "dex"),
];

// ================================================================ Sinnoh (Diamond · Pearl · Platinum)
const SINNOH: Achievement[] = [
  ...badgeCount(["Coal", "Forest", "Cobble", "Fen", "Relic", "Mine", "Icicle", "Beacon"], ["Roark in Oreburgh", "Gardenia in Eterna", "the third Gym Leader", "the fourth Gym Leader", "the fifth Gym Leader", "Byron in Canalave", "Candice in Snowpoint", "Volkner in Sunyshore"]),
  set("starters", "Rowan's Briefcase", "Own Turtwig, Chimchar and Piplup", 25, [387, 390, 393]),
  set("lakes", "Spirits of the Lakes", "Own Uxie, Mesprit and Azelf", 50, [480, 481, 482], "legend"),
  { id: "creation", title: "Spear Pillar", desc: "Own Dialga or Palkia", points: 50, cat: "legend", minDex: 484, test: (s) => any(s, 483, 484) },
  one("giratina", 487, "Distortion", "Own Giratina", 50),
  one("heatran", 485, "Stark Mountain", "Own Heatran", 50), one("regigigas", 486, "Snowpoint Temple", "Own Regigigas", 50),
  one("cresselia", 488, "Fullmoon Island", "Own Cresselia", 50), one("rotom", 479, "Something in the TV", "Own Rotom", 25),
  one("spiritomb", 442, "107 Spirits", "Own Spiritomb", 25, true),
  set("gible", "Land Shark", "Own Gible, Gabite and Garchomp", 50, [443, 444, 445]),
  set("riolu", "Aura Guardian", "Own Riolu and Lucario", 25, [447, 448]),
  set("honey", "Sweet Honey", "Own Combee, Munchlax and Heracross", 25, [415, 446, 214]),
  set("burmy", "Cloak Change", "Own Burmy, Wormadam and Mothim", 10, [412, 413, 414]),
  set("shellos", "East and West", "Own Shellos and Gastrodon", 10, [422, 423]),
  { id: "bidoof", title: "Bidoof Appreciation", desc: "Have a Bidoof or Bibarel at level 50 or higher in your party", points: 25, cat: "team", secret: true, test: (s) => team(s).some((m) => (m.sp === 399 || m.sp === 400) && m.lv >= 50) },
  { id: "sinnoh-evos", title: "Evolution Revolution", desc: "Own 10 of the new evolutions of older Pokémon (Magnezone, Togekiss, Weavile …)", points: 50, cat: "dex", test: (s) => count(s, SINNOH_EVOS) >= 10, progress: (s) => [count(s, SINNOH_EVOS), 10] },
  { id: "sinnoh-new", title: "Fresh From Sinnoh", desc: "Own 50 Pokémon first found in Sinnoh (#387–493)", points: 50, cat: "dex", test: (s) => inRange(s, 387, 493) >= 50, progress: (s) => [inRange(s, 387, 493), 50] },
  { id: "sinnoh-all", title: "Sinnoh Complete", desc: "Own all 107 Pokémon first found in Sinnoh (#387–493)", points: 100, cat: "dex", test: (s) => inRange(s, 387, 493) >= 107, progress: (s) => [inRange(s, 387, 493), 107] },
  set("eevee-sinnoh", "Moss and Ice", "Own Leafeon and Glaceon", 25, [470, 471]),
  one("chatot", 441, "Polly Wants a Cracker", "Own Chatot", 10, false, "dex"),
  { id: "arceus", title: "The Original One", desc: "Own Arceus", points: 100, cat: "legend", secret: true, minDex: 493, test: (s) => has(s, 493) },
];
const SINNOH_EVOS = [461, 462, 463, 464, 465, 466, 467, 468, 469, 470, 471, 472, 473, 474, 475, 476, 477, 478, 424, 429, 430];

// ================================================================ Unova (Black · White · Black 2 · White 2)
const UNOVA_COMMON: Achievement[] = [
  set("starters", "Juniper's Table", "Own Snivy, Tepig and Oshawott", 25, [495, 498, 501]),
  { id: "tao", title: "Ideals and Truth", desc: "Own Reshiram or Zekrom", points: 50, cat: "legend", minDex: 644, test: (s) => any(s, 643, 644) },
  one("kyurem", 646, "Giant Chasm", "Own Kyurem", 50),
  set("swords", "Swords of Justice", "Own Cobalion, Terrakion and Virizion", 50, [638, 639, 640], "legend"),
  { id: "genies", title: "Forces of Nature", desc: "Own Tornadus or Thundurus, and Landorus", points: 50, cat: "legend", minDex: 645, test: (s) => any(s, 641, 642) && has(s, 645) },
  one("victini", 494, "Liberty Garden", "Own Victini", 50, true), one("genesect", 649, "Plasma's Project", "Own Genesect", 50, true),
  one("meloetta", 648, "Relic Song", "Own Meloetta", 50, true), one("keldeo", 647, "Resolute", "Own Keldeo", 50, true),
  set("zorua", "Not What It Seems", "Own Zorua and Zoroark", 25, [570, 571], "dex", true),
  set("larvesta", "Sun Moth", "Own Larvesta and Volcarona", 50, [636, 637]),
  set("axew", "Dragon Tusks", "Own Axew, Fraxure and Haxorus", 25, [610, 611, 612]),
  set("deino", "Three Heads Are Better", "Own Deino, Zweilous and Hydreigon", 50, [633, 634, 635]),
  set("litwick", "Lights Out", "Own Litwick, Lampent and Chandelure", 25, [607, 608, 609]),
  set("trubbish", "Rubbish Collector", "Own Trubbish and Garbodor", 10, [568, 569]),
  set("vanilla", "Ice Cream Social", "Own Vanillite, Vanillish and Vanilluxe", 10, [582, 583, 584]),
  set("klink", "Gear Up", "Own Klink, Klang and Klinklang", 10, [599, 600, 601]),
  set("elgyem", "Area 51", "Own Elgyem and Beheeyem", 10, [605, 606]),
  set("tynamo", "Shock Value", "Own Tynamo, Eelektrik and Eelektross", 25, [602, 603, 604]),
  one("stunfisk", 618, "Pancake", "Own Stunfisk", 10, false, "dex"),
  set("yamask", "Mask Off", "Own Yamask and Cofagrigus", 10, [562, 563]),
  set("deerling", "Four Seasons", "Own Deerling and Sawsbuck", 10, [585, 586]),
  one("audino", 531, "Rustling Grass", "Own Audino", 5, false, "dex"),
  { id: "unova-new", title: "Fresh Faces", desc: "Own 50 Pokémon first found in Unova (#494–649)", points: 50, cat: "dex", test: (s) => inRange(s, 494, 649) >= 50, progress: (s) => [inRange(s, 494, 649), 50] },
  { id: "unova-all", title: "Unova Complete", desc: "Own all 156 Pokémon first found in Unova (#494–649)", points: 100, cat: "dex", test: (s) => inRange(s, 494, 649) >= 156, progress: (s) => [inRange(s, 494, 649), 156] },
  { id: "old-friends", title: "Old Friends", desc: "Own 25 Pokémon from before Unova", points: 25, cat: "dex", secret: true, test: (s) => inRange(s, 1, 493) >= 25, progress: (s) => [inRange(s, 1, 493), 25] },
];
const UNOVA_BW = [
  ...badgeCount(["Trio", "Basic", "Insect", "Bolt", "Quake", "Jet", "Freeze", "Legend"], ["the Striaton triplets", "Lenora in Nacrene", "Burgh in Castelia", "Elesa in Nimbasa", "Clay in Driftveil", "Skyla in Mistralton", "Brycen in Icirrus", "the Opelucid Gym Leader"]),
  ...UNOVA_COMMON,
];
const UNOVA_B2W2 = [
  ...badgeCount(["Basic", "Toxic", "Insect", "Bolt", "Quake", "Jet", "Legend", "Wave"], ["Cheren in Aspertia", "Roxie in Virbank", "Burgh in Castelia", "Elesa in Nimbasa", "Clay in Driftveil", "Skyla in Mistralton", "Drayden in Opelucid", "Marlon in Humilau"]),
  ...UNOVA_COMMON,
  set("b2-kyurem", "Black and White", "Own Reshiram, Zekrom and Kyurem", 100, [643, 644, 646], "legend"),
  set("b2-regis", "Clay's Collection", "Own Regirock, Regice, Registeel and Regigigas", 50, [377, 378, 379, 486], "legend"),
];

// ---------------------------------------------------------------- lookup
const BY_VERSION: Record<string, Achievement[]> = {
  red: KANTO, blue: KANTO, yellow: [...KANTO, ...YELLOW], firered: KANTO, leafgreen: KANTO,
  gold: JOHTO_GB, silver: JOHTO_GB, crystal: JOHTO_GB, heartgold: JOHTO_DS, soulsilver: JOHTO_DS,
  ruby: HOENN, sapphire: HOENN, emerald: [...HOENN, ...EMERALD_ONLY],
  diamond: SINNOH, pearl: SINNOH, platinum: SINNOH,
  black: UNOVA_BW, white: UNOVA_BW, black2: UNOVA_B2W2, white2: UNOVA_B2W2,
};
const cache = new Map<string, Achievement[]>();
/** The achievement list for a game: its region's set plus the shared one, minus anything that game can't report. */
export function achievementsFor(rom: Parameters<typeof gameFor>[0]): Achievement[] | null {
  const g = gameFor(rom);
  if (!g) return null;
  const hit = cache.get(g.key);
  if (hit) return hit;
  const seenIds = new Set<string>();
  const list = [...(BY_VERSION[g.version] ?? []), ...COMMON].filter((a) => {
    if (seenIds.has(a.id)) return false;
    if (a.needs && !g.caps.includes(a.needs)) return false;
    if (a.minDex && a.minDex > g.dexMax) return false;
    seenIds.add(a.id);
    return true;
  });
  cache.set(g.key, list);
  return list;
}
export const totalPoints = (list: Achievement[]) => list.reduce((a, x) => a + x.points, 0);
export const CATEGORY_LABEL: Record<Category, string> = { story: "Story", dex: "Pokédex", legend: "Legendary", team: "Team", wealth: "Wealth", time: "Time", feat: "Feats" };
/** XP towards your account level per achievement point */
export const XP_PER_POINT = 5;

/** Achievements that just became true. */
export function newlyUnlocked(list: Achievement[], s: GameState, prev: GameState | null, have: Record<string, number>) {
  return list.filter((a) => !have[a.id] && (() => { try { return a.test(s, prev); } catch { return false; } })());
}
