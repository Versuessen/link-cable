"use client";
import { useEffect, useState } from "react";
// Rounded line icons (24px grid, 2px stroke) — drawn here so there's no icon-font dependency.
const P: Record<string, React.ReactNode> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  home: <path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />,
  grid: <><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></>,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  gear: <><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></>,
  power: <><path d="M12 3v8" /><path d="M6.3 7a8 8 0 1 0 11.4 0" /></>,
  play: <path d="M8 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5z" fill="currentColor" stroke="none" />,
  image: <><rect x="3.5" y="5" width="17" height="14" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" /></>,
  pencil: <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16zM13.5 6.5l4 4" />,
  trash: <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  cloud: <g transform="translate(-.2 1.6)"><path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 8.5 4.8 4.8 0 0 1 17.5 18z" /></g>,
  cloudok: <g transform="translate(-.2 1.6)"><path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 8.5 4.8 4.8 0 0 1 17.5 18z" /><path d="m9.5 13 2 2 3.5-3.5" /></g>,
  cloudup: <g transform="translate(-.2 1.6)"><path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 8.5 4.8 4.8 0 0 1 17.5 18z" /><path d="M12 16v-5M9.5 13l2.5-2.5 2.5 2.5" /></g>,
  sync: <><path d="M20 11a8 8 0 0 0-14.3-4.3L4 9" /><path d="M4 4v5h5" /><path d="M4 13a8 8 0 0 0 14.3 4.3L20 15" /><path d="M20 20v-5h-5" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  sound: <><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" /></>,
  pad: <><path d="M7 7h10a4.5 4.5 0 0 1 4.4 5.4l-.9 4.4a2.5 2.5 0 0 1-4.3 1.2L14 15.8h-4L7.8 18a2.5 2.5 0 0 1-4.3-1.2l-.9-4.4A4.5 4.5 0 0 1 7 7z" /><path d="M8 10v3M6.5 11.5h3" /><circle cx="16" cy="11" r=".6" fill="currentColor" /><circle cx="17.5" cy="12.8" r=".6" fill="currentColor" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="9.5" rx="2.5" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  down: <path d="m6 9 6 6 6-6" />,
  disk: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></>,
  cart: <><rect x="6" y="3.5" width="12" height="17" rx="2" /><rect x="8.5" y="6.5" width="7" height="6" rx="1" /><path d="M9 17h2M14.5 16.5v1" /></>,
  wifi: <><path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0" /><circle cx="12" cy="19" r="1" fill="currentColor" /></>,
  wifioff: <><path d="M8.5 16a5 5 0 0 1 7 0M3 3l18 18" /><circle cx="12" cy="19" r="1" fill="currentColor" /></>,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  users: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" /><path d="M15 5.5a3.2 3.2 0 0 1 0 6.2M17 14a5.5 5.5 0 0 1 3.5 5.5" /></>,
  layers: <><path d="m12 4 8 4-8 4-8-4z" /><path d="m4 12 8 4 8-4M4 16l8 4 8-4" /></>,
  leaf: <><path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15" /><path d="M5 19c3-4 6-7 10-9" /></>,
  flame: <path d="M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-3 5-3 8a6 6 0 0 0 6 6z" />,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  star: <path d="m12 3.5 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9z" />,
  shield: <><path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z" /><path d="m9 12 2 2 4-4" /></>,
  flask: <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" /><path d="M7.5 15h9" /></>,
  auto: <><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 4v4.5h-4.5" /><path d="m9.5 15 2.5-6 2.5 6M10.3 13.2h3.4" /></>,
  reset: <><path d="M4 12a8 8 0 1 0 2.3-5.6" /><path d="M4 4v4.5h4.5" /></>,
  up: <path d="m6 15 6-6 6 6" />,
};

export default function Icon({ name, size = 22, className = "", stroke = 2 }: { name: keyof typeof P | string; size?: number; className?: string; stroke?: number }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {P[name] ?? P.grid}
    </svg>
  );
}

export function Battery({ level, charging }: { level: number; charging?: boolean }) {
  return (
    <svg className="icon battery" width={38} height={20} viewBox="0 0 38 20" aria-hidden>
      <rect x="1.5" y="2.5" width="31" height="15" rx="4.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <rect x="34.5" y="7" width="2.5" height="6" rx="1.2" fill="currentColor" />
      <rect x="4.5" y="5.5" width={Math.max(2, 25 * level)} height="9" rx="2.2" fill={charging ? "var(--ok)" : level < 0.2 ? "var(--danger)" : "currentColor"} />
    </svg>
  );
}

/*
 * Round profile badge: a preset character picture (amiibo figure / Pokémon render) or the initial, on the account colour.
 * Framing lives in the URL fragment so it travels with the picture everywhere: `…png#a=<zoom>,<x%>,<y%>`.
 * Without it, figures are framed automatically from the image itself (head and shoulders), Pokémon are shown whole.
 */
export type Framing = { z: number; x: number; y: number };
export function parseAvatar(src?: string | null): { url: string; kind: "poke" | "fig" | ""; framing: Framing | null } {
  if (!src) return { url: "", kind: "", framing: null };
  const [url, hash = ""] = src.split("#");
  const m = hash.match(/^a=(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)$/);
  return { url, kind: url.includes("/PokeAPI/") ? "poke" : "fig", framing: m ? { z: +m[1], x: +m[2], y: +m[3] } : null };
}
export const withFraming = (src: string, f: Framing | null) => src.split("#")[0] + (f ? `#a=${f.z.toFixed(2)},${f.x.toFixed(1)},${f.y.toFixed(1)}` : "");

const autoMem = new Map<string, Framing>();
/** Head-and-shoulders framing for a full-body figure, measured from its alpha channel. */
export function autoFraming(img: HTMLImageElement, url: string): Framing | null {
  const hit = autoMem.get(url); if (hit) return hit;
  try {
    const N = 64, c = document.createElement("canvas"); c.width = c.height = N;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    const ar = img.naturalWidth / img.naturalHeight, w = ar >= 1 ? N : N * ar, h = ar >= 1 ? N / ar : N;
    ctx.drawImage(img, (N - w) / 2, (N - h) / 2, w, h); // same as object-fit: contain
    const px = ctx.getImageData(0, 0, N, N).data, op = (x: number, y: number) => px[(y * N + x) * 4 + 3] > 60;
    let x0 = N, x1 = 0, y0 = N, y1 = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (op(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 <= x0 || y1 <= y0) return null;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    // tall figures → show the top ~42 %; round ones (Kirby, Poké Ball…) → show everything
    const t = Math.max(0, Math.min(1, (bw / bh - 0.45) / 0.5)), frac = 0.42 + t * 0.58;
    const yEnd = Math.min(N - 1, Math.round(y0 + bh * frac));
    let sx = 0, n = 0, hx0 = N, hx1 = 0;
    for (let y = y0; y <= yEnd; y++) for (let x = 0; x < N; x++) if (op(x, y)) { sx += x; n++; hx0 = Math.min(hx0, x); hx1 = Math.max(hx1, x); }
    const cx = n ? sx / n : (x0 + x1) / 2, cy = (y0 + yEnd) / 2;
    const span = Math.max(hx1 - hx0 + 1, yEnd - y0 + 1) / N;
    const z = Math.max(1, Math.min(3.4, 0.84 / span));
    const f = { z, x: -z * (cx / N - 0.5) * 100, y: -z * (cy / N - 0.5) * 100 };
    autoMem.set(url, f);
    return f;
  } catch { return null; }
}

export function Avatar({ name = "?", color = "#ff9f1a", src, size = 48 }: { name?: string; color?: string; src?: string | null; size?: number }) {
  const { url, kind, framing } = parseAvatar(src);
  const [auto, setAuto] = useState<Framing | null>(() => (url && autoMem.get(url)) || null);
  useEffect(() => { setAuto((url && autoMem.get(url)) || null); }, [url]);
  const f = framing ?? (kind === "fig" ? auto : null) ?? (kind === "poke" ? { z: 0.86, x: 0, y: 0 } : null);
  return (
    <span className={`avatar ${kind}`} style={{ width: size, height: size, fontSize: size * 0.42, ["--av" as any]: color }} aria-hidden>
      {url ? (
        <img src={url} alt="" draggable={false} loading="lazy" crossOrigin={kind === "fig" ? "anonymous" : undefined}
          onLoad={kind === "fig" && !framing ? (e) => setAuto(autoFraming(e.currentTarget, url)) : undefined}
          style={f ? { transform: `translate(${f.x}%, ${f.y}%) scale(${f.z})`, opacity: 1 } : { opacity: kind === "fig" ? 0 : 1 }} />
      ) : <span>{name.trim()[0]?.toUpperCase() ?? "?"}</span>}
    </span>
  );
}
