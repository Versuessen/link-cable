"use client";
import { useId } from "react";
import { Avatar } from "./Icon";
import { FRAMES, type FrameTier } from "../lib/flair";

/*
 * Profile frames, drawn in SVG. Units: avatar radius 30 · band 31–39.
 *  tier  → material + texture (shell / engraving / beads / laurel / foil / facets) + motion
 *  stage → progression studs on the top of the band: 0 plain · 1 ● · 2 ●● · 3 ●●● · 4 ★ (with ●●)
 *  max   → Lv 999: crown + slowly fading sparkles
 */
type Mat = { band: string[]; lip: string; hi: string; leaf: [string, string]; gem: [string, string, string]; text: string; plate: string[]; brushed: boolean; emboss?: string };
const M: Record<string, Mat> = {
  // raw hard ABS shell (DMG grey): smooth, semi-gloss, no texture, magenta A/B-style buttons
  plastic: { band: ["#ebe8e2", "#d2cec6", "#bcb7ad"], lip: "#5a564e", hi: "#ffffff", leaf: ["#e9e6df", "#a6a196"], gem: ["#ffc6e2", "#c4246f", "#640a36"], text: "#38342e", plate: ["#fbf9f4", "#ebe7de"], brushed: false },
  // warm red-orange bronze with turquoise
  bronze: { band: ["#ffd3a8", "#cf7436", "#7a3410", "#eb9658", "#572304"], lip: "#331202", hi: "#ffe6cc", leaf: ["#f0a56b", "#8a3c12"], gem: ["#dcfffa", "#20c4b0", "#03605a"], text: "#2a1002", plate: ["#ffd8b2", "#d4803f", "#8a3c12"], brushed: true },
  // bright, cool mirror silver with sapphires
  silver: { band: ["#ffffff", "#eef2f7", "#aebbc9", "#fbfdff", "#8a98a9"], lip: "#435062", hi: "#ffffff", leaf: ["#f4f6f9", "#8d97a3"], gem: ["#dff0ff", "#3c8dff", "#0b379b"], text: "#1d2734", plate: ["#ffffff", "#dfe5ec", "#97a4b3"], brushed: true },
  gold: { band: ["#fff6c8", "#f4c64f", "#b07a12", "#ffe48c", "#8a5a08"], lip: "#6b4204", hi: "#fffbe6", leaf: ["#ffe58f", "#b07a12"], gem: ["#ffe0e8", "#ff3d6a", "#9c0a2e"], text: "#4a3105", plate: ["#fff6c8", "#efbb3c", "#a06c0c"], brushed: true },
  platinum: { band: ["#ffffff", "#dceaf2", "#97b1c2", "#f4fbff", "#7c97aa"], lip: "#4c6577", hi: "#ffffff", leaf: ["#f4fbff", "#93adbf"], gem: ["#e6fff3", "#2fd68f", "#087a4c"], text: "#22323c", plate: ["#ffffff", "#d2e3ec", "#8aa6ba"], brushed: true },
  jade: { band: ["#d9fff0", "#4fcf9c", "#137a55", "#8ff0c8", "#0b5a3e"], lip: "#06402b", hi: "#eafff6", leaf: ["#ffe58f", "#b07a12"], gem: ["#fff7d6", "#ffc83d", "#a0700c"], text: "#05301f", plate: ["#fff6c8", "#efbb3c", "#a06c0c"], brushed: false },
  cobalt: { band: ["#d6e6ff", "#4d84ff", "#1a3fa8", "#8fb4ff", "#122d7a"], lip: "#0c1f55", hi: "#eef4ff", leaf: ["#f4f6f9", "#8d97a3"], gem: ["#ffffff", "#bfe6ff", "#3a8dff"], text: "#0c1f55", plate: ["#ffffff", "#ccd3db", "#828d99"], brushed: true },
  // ice-blue diamond: cold, clear, no rainbow (that's Prism's)
  diamond: { band: ["#ffffff", "#cdeeff", "#86cdf2", "#f2fbff", "#5fb6e4"], lip: "#22628c", hi: "#ffffff", leaf: ["#eaf8ff", "#7cc4ea"], gem: ["#ffffff", "#c9ecff", "#3d9be0"], text: "#123a55", plate: ["#ffffff", "#d9f2ff", "#9bd6f5"], brushed: false },
  holo: { band: ["#ffc2e8", "#ffe7a3", "#bdf7c8", "#a9e8ff", "#d2c2ff", "#ffc2e8"], lip: "#6a5aa8", hi: "#ffffff", leaf: ["#f3e9ff", "#a99be6"], gem: ["#ffffff", "#ffb3e3", "#6d4fe6"], text: "#2c2457", plate: ["#ffe6f6", "#e0d4ff", "#b0e8ff"], brushed: false },
  prism: { band: ["#ffffff", "#bff0ff", "#ffffff", "#ffc9ee", "#ffffff", "#cfd2ff", "#fff5c4", "#ffffff"], lip: "#5d6fb3", hi: "#ffffff", leaf: ["#ffffff", "#b9c8ff"], gem: ["#ffffff", "#8fd0ff", "#4b4fe0"], text: "#1f2a55", plate: ["#ffffff", "#eaf6ff", "#d2d8ff"], brushed: false },
};

const rad = (deg: number) => (deg - 90) * Math.PI / 180;
const P = (r: number, deg: number) => [r * Math.cos(rad(deg)), r * Math.sin(rad(deg))] as const;
const f2 = (n: number) => n.toFixed(2);
const arc = (r: number, a0: number, a1: number) => { const [x0, y0] = P(r, a0), [x1, y1] = P(r, a1); return `M${f2(x0)} ${f2(y0)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f2(x1)} ${f2(y1)}`; };
const star = (cx: number, cy: number, R: number, r: number, n: number) =>
  Array.from({ length: n * 2 }, (_, i) => { const rr = i % 2 ? r : R, a = (Math.PI / n) * i - Math.PI / 2; return `${i ? "L" : "M"}${f2(cx + rr * Math.cos(a))} ${f2(cy + rr * Math.sin(a))}`; }).join(" ") + "Z";

export function FramedAvatar({ tier, stage = 0, max = false, level, name, color, src, size = 64, compact = false, showLevel = true, minimal = false }: {
  tier: FrameTier | null; stage?: number; max?: boolean; level?: number; name?: string; color?: string; src?: string | null; size?: number; compact?: boolean; showLevel?: boolean;
  /** thin ring + rotating shine only */ minimal?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  if (!tier) return <Avatar name={name} color={color} src={src} size={size} />;
  const m = M[tier.material];
  const ti = FRAMES.findIndex((f) => f.id === tier.id);
  const box = minimal ? 36 : compact ? 41 : 58;
  const W = Math.round(size * box / 30);
  const id = (k: string) => `${k}-${uid}`, u = (k: string) => `url(#${id(k)})`;
  const ti0 = FRAMES.findIndex((f) => f.id === tier.id);
  if (ti0 === 0) stage = 0; // Cartridge never gets gems or a star
  if (minimal) { stage = 0; max = false; showLevel = false; compact = true; }
  const ex = compact ? [] : tier.extras;
  const motion = minimal && tier.motion === "none" ? "glint" : tier.motion;
  const glint = motion === "glint";
  // band geometry: full frame vs the thin minimal ring
  const R = minimal ? 32.4 : 35, BW = minimal ? 3.4 : 8, LW = minimal ? 4.6 : 9.4;
  const sparkle = !compact && (max || ti0 >= FRAMES.findIndex((f) => f.id === "holo"));
  // gems sit strictly on the compass points of the ring: N · W+E · W+N+E · W+E with the star at N
  const studs = stage === 1 ? [0] : stage === 2 ? [270, 90] : stage === 3 ? [270, 0, 90] : stage >= 4 ? [270, 90] : [];
  const showStar = stage >= 4 && !max && !compact;

  return (
    <span className={`frame m-${tier.material} ${compact ? "compact" : ""}`} style={{ width: W, height: W }}>
      <span className="frame-avatar"><Avatar name={name} color={color} src={src} size={size} /></span>
      <svg className="frame-svg" viewBox={`${-box} ${-box} ${box * 2} ${box * 2}`} aria-hidden>
        <defs>
          <linearGradient id={id("band")} x1="0" y1="0" x2="1" y2="1">
            {m.band.map((c, i) => <stop key={i} offset={i / (m.band.length - 1)} stopColor={c} />)}
            {(tier.motion === "holo" || tier.motion === "prism") && <animateTransform attributeName="gradientTransform" type="rotate" values="0 .5 .5;360 .5 .5" dur="10s" repeatCount="indefinite" />}
          </linearGradient>
          <linearGradient id={id("leaf")} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={m.leaf[0]} /><stop offset=".5" stopColor={m.leaf[0]} /><stop offset=".5" stopColor={m.leaf[1]} /><stop offset="1" stopColor={m.leaf[1]} /></linearGradient>
          <linearGradient id={id("metal")} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={m.band[0]} /><stop offset=".5" stopColor={m.band[1]} /><stop offset="1" stopColor={m.band[2]} /></linearGradient>
          <linearGradient id={id("plate")} x1="0" y1="0" x2="0" y2="1">{m.plate.map((c, i) => <stop key={i} offset={i / Math.max(1, m.plate.length - 1)} stopColor={c} />)}</linearGradient>
          <linearGradient id={id("crown")} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff3b8" /><stop offset=".45" stopColor="#f5c542" /><stop offset="1" stopColor="#b97a12" /></linearGradient>
          <radialGradient id={id("ruby")} cx=".35" cy=".3" r=".85"><stop offset="0" stopColor="#ffd0dc" /><stop offset=".5" stopColor="#e8325a" /><stop offset="1" stopColor="#7a0f2c" /></radialGradient>
          <radialGradient id={id("gem")} cx=".35" cy=".3" r=".85"><stop offset="0" stopColor={m.gem[0]} /><stop offset=".5" stopColor={m.gem[1]} /><stop offset="1" stopColor={m.gem[2]} /></radialGradient>
          <filter id={id("drop")} x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy=".8" stdDeviation=".7" floodColor="#000" floodOpacity=".35" /></filter>
          <filter id={id("blur")} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.6" /></filter>
          <pattern id={id("foil")} width="3.4" height="3.4" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="1.4" height="3.4" fill="#fff" opacity=".22" /></pattern>
          <mask id={id("bandMask")}><circle r={R} fill="none" stroke="#fff" strokeWidth={BW} /></mask>
        </defs>

        {/* ---------- laurel (behind) ---------- */}
        {ex.includes("laurel") && [1, -1].map((side) => (
          <g key={side} transform={side < 0 ? "scale(-1 1)" : undefined} filter={u("drop")}>
            <path d={arc(43.2, 106, 174)} fill="none" stroke={m.lip} strokeWidth="1.5" strokeLinecap="round" />
            <path d={arc(43.2, 106, 174)} fill="none" stroke={m.leaf[0]} strokeWidth=".6" strokeLinecap="round" />
            {Array.from({ length: 8 }, (_, i) => {
              const deg = 110 + i * 8.6, out = i % 2 === 0, [x, y] = P(43.2, deg);
              return (
                <g key={i} transform={`translate(${f2(x)} ${f2(y)}) rotate(${deg + (out ? -60 : 240)}) scale(${1 - i * .035})`}>
                  <path d="M0 0 C2.8 -2.2 3.3 -7 0 -10.2 C-3.3 -7 -2.8 -2.2 0 0Z" fill={u("leaf")} stroke={m.lip} strokeWidth=".5" strokeLinejoin="round" />
                  <path d="M0 -.8 L0 -8.6" stroke={m.lip} strokeWidth=".4" opacity=".55" />
                </g>
              );
            })}
          </g>
        ))}

        {/* ---------- band ---------- */}
        <circle r={R} fill="none" stroke={m.lip} strokeWidth={LW} />
        <circle r={R} fill="none" stroke={u("band")} strokeWidth={BW} />
        <g mask={u("bandMask")}>
          {m.brushed && Array.from({ length: 120 }, (_, i) => { const [x0, y0] = P(30, i * 3), [x1, y1] = P(40, i * 3); return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={i % 2 ? "#fff" : "#000"} strokeWidth=".35" opacity={i % 2 ? .15 : .06} />; })}
          {ex.includes("foil") && <circle r={R} fill="none" stroke={u("foil")} strokeWidth={BW} />}
          {/* soft key light (top-left) and core shadow (bottom-right) */}
          <path d={arc(R + 1, 200, 330)} stroke="#fff" strokeWidth={BW * .62} opacity=".5" fill="none" strokeLinecap="round" filter={u("blur")} />
          <path d={arc(R - 1, 25, 155)} stroke="#000" strokeWidth={BW * .75} opacity=".16" fill="none" strokeLinecap="round" filter={u("blur")} />
          {/* travelling highlight: feathered, built from fading slivers so it never reads as a bar */}
          {motion !== "none" && (
            <g style={{ mixBlendMode: "screen" }}>
              {Array.from({ length: 9 }, (_, k) => {
                const o = Math.sin(((k + .5) / 9) * Math.PI);
                return <path key={k} d={arc(R, k * 2.6, k * 2.6 + 3.2)} stroke="#fff" strokeWidth={BW * (.5 + o * .32)} opacity={(o * o * .75).toFixed(3)} fill="none" filter={u("blur")} />;
              })}
              <animateTransform attributeName="transform" type="rotate" values={glint ? "-30;330;330" : "-30;330"} keyTimes={glint ? "0;.35;1" : "0;1"} dur={glint ? "7s" : motion === "prism" ? "3.6s" : "5s"} repeatCount="indefinite" />
            </g>
          )}
        </g>
        {!minimal && (<>
          <circle r="38.9" fill="none" stroke={m.lip} strokeWidth=".9" />
          <circle r="38.15" fill="none" stroke={m.hi} strokeWidth=".6" opacity=".55" />
          <circle r="31.1" fill="none" stroke={m.lip} strokeWidth="1.1" />
          <circle r="31.85" fill="none" stroke={m.hi} strokeWidth=".6" opacity=".7" />
        </>)}
        {minimal && <circle r={R - BW / 2 + .5} fill="none" stroke={m.hi} strokeWidth=".45" opacity=".6" />}

        {/* hard plastic: a moulded inner step and one broad soft sheen, nothing else */}
        {ex.includes("shell") && (<>
          <circle r="33.3" fill="none" stroke="#000" strokeWidth=".7" opacity=".14" />
          <circle r="33.95" fill="none" stroke="#fff" strokeWidth=".55" opacity=".85" />
          <circle r="36.9" fill="none" stroke="#fff" strokeWidth=".45" opacity=".5" />
          <path d={arc(35.2, 292, 338)} stroke="#fff" strokeWidth="2.4" opacity=".75" fill="none" strokeLinecap="round" filter={u("blur")} />
        </>)}
        {ex.includes("beads") && Array.from({ length: 60 }, (_, i) => {
          const [x, y] = P(37.1, i * 6 + 3);
          return <g key={i}><circle cx={f2(x)} cy={f2(y)} r=".85" fill={m.band[2]} /><circle cx={f2(x - .22)} cy={f2(y - .25)} r=".5" fill="#fff" /></g>;
        })}
        {ex.includes("ticks") && Array.from({ length: 72 }, (_, i) => {
          const major = i % 6 === 0, r0 = major ? 34 : 36.2;
          return (
            <g key={i} transform={`rotate(${i * 5 + 2.5})`}>
              <line y1={-r0} y2="-38.2" stroke={m.lip} strokeWidth={major ? .8 : .4} opacity=".6" />
              <line x1=".4" x2=".4" y1={-r0} y2="-38.2" stroke="#fff" strokeWidth={major ? .45 : .25} opacity=".55" />
            </g>
          );
        })}
        {ex.includes("facets") && Array.from({ length: 24 }, (_, i) => {
          const [a, b] = P(31.4, i * 15), [c, d] = P(38.6, i * 15 + 7.5), [e, f] = P(31.4, i * 15 + 15);
          return <path key={i} d={`M${f2(a)} ${f2(b)} L${f2(c)} ${f2(d)} L${f2(e)} ${f2(f)}`} fill="none" stroke="#fff" strokeWidth=".5" opacity=".75" />;
        })}

        {/* ---------- progression studs ---------- */}
        {!compact && studs.map((d) => <Stud key={d} deg={d} cut={tier.gem} m={m} u={u} />)}
        {compact && !minimal && stage > 0 && <Stud deg={0} cut={tier.gem} m={m} u={u} small />}
        {showStar && (
          <g transform="translate(0 -36.6)" filter={u("drop")}>
            <path d={star(0, 0, 10, 4.5, 5)} fill={u("metal")} stroke={m.lip} strokeWidth=".8" strokeLinejoin="round" />
            {Array.from({ length: 5 }, (_, k) => {
              const a = (Math.PI * 2 / 5) * k - Math.PI / 2, b = a + Math.PI / 5;
              return <path key={k} d={`M0 0 L${f2(10 * Math.cos(a))} ${f2(10 * Math.sin(a))} L${f2(4.5 * Math.cos(b))} ${f2(4.5 * Math.sin(b))}Z`} fill="#000" opacity=".14" />;
            })}
            <circle r="2.9" fill={u("gem")} stroke={m.lip} strokeWidth=".45" />
            <ellipse cx="-.9" cy="-1" rx="1" ry=".6" transform="rotate(-35 -.9 -1)" fill="#fff" opacity=".95" />
          </g>
        )}

        {/* ---------- Lv 999: crown + fading sparkles ---------- */}
        {max && !compact && (<>
          <g transform="translate(0 -44)" filter={u("drop")}>
            <path d="M-12.5 5 L-14 -5.5 L-7 -.5 L0 -10.5 L7 -.5 L14 -5.5 L12.5 5 Z" fill={u("band")} stroke={m.lip} strokeWidth=".9" strokeLinejoin="round" />
            <path d="M-12.5 5 L-14 -5.5 L-7 -.5 L0 -10.5 L0 5Z" fill="#fff" opacity=".3" />
            <path d="M-7 -.5 L-4 5 M7 -.5 L4 5 M0 -10.5 L0 5" stroke="#fff" strokeWidth=".45" opacity=".7" />
            <rect x="-13" y="2.4" width="26" height="4.4" rx="1.5" fill={u("metal")} stroke={m.lip} strokeWidth=".8" />
            <path d="M-11.6 3.3 H11.6" stroke="#fff" strokeWidth=".6" strokeLinecap="round" opacity=".8" />
            {[-8.5, 0, 8.5].map((x) => <circle key={x} cx={x} cy="4.6" r="1.35" fill={u("gem")} stroke={m.lip} strokeWidth=".35" />)}
            {[[-14, -5.5], [0, -10.5], [14, -5.5]].map(([x, y], k) => <g key={k}><circle cx={x} cy={y} r="1.85" fill={u("gem")} stroke={m.lip} strokeWidth=".5" /><circle cx={x - .55} cy={y - .6} r=".55" fill="#fff" /></g>)}
          </g>
        </>)}
        {sparkle && (<>
          {[[-47, -18, 0], [49, -28, .9], [45, 26, 1.8], [-42, 34, 2.7], [26, -50, 3.6], [-28, -47, 4.5]].map(([x, y, d], i) => (
            <path key={i} d={star(x, y, 4.2, .9, 4)} fill="#fff" stroke={m.gem[1]} strokeWidth=".55" opacity="0">
              <animate attributeName="opacity" values="0;1;0" keyTimes="0;.5;1" dur="3.6s" begin={`${d * .8}s`} repeatCount="indefinite" calcMode="spline" keySplines=".4 0 .6 1;.4 0 .6 1" />
            </path>
          ))}
        </>)}

        {/* ---------- level plaque ---------- */}
        {showLevel && !compact && level !== undefined && <Plaque level={level} ti={ti} m={m} u={u} ribbon={tier.extras.includes("laurel")} />}
      </svg>
    </span>
  );
}

/*
 * Gem cuts, drawn in the stud's own frame: −y points away from the avatar, x runs along the ring.
 * Polygonal cuts also get facet lines (vertex → the same vertex at half size).
 */
type Shape = { d: (s: number) => string; pts?: (s: number) => [number, number][] };
const poly = (p: [number, number][]) => "M" + p.map(([x, y]) => `${f2(x)} ${f2(y)}`).join(" L") + "Z";
const circ = (s: number) => `M${f2(-s)} 0 a${f2(s)} ${f2(s)} 0 1 0 ${f2(2 * s)} 0 a${f2(s)} ${f2(s)} 0 1 0 ${f2(-2 * s)} 0Z`;
const emeraldPts = (s: number): [number, number][] => { const w = s, h = .76 * s, c = .34 * s; return [[-w + c, -h], [w - c, -h], [w, -h + c], [w, h - c], [w - c, h], [-w + c, h], [-w, h - c], [-w, -h + c]]; };
const hexPts = (s: number): [number, number][] => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i - Math.PI / 2; return [s * Math.cos(a), s * Math.sin(a)]; });
const octPts = (s: number): [number, number][] => Array.from({ length: 8 }, (_, i) => { const a = (Math.PI / 4) * i - Math.PI / 2 + Math.PI / 8; return [s * Math.cos(a), s * Math.sin(a)]; });
const kitePts = (s: number): [number, number][] => [[0, -1.22 * s], [.8 * s, -.12 * s], [0, 1.02 * s], [-.8 * s, -.12 * s]];
const CUTS: Record<string, Shape> = {
  button: { d: circ },
  round: { d: circ },
  cushion: { d: (s) => { const h = .86 * s, r = .38 * s; return `M${f2(-h + r)} ${f2(-h)} H${f2(h - r)} Q${f2(h)} ${f2(-h)} ${f2(h)} ${f2(-h + r)} V${f2(h - r)} Q${f2(h)} ${f2(h)} ${f2(h - r)} ${f2(h)} H${f2(-h + r)} Q${f2(-h)} ${f2(h)} ${f2(-h)} ${f2(h - r)} V${f2(-h + r)} Q${f2(-h)} ${f2(-h)} ${f2(-h + r)} ${f2(-h)}Z`; } },
  emerald: { d: (s) => poly(emeraldPts(s)), pts: emeraldPts },
  oval: { d: (s) => `M${f2(-s)} 0 a${f2(s)} ${f2(.76 * s)} 0 1 0 ${f2(2 * s)} 0 a${f2(s)} ${f2(.76 * s)} 0 1 0 ${f2(-2 * s)} 0Z` },
  hex: { d: (s) => poly(hexPts(s)), pts: hexPts },
  brilliant: { d: (s) => poly(octPts(s * 1.02)), pts: (s) => octPts(s * 1.02) },
  marquise: { d: (s) => `M${f2(-1.12 * s)} 0 C${f2(-.5 * s)} ${f2(-.98 * s)} ${f2(.5 * s)} ${f2(-.98 * s)} ${f2(1.12 * s)} 0 C${f2(.5 * s)} ${f2(.98 * s)} ${f2(-.5 * s)} ${f2(.98 * s)} ${f2(-1.12 * s)} 0Z` },
  kite: { d: (s) => poly(kitePts(s)), pts: kitePts },
};

/** A progression gem: metal bezel centred on the ring (it overhangs the band slightly), the cut stone, facets, and a light that stays top-left. */
function Stud({ deg, cut, m, u, small = false }: { deg: number; cut: string; m: Mat; u: (k: string) => string; small?: boolean }) {
  const sh = CUTS[cut] ?? CUTS.round;
  const [x, y] = P(35, deg);
  const k = small ? .78 : 1;
  const B = 6.5, G = 4.8;
  const button = cut === "button";
  return (
    <g transform={`translate(${f2(x)} ${f2(y)}) scale(${k})`} filter={u("drop")}>
      <g transform={`rotate(${deg})`}>
        {/* bezel */}
        <path d={sh.d(B)} fill={button ? m.band[2] : u("metal")} stroke={m.lip} strokeWidth=".8" strokeLinejoin="round" />
        {!button && <path d={sh.d(B - .75)} fill="none" stroke={m.hi} strokeWidth=".5" opacity=".7" strokeLinejoin="round" />}
        {/* stone */}
        <path d={sh.d(G)} fill={u("gem")} stroke={m.lip} strokeWidth=".5" strokeLinejoin="round" />
        {sh.pts && (() => {
          const o = sh.pts(G), t = sh.pts(G * .5);
          return (<>
            <path d={poly(t)} fill="#fff" opacity=".2" stroke="#fff" strokeWidth=".3" strokeOpacity=".55" strokeLinejoin="round" />
            {o.map(([ax, ay], i) => <line key={i} x1={f2(ax)} y1={f2(ay)} x2={f2(t[i][0])} y2={f2(t[i][1])} stroke="#fff" strokeWidth=".3" opacity=".5" />)}
          </>);
        })()}
        {(cut === "round" || cut === "oval" || cut === "cushion" || cut === "marquise" || button) && (
          <path d={sh.d(G * .62)} fill="none" stroke="#fff" strokeWidth=".35" opacity={button ? 0 : .35} />
        )}
      </g>
      {/* light stays top-left whatever the rotation */}
      <ellipse cx="-1.8" cy="-2" rx="1.8" ry="1" transform="rotate(-38 -1.8 -2)" fill="#fff" opacity=".92" />
      <circle cx="1.95" cy="1.85" r=".6" fill="#fff" opacity=".55" />
      {button && <path d="M-3.8 2.5 A4.6 4.6 0 0 0 3.8 2.5" fill="none" stroke="#000" strokeWidth=".7" opacity=".18" strokeLinecap="round" />}
    </g>
  );
}

function Plaque({ level, ti, m, u, ribbon }: { level: number; ti: number; m: Mat; u: (k: string) => string; ribbon: boolean }) {
  const digits = String(level).length;
  const w = 9.5 + digits * 4.7, h = 9.6, y = 41.2, x = -w / 2;
  return (
    <g filter={u("drop")}>
      {ribbon && [1, -1].map((s) => (
        <g key={s} transform={`scale(${s} 1)`}>
          <path d={`M${f2(w / 2 - 2.5)} ${f2(y - h / 2 + 1.8)} h9.5 l-3 ${f2(h / 2 - .9)} l3 ${f2(h / 2 - .9)} h-9.5z`} fill={m.plate[m.plate.length - 1]} stroke={m.lip} strokeWidth=".7" strokeLinejoin="round" />
          <path d={`M${f2(w / 2 - 2.5)} ${f2(y + h / 2)} l2.4 -1.8 h-2.4z`} fill={m.lip} opacity=".8" />
        </g>
      ))}
      {ti === 0 ? (<>
        <rect x={x} y={y - h / 2} width={w} height={h} rx={h / 2} fill="#fdfdfe" stroke={m.lip} strokeWidth=".8" />
        <rect x={x + 1.1} y={y - h / 2 + 1.1} width={w - 2.2} height={h - 2.2} rx={h / 2 - 1.1} fill="none" stroke="#cdd2d8" strokeWidth=".5" />
      </>) : (<>
        <rect x={x} y={y - h / 2} width={w} height={h} rx="2.3" fill={u("plate")} stroke={m.lip} strokeWidth=".9" />
        <rect x={x + .85} y={y - h / 2 + .85} width={w - 1.7} height={h - 1.7} rx="1.6" fill="none" stroke="#fff" strokeWidth=".5" opacity=".75" />
        <path d={`M${f2(x + 1.6)} ${f2(y - h / 2 + 1.3)} h${f2(w - 3.2)}`} stroke="#fff" strokeWidth=".8" opacity=".55" strokeLinecap="round" />
        {!ribbon && [x + 2.3, x + w - 2.3].map((cx) => <g key={cx}><circle cx={cx} cy={y} r=".95" fill={m.band[2]} stroke={m.lip} strokeWidth=".3" /><circle cx={cx - .3} cy={y - .3} r=".3" fill="#fff" /></g>)}
      </>)}
      <text x="0" y={y + 3.1 + (m.emboss ? -.45 : .45)} textAnchor="middle" fontSize="8.2" fontWeight="900" fill={m.emboss ?? "#fff"} opacity=".65" fontFamily="var(--font)">{level}</text>
      <text x="0" y={y + 3.1} textAnchor="middle" fontSize="8.2" fontWeight="900" fill={m.text} fontFamily="var(--font)" letterSpacing=".2">{level}</text>
    </g>
  );
}

export const frameById = (id: string) => FRAMES.find((f) => f.id === id) ?? null;
