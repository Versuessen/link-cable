/*
 * Automatic cover art.
 *
 * ROM files contain no artwork, so covers come from the libretro-thumbnails project (the boxart set
 * RetroArch uses), named after the No-Intro database ("Pokemon - Emerald Version (USA, Europe)").
 * We download each system's *index* of names (not the images), cache it in the bucket, and match:
 *   1. the ROM filename, and
 *   2. the title + game code baked into the cartridge header (works even for files named "game1.gba"),
 * preferring the cartridge's own region. Only the single matched image is downloaded and stored.
 */
import type { System } from "./games";
import { getJson, putJson } from "./s3";

const HOST = "https://thumbnails.libretro.com";
export const DIRS: Record<System, string[]> = {
  gb: ["Nintendo - Game Boy", "Nintendo - Game Boy Color"],
  gbc: ["Nintendo - Game Boy Color", "Nintendo - Game Boy"],
  gba: ["Nintendo - Game Boy Advance"],
  nds: ["Nintendo - Nintendo DS"],
};
export const thumbUrl = (dir: string, name: string) =>
  `${HOST}/${encodeURIComponent(dir)}/Named_Boxarts/${encodeURIComponent(name.replace(/[&*/:`<>?\\|"]/g, "_"))}.png`;

// ---------------------------------------------------------------- index (cached 7 days, shared by all users)
const mem = new Map<string, { at: number; names: string[] }>();
const WEEK = 7 * 86400_000;

export async function boxartIndex(dir: string): Promise<string[]> {
  const m = mem.get(dir);
  if (m && Date.now() - m.at < WEEK) return m.names;
  const key = `shared/boxart-index/${dir.replace(/[^a-z0-9]+/gi, "_")}.json`;
  const cached = await getJson<{ at: number; names: string[] }>(key).catch(() => null);
  if (cached && Date.now() - cached.at < WEEK) { mem.set(dir, cached); return cached.names; }
  try {
    const html = await fetch(`${HOST}/${encodeURIComponent(dir)}/Named_Boxarts/`, { headers: { "User-Agent": "linkcable-rom-library" } }).then((r) => {
      if (!r.ok) throw new Error(`index ${r.status}`);
      return r.text();
    });
    const names = parseListing(html);
    const entry = { at: Date.now(), names };
    mem.set(dir, entry);
    await putJson(key, entry).catch(() => {});
    return names;
  } catch (e) {
    if (cached) return cached.names; // stale is better than nothing
    throw e;
  }
}

export function parseListing(html: string) {
  const out: string[] = [];
  for (const m of html.matchAll(/href="([^"?/][^"]*?)\.png"/g)) {
    try { out.push(decodeURIComponent(m[1]).replace(/&amp;/g, "&")); } catch {}
  }
  return out;
}

// ---------------------------------------------------------------- cartridge header
export type Header = { title: string; code?: string; region?: string };
const REGION_BY_CODE: Record<string, string> = { E: "usa", P: "europe", D: "germany", F: "france", S: "spain", I: "italy", J: "japan", U: "australia", K: "korea", X: "europe", Y: "europe" };
const ascii = (b: Uint8Array, from: number, len: number) =>
  String.fromCharCode(...b.slice(from, from + len)).replace(/[^\x20-\x7e]/g, "").trim();

export function readHeader(system: System, b: Uint8Array): Header | null {
  const h = rawHeader(system, b);
  return h && h.title.length >= 2 ? h : null; // blank/garbage header → don't trust it
}
function rawHeader(system: System, b: Uint8Array): Header | null {
  try {
    if (system === "gba" && b.length >= 0xb0) {
      const code = ascii(b, 0xac, 4);
      return { title: ascii(b, 0xa0, 12), code, region: REGION_BY_CODE[code[3]] };
    }
    if (system === "nds" && b.length >= 0x10) {
      const code = ascii(b, 0x0c, 4);
      return { title: ascii(b, 0x00, 12), code, region: REGION_BY_CODE[code[3]] };
    }
    if ((system === "gb" || system === "gbc") && b.length >= 0x150) {
      return { title: ascii(b, 0x134, b[0x143] & 0x80 ? 11 : 16), region: b[0x14a] === 0 ? "japan" : undefined };
    }
  } catch {}
  return null;
}

// ---------------------------------------------------------------- matching
const STOP = new Set(["the", "a", "an", "of", "and", "version", "edition", "rom", "usa", "europe", "eur", "us", "eu", "jp", "jpn", "japan"]);
const deaccent = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
const base = (s: string) => deaccent(s).toLowerCase().replace(/\.(gba|gbc|gb|nds|zip|7z)$/, "").replace(/[([{][^)\]}]*[)\]}]/g, " ").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const toks = (s: string) => base(s).split(" ").filter((t) => t && !STOP.has(t) && !/^\d{3,4}$/.test(t) /* dump numbers like "1986 - " */);
const tags = (s: string) => [...deaccent(s).toLowerCase().matchAll(/[([]([^)\]]*)[)\]]/g)].map((m) => m[1]);

const BAD = /\b(demo|kiosk|beta|proto|sample|debug|hack|distribution|prototype|aftermarket|unl|pirate|competition|program)\b/;
const REGIONS = ["usa", "europe", "germany", "france", "spain", "italy", "japan", "australia", "korea", "world", "uk"];

function dice(a: string[], b: string[], prefix = false) {
  if (!a.length || !b.length) return 0;
  let hit = 0;
  const pool = [...b];
  for (const t of a) {
    const i = pool.findIndex((u) => u === t || (prefix && t.length >= 3 && u.startsWith(t)));
    if (i >= 0) { hit++; pool.splice(i, 1); }
  }
  return (2 * hit) / (a.length + b.length);
}

export type Candidate = { name: string; dir: string; score: number; url: string };

export function rank(names: { name: string; dir: string }[], filename: string, header: Header | null, query?: string): Candidate[] {
  const ft = toks(query ?? filename);
  // cartridge headers are cut off at 12 chars ("POKEMON EMER") → prefix matching
  const ht = header?.title ? toks(header.title) : [];
  const ftags = tags(filename).join(" ");
  const wantRegion = REGIONS.find((r) => ftags.includes(r)) ?? header?.region;
  const wantRev = /rev\s*\d/.exec(ftags)?.[0];
  const out: Candidate[] = [];
  for (const { name, dir } of names) {
    const nt = toks(name);
    // short names ("Pokemon Yellow") fully contained in a longer official title still count, minus a little per extra word
    const cover = ft.length >= 2 && ft.every((t) => nt.includes(t)) ? 0.9 - 0.02 * (nt.length - ft.length) : 0;
    const s1 = Math.max(dice(ft, nt), cover);
    const s2 = ht.length && !query ? dice(ht, nt, true) * 0.9 : 0;
    let score = Math.max(s1, s2);
    if (score < 0.4) continue;
    const ntags = tags(name).join(" ");
    if (BAD.test(ntags) && !BAD.test(ftags)) score -= 0.35;
    const nRegion = REGIONS.find((r) => ntags.includes(r));
    if (wantRegion && ntags.includes(wantRegion)) score += 0.08;
    else if (wantRegion && ["germany", "france", "spain", "italy", "uk"].includes(wantRegion) && ntags.includes("europe")) score += 0.04;
    else if (wantRegion && nRegion && nRegion !== "world") score -= 0.05;
    else if (!wantRegion && /usa|europe|world/.test(ntags)) score += 0.04;
    if (wantRev && ntags.includes(wantRev)) score += 0.02;
    if (/\b(es|fr|de|it)\b.*\b(es|fr|de|it)\b/.test(ntags) && wantRegion === "europe") score += 0.01;
    out.push({ name, dir, score: Math.round(score * 1000) / 1000, url: thumbUrl(dir, name) });
  }
  return out.sort((a, b) => b.score - a.score || a.name.length - b.name.length).slice(0, 12);
}

export async function findCovers(system: System, filename: string, header: Header | null, query?: string) {
  const lists = await Promise.all(DIRS[system].map(async (dir) => (await boxartIndex(dir).catch(() => [])).map((name) => ({ name, dir }))));
  return rank(lists.flat(), filename, header, query);
}

/** A match is used automatically only when it's clearly the same game. */
export const confident = (c: Candidate[]) => !!c[0] && c[0].score >= 0.85 && (!c[1] || base(c[1].name) === base(c[0].name) || c[0].score - c[1].score >= 0.015);
