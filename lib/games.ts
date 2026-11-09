export type System = "gb" | "gbc" | "gba" | "nds";

export const SYSTEMS: Record<System, { label: string; core: string; exts: string[] }> = {
  gb:  { label: "GAME BOY",  core: "gb",  exts: ["gb"] },
  gbc: { label: "GB COLOR",  core: "gb",  exts: ["gbc"] },
  gba: { label: "GB ADVANCE", core: "gba", exts: ["gba"] },
  nds: { label: "DS",        core: "nds", exts: ["nds"] },
};

export function systemFromFilename(name: string): System | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  for (const [k, v] of Object.entries(SYSTEMS)) if (v.exts.includes(ext)) return k as System;
  return null;
}

/** Cartridge colour + generation guess from the filename — purely cosmetic. */
const PALETTES: [RegExp, string, string][] = [
  [/\bred\b|fire ?red/i, "#d8343a", "I"],
  [/\bblue\b/i, "#2f5fd0", "I"],
  [/yellow/i, "#f2c230", "I"],
  [/\bgreen\b|leaf ?green/i, "#3a9a4a", "I"],
  [/\bgold\b|heart ?gold/i, "#c9a227", "II"],
  [/silver|soul ?silver/i, "#a9b3c1", "II"],
  [/crystal/i, "#6fc6e8", "II"],
  [/ruby/i, "#b3123b", "III"],
  [/sapphire/i, "#1d3fa3", "III"],
  [/emerald/i, "#1f9e6a", "III"],
  [/diamond/i, "#8fb8ff", "IV"],
  [/pearl/i, "#e7b7c8", "IV"],
  [/platinum/i, "#7d8590", "IV"],
  [/black ?2|black/i, "#2b2b2b", "V"],
  [/white ?2|white/i, "#ecebe6", "V"],
];
export function cartStyle(name: string) {
  for (const [re, color, gen] of PALETTES) if (re.test(name)) return { color, gen };
  return { color: "#8a7fd0", gen: "?" };
}

export function cleanTitle(filename: string) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[\[(][^\])]*[\])]/g, "")
    .replace(/[_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type RomEntry = {
  id: string;
  title: string;
  filename: string;
  system: System;
  size: number;
  addedAt: number;
  lastPlayedAt?: number;
  playSeconds?: number;
  shotVer?: string;      // save version whose screenshot is the "hero" art
  coverVer?: string;     // stored cover image version
  coverSource?: "auto" | "custom";
  coverName?: string;    // matched boxart name, e.g. "Pokemon - Emerald Version (USA, Europe)"
  header?: { title: string; code?: string; region?: string }; // read from the cartridge header
};
/** RomEntry as sent to the browser, with short-lived signed image URLs */
export type RomView = RomEntry & { shotUrl?: string | null; coverUrl?: string | null };

export type SaveVersion = {
  ver: string;          // "<ms timestamp>-<rand>"
  updatedAt: number;
  device: string;       // human label, e.g. "Firefox · Windows"
  deviceId: string;
  hasState: boolean;
  hasSram: boolean;
  stateGz: boolean;
  hasShot?: boolean;
  reason: "auto" | "manual" | "leave" | "ingame";
};
export type SaveMeta = {
  current: SaveVersion | null;
  history: SaveVersion[]; // newest first, includes current
  playSeconds: number;
};
export const HISTORY_KEEP = 6;
