"use client";
import { useEffect, useState } from "react";
import { cartStyle, type RomView } from "./games";

/*
 * The "middle" colour of a game's artwork, used to tint the animated home background.
 * Downsamples the image, ignores near-white/near-black/grey pixels (box-art borders, outlines),
 * takes the per-channel median, then normalises lightness/saturation so it works as a soft wash.
 */
const mem = new Map<string, string>();
const LS = "lc_artcolor_v1";
const store: Record<string, string> = (() => { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch { return {}; } })();

function median(a: number[]) { const s = a.sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 128; }

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export async function sampleColor(url: string): Promise<string | null> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  try { await img.decode(); } catch { return null; }
  const c = document.createElement("canvas"); c.width = c.height = 40;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, 40, 40);
  let px: Uint8ClampedArray;
  try { px = ctx.getImageData(0, 0, 40, 40).data; } catch { return null; } // no CORS → can't read pixels
  const rs: number[] = [], gs: number[] = [], bs: number[] = [], all: [number[], number[], number[]] = [[], [], []];
  for (let i = 0; i < px.length; i += 4) {
    const [r, g, b, a] = [px[i], px[i + 1], px[i + 2], px[i + 3]];
    if (a < 200) continue;
    all[0].push(r); all[1].push(g); all[2].push(b);
    const [, s, l] = rgbToHsl(r, g, b);
    if (l > 0.9 || l < 0.12 || s < 0.22) continue;
    rs.push(r); gs.push(g); bs.push(b);
  }
  const use = rs.length > 60 ? [rs, gs, bs] : all;
  const [h, s] = rgbToHsl(median(use[0]), median(use[1]), median(use[2]));
  // soft, readable wash colour: keep the hue, tame saturation, fix lightness
  return `hsl(${Math.round(h)} ${Math.round(Math.min(0.85, Math.max(0.35, s)) * 100)}% 58%)`;
}

/** Background tint for a game: cached per artwork version. */
export function useArtColor(rom: RomView | null) {
  const fallback = rom ? cartStyle(rom.title).color : "#5ac8fa";
  const url = rom ? rom.coverUrl ?? rom.shotUrl : null;
  const key = rom ? `${rom.id}:${rom.coverVer ?? rom.shotVer ?? "gen"}` : "";
  const [color, setColor] = useState<string>(() => (key && (mem.get(key) ?? store[key])) || fallback);
  useEffect(() => {
    if (!rom) { setColor(fallback); return; }
    const hit = mem.get(key) ?? store[key];
    if (hit) { setColor(hit); return; }
    setColor(fallback);
    if (!url) return;
    let dead = false;
    sampleColor(url).then((c) => {
      if (!c) return;
      mem.set(key, c); store[key] = c;
      try { localStorage.setItem(LS, JSON.stringify(store)); } catch {}
      if (!dead) setColor(c);
    });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return color;
}

/** A muted backdrop colour for a profile picture: the picture's own middle colour, softened. Returns #rrggbb. */
export async function sampleAvatarColor(url: string): Promise<string | null> {
  const m = (await sampleColor(url))?.match(/hsl\((\d+) (\d+)% (\d+)%\)/);
  if (!m) return null;
  const h = +m[1], sat = Math.min(0.5, (+m[2] / 100) * 0.6), l = 0.6;
  const a = sat * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, "0"); };
  return `#${f(0)}${f(8)}${f(4)}`;
}
