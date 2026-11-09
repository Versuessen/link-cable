/*
 * Preset profile pictures:
 *  - amiibo figures via AmiiboAPI (amiiboapi.org) → nearly every Nintendo character, grouped by game series
 *  - every Pokémon via PokéAPI's official-artwork sprites
 * Only the index (names + image URLs) is cached in the bucket; images load straight from GitHub.
 */
import { getJson, putJson } from "./s3";

export type AvatarOpt = { n: string; s: string; u: string }; // name, series/group, image url
export type AvatarIndex = { at: number; amiibo: AvatarOpt[]; pokemon: AvatarOpt[] };
export const AVATAR_HOSTS = [
  "https://raw.githubusercontent.com/8bitDream/AmiiboAPI/",
  "https://raw.githubusercontent.com/N3evin/AmiiboAPI/",
  "https://raw.githubusercontent.com/PokeAPI/sprites/",
];
export const validAvatarUrl = (u: unknown) => typeof u === "string" && u.length < 300 && AVATAR_HOSTS.some((h) => u.startsWith(h)) && !u.includes("..");

const KEY = "shared/avatar-index.json";
const MONTH = 30 * 86400_000;
let mem: AvatarIndex | null = null;
const UA = { headers: { "User-Agent": "linkcable-rom-library" } };

const GEN = [[151, "Kanto"], [251, "Johto"], [386, "Hoenn"], [493, "Sinnoh"], [649, "Unova"], [721, "Kalos"], [809, "Alola"], [905, "Galar"], [1025, "Paldea"]] as const;
const region = (id: number) => GEN.find(([max]) => id <= max)?.[1] ?? "Other";
const title = (s: string) => s.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ").replace(/ (F|M)$/, (m) => (m === " F" ? " ♀" : " ♂"));

export async function avatarIndex(): Promise<AvatarIndex> {
  if (mem && Date.now() - mem.at < MONTH) return mem;
  const cached = await getJson<AvatarIndex>(KEY).catch(() => null);
  if (cached && Date.now() - cached.at < MONTH) return (mem = cached);
  try {
    const [am, pk] = await Promise.all([
      fetch("https://www.amiiboapi.org/api/amiibo/", UA).then((r) => r.json()),
      fetch("https://pokeapi.co/api/v2/pokemon-species?limit=2000", UA).then((r) => r.json()),
    ]);
    const seen = new Set<string>();
    const amiibo: AvatarOpt[] = [];
    for (const a of am.amiibo as any[]) {
      if (!["Figure", "Yarn", "Band"].includes(a.type) || !a.image) continue;
      const n = String(a.name).replace(/\s*-\s*/g, " – ");
      const k = `${a.character}|${n}`;
      if (seen.has(k)) continue;
      seen.add(k);
      amiibo.push({ n, s: a.gameSeries || a.amiiboSeries || "Other", u: a.image });
    }
    amiibo.sort((x, y) => x.s.localeCompare(y.s) || x.n.localeCompare(y.n));
    const pokemon: AvatarOpt[] = (pk.results as { name: string; url: string }[]).map((p) => {
      const id = Number(p.url.match(/\/(\d+)\/?$/)?.[1]);
      return { n: title(p.name), s: region(id), u: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`, id } as AvatarOpt & { id: number };
    }).sort((a: any, b: any) => a.id - b.id).map(({ n, s, u }) => ({ n, s, u }));
    mem = { at: Date.now(), amiibo, pokemon };
    await putJson(KEY, mem).catch(() => {});
    return mem;
  } catch (e) {
    if (cached) return (mem = cached);
    throw e;
  }
}
