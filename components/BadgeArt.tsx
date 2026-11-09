"use client";
import { useId, type ReactNode } from "react";

/*
 * Achievement badges in the style of Forza Horizon's player badges:
 * chunky flat shapes · one thick dark outline (the same weight inside and out) · a single shade tone
 * per shape (a crescent on the lower-right edge) · a small gloss highlight · almost no linework.
 *
 * Every icon is a stack of PARTS, painted back-to-front. Each part paints its own outline and then
 * its fill, so a later part's outline doubles as the separation line over earlier parts and the
 * outer silhouette always gets the same stroke. Fills, shades and details are clipped to the part,
 * so nothing can stick out past an outline or leave a gap.
 *
 * Steps: 1 colour · 2 silver · 3 gold (gradient-map of the same art). 0 = locked.
 */
const O = "#2d1b31";
const OW = 7; // outline stroke → 3.5 visible

type Part = {
  d: string;
  fill: string;
  /** darker tone, shown as a crescent on the lower-right */
  shade?: string;
  /** crescent thickness */
  sh?: number;
  /** outline stroke width (0 = none) */
  ow?: number;
  /** stroke a line instead of filling a shape */
  line?: number;
  evenodd?: boolean;
  t?: string;
  /** extra art clipped inside the part */
  detail?: ReactNode;
  /** only paint this part inside the given region (used to weave interlocking shapes) */
  clip?: string;
};
/** lum: luminance weights used before the silver/gold gradient map. Icons whose colours have similar
 *  brightness (cyan vs pink) get exaggerated weights so the metal versions keep their depth. */
type Icon = { parts: Part[]; under?: ReactNode; over?: ReactNode; lum?: [number, number, number] };

// ---------- geometry helpers
const n = (v: number) => +v.toFixed(2);
const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${r} ${r} 0 0 1 ${n(x + w)} ${n(y + r)}V${n(y + h - r)}A${r} ${r} 0 0 1 ${n(x + w - r)} ${n(y + h)}H${n(x + r)}A${r} ${r} 0 0 1 ${n(x)} ${n(y + h - r)}V${n(y + r)}A${r} ${r} 0 0 1 ${n(x + r)} ${n(y)}Z`;
const ell = (cx: number, cy: number, rx: number, ry = rx) =>
  `M${n(cx - rx)} ${n(cy)}A${rx} ${ry} 0 1 0 ${n(cx + rx)} ${n(cy)}A${rx} ${ry} 0 1 0 ${n(cx - rx)} ${n(cy)}Z`;
const star = (cx: number, cy: number, R: number, r: number) =>
  Array.from({ length: 10 }, (_, i) => { const a = (Math.PI / 5) * i - Math.PI / 2, q = i % 2 ? r : R; return `${i ? "L" : "M"}${n(cx + q * Math.cos(a))} ${n(cy + q * Math.sin(a))}`; }).join("") + "Z";
const gloss = (cx: number, cy: number, rx = 2.8, ry = 1.6, rot = -40, op = .9) =>
  <ellipse cx={cx} cy={cy} rx={rx} ry={ry} transform={`rotate(${rot} ${cx} ${cy})`} fill="#fff" opacity={op} />;
const ray = (cx: number, cy: number, deg: number, r0: number, r1: number) => {
  const a = (deg * Math.PI) / 180;
  return `M${n(cx + r0 * Math.cos(a))} ${n(cy + r0 * Math.sin(a))}L${n(cx + r1 * Math.cos(a))} ${n(cy + r1 * Math.sin(a))}`;
};

// ---------- the eleven icons (64×64 grid, centred on 32)
const ICONS: Record<string, Icon> = {
  // Collector — a game cartridge
  carts: {
    parts: [
      {
        d: "M18 8H41L50 17V52A4 4 0 0 1 46 56H18A4 4 0 0 1 14 52V12A4 4 0 0 1 18 8Z", fill: "#cdd2dc", shade: "#a3aab8",
        detail: <><rect x="22" y="45.5" width="20" height="3.6" rx="1.8" fill="#a3aab8" />{gloss(19, 12.5, 2.2, 1.3)}</>,
      },
      { d: rr(19, 15, 26, 23, 2.5), fill: "#ff5d6c", shade: "#e03a4c", sh: 2, ow: 5, detail: <path d={star(32, 26.5, 7, 3.1)} fill="#fff" /> },
    ],
  },
  // Marathon — a stopwatch
  stopwatch: {
    parts: [
      { d: rr(26.5, 6, 11, 12, 2.6), fill: "#ff8a3d", shade: "#e8662a", sh: 1.4 },
      { d: rr(42.6, 15.4, 7, 10, 2.2), t: "rotate(45 46.1 20.4)", fill: "#ff8a3d", shade: "#e8662a", sh: 1.2 },
      { d: ell(32, 36, 19), fill: "#ff8a3d", shade: "#e8662a", detail: gloss(20.4, 24.6, 2.6, 1.5, -45) },
      {
        d: ell(32, 36, 13.2), fill: "#fff6ea", shade: "#efd6b8", sh: 1.8, ow: 5,
        detail: <>
          {[0, 90, 180, 270].map((a) => <path key={a} d={ray(32, 36, a, 9.6, 12)} stroke="#e6c9a6" strokeWidth="2.2" strokeLinecap="round" />)}
          <path d="M32 36V27" stroke={O} strokeWidth="3.2" strokeLinecap="round" />
          <path d="M32 36L38.5 40" stroke="#ff4b4b" strokeWidth="3.2" strokeLinecap="round" />
          <circle cx="32" cy="36" r="2.6" fill={O} />
        </>,
      },
    ],
  },
  // Archivist — a floppy disk
  save: {
    parts: [
      { d: "M15 9H44L54 19V50A5 5 0 0 1 49 55H15A5 5 0 0 1 10 50V14A5 5 0 0 1 15 9Z", fill: "#3f7bff", shade: "#2a5ad6", detail: gloss(14.8, 13.8, 2, 1.3) },
      { d: "M20 9H44V21A2 2 0 0 1 42 23H22A2 2 0 0 1 20 21Z", fill: "#e9edf4", shade: "#c4ccd8", sh: 1.6, ow: 5, detail: <rect x="36" y="12" width="4.6" height="8" rx="1.2" fill="#3f7bff" /> },
      {
        d: rr(17, 30, 30, 20, 3), fill: "#ffffff", shade: "#dde3ed", sh: 1.8, ow: 5,
        detail: <><rect x="21.5" y="35" width="21" height="2.6" rx="1.3" fill="#dde3ed" /><rect x="21.5" y="40.5" width="13" height="2.6" rx="1.3" fill="#dde3ed" /></>,
      },
    ],
  },
  // Night Owl — an owl
  moon: {
    parts: [
      {
        d: "M32 9C35 9 37 12 39 12C42 11 46 8 49 10C51 16 51 21 50 26C52 30 53 34 53 38C53 49 44 56 32 56S11 49 11 38C11 34 12 30 14 26C13 21 13 16 15 10C18 8 22 11 25 12C27 12 29 9 32 9Z",
        fill: "#8a5cf6", shade: "#6a3ddd",
        detail: <><ellipse cx="32" cy="48" rx="12.5" ry="9.5" fill="#b9a0ff" /><path d="M26 45.5q2 -2 4 0M34 45.5q2 -2 4 0M30 50.5q2 -2 4 0" fill="none" stroke="#8a5cf6" strokeWidth="1.8" strokeLinecap="round" /></>,
      },
      { d: ell(23, 28, 7.6), fill: "#ffffff", shade: "#e2ddf2", sh: 1.4, ow: 5, detail: <><circle cx="24.4" cy="29" r="3.9" fill={O} /><circle cx="25.6" cy="27.6" r="1.4" fill="#fff" /></> },
      { d: ell(41, 28, 7.6), fill: "#ffffff", shade: "#e2ddf2", sh: 1.4, ow: 5, detail: <><circle cx="39.6" cy="29" r="3.9" fill={O} /><circle cx="40.8" cy="27.6" r="1.4" fill="#fff" /></> },
      { d: "M28.6 35.5H35.4L32 40.6Z", fill: "#ffb13d", shade: "#f08a1d", sh: .9, ow: 4 },
    ],
  },
  // Early Bird — the sun coming up over a hill
  sunrise: {
    parts: [
      ...[-90, -50, -130, -14, -166].map((a): Part => ({ d: ray(32, 42, a, 19.5, 25.5), line: 5.4, fill: "#ffd23f" })),
      { d: ell(32, 42, 15), fill: "#ffc83d", shade: "#f59e1b", sh: 2.4, detail: gloss(24.5, 33.5, 3, 1.7, -40) },
      {
        d: "M5 52C12 42 22 41 30 47C37 41 49 40 59 52V53A4 4 0 0 1 55 57H9A4 4 0 0 1 5 53Z", fill: "#4cd27a", shade: "#2eb35e", sh: 2,
        detail: <>{gloss(15, 47.5, 2.4, 1.2, -32, .7)}{gloss(46.5, 45.5, 2.4, 1.2, -18, .7)}</>,
      },
    ],
  },
  // Link Up — two interlocking links (∞). Bottom half of the left link is painted again on top so they weave.
  link: {
    lum: [0.045, 0.648, 0.307],
    parts: [
      { d: rr(8, 21, 31, 22, 11), line: 6.4, fill: "#3fd0ff", shade: "#1fa6dd" },
      { d: rr(25, 21, 31, 22, 11), line: 6.4, fill: "#ff5d8f", shade: "#e03a6e" },
      { d: rr(8, 21, 31, 22, 11), line: 6.4, fill: "#3fd0ff", shade: "#1fa6dd", clip: "M-4 32H68V68H-4Z" },
    ],
    over: <>
      <path d="M8.66 28.24A11 11 0 0 1 15.24 21.66" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" opacity=".85" />
      <path d="M39.5 21H45" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" opacity=".85" />
    </>,
  },
  // Historian — a handheld
  systems: {
    parts: [
      { d: rr(14, 5, 36, 54, 7), fill: "#5c6cff", shade: "#4352e0", detail: gloss(19.2, 10.4, 1.6, 2.6, 0, .8) },
      {
        d: rr(19, 10, 26, 22, 3.5), fill: "#2f2a4a", ow: 0,
        detail: <><rect x="22.5" y="13.5" width="19" height="15" rx="1.6" fill="#9ae66e" /><path d="M22.5 22L31 13.5H35.5L22.5 26.5Z" fill="#c8f7a8" /></>,
      },
      { d: "M21.5 37H26.5V41.5H31V46.5H26.5V51H21.5V46.5H17V41.5H21.5Z", fill: "#2f2a4a", ow: 0 },
      { d: ell(36.8, 46.6, 3.1), fill: "#ff5d6c", shade: "#e03a4c", sh: .8, ow: 3 },
      { d: ell(44.2, 41.4, 3.1), fill: "#ff5d6c", shade: "#e03a4c", sh: .8, ow: 3 },
    ],
  },
  // Curator — a painter's palette
  frame: {
    parts: [
      {
        d: "M33 8C18 8 7 18 7 31C7 44 17 53 30 53C35 53 36 50 35 47C34 44 36 41 40 41H46C53 41 58 37 58 30C58 17 47 8 33 8ZM32 42.5A4.5 4.5 0 1 1 32 33.5A4.5 4.5 0 0 1 32 42.5Z",
        evenodd: true, t: "translate(0 2)", fill: "#ffe2b8", shade: "#f0c690", sh: 2.6,
      },
      { d: ell(17.5, 31, 4.2), fill: "#ff5d6c", shade: "#e03a4c", sh: 1, ow: 4 },
      { d: ell(24.5, 20.5, 4.2), fill: "#ffd23f", shade: "#f2b10f", sh: 1, ow: 4 },
      { d: ell(37, 17.5, 4.2), fill: "#4cd27a", shade: "#2eb35e", sh: 1, ow: 4 },
      { d: ell(48, 24.5, 4.2), fill: "#3f9bff", shade: "#2a78e0", sh: 1, ow: 4 },
    ],
  },
  // Party — a party hat
  party: {
    parts: [
      {
        d: "M32 12L51.5 49Q32 55 12.5 49Z", t: "rotate(-7 32 34)", fill: "#ff5d8f", shade: "#e03a6e", sh: 2.6,
        detail: <><path d="M6 32L58 21M4 46L60 35" stroke="#ffd23f" strokeWidth="5.5" />{gloss(26.5, 24, 1.5, 3.2, 26, .8)}</>,
      },
      { d: "M14 50Q32 56.5 50 50", line: 7, t: "rotate(-7 32 34)", fill: "#3fd0ff", shade: "#1fa6dd" },
      { d: ell(32, 10, 6.6), t: "rotate(-7 32 34)", fill: "#ffffff", shade: "#dfe4ee", sh: 1.6, ow: 6, detail: gloss(29.8, 7.6, 2, 1.2, -35) },
    ],
  },
  // Veteran — a medal
  medal: {
    parts: [
      { d: "M17 4H29L36 22H24Z", fill: "#3f7bff", shade: "#2a5ad6", sh: 1.6 },
      { d: "M47 4H35L28 22H40Z", fill: "#ff5d6c", shade: "#e03a4c", sh: 1.6 },
      {
        d: ell(32, 40, 17), fill: "#ffc83d", shade: "#eba21a", sh: 2.4,
        detail: <><circle cx="32" cy="40" r="12" fill="none" stroke="#eba21a" strokeWidth="2.2" /><path d={star(32, 40.6, 8, 3.6)} fill="#fff4c4" />{gloss(21.6, 31.6, 2.6, 1.5, -45)}</>,
      },
    ],
  },
  // Host — a house with a heart
  house: {
    parts: [
      { d: rr(40, 11, 7, 13, 1.5), fill: "#ff5d4f", shade: "#e03a32", sh: 1 },
      {
        d: "M14 30V51A4 4 0 0 0 18 55H46A4 4 0 0 0 50 51V30L32 15Z", fill: "#fff1dc", shade: "#ecd2ad", sh: 2.2,
        detail: <path d="M32 47C25 42.5 23 38.5 25.5 35.7C27.5 33.7 30.3 34.2 32 36.5C33.7 34.2 36.5 33.7 38.5 35.7C41 38.5 39 42.5 32 47Z" fill="#ff5d8f" />,
      },
      { d: "M8 31L32 10L56 31", line: 8, fill: "#ff5d4f" },
    ],
    over: <path d="M14.5 26.6L27.5 15.2" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".7" />,
  },
};

function Parts({ icon, uid, mask = false }: { icon: Icon; uid: string; mask?: boolean }) {
  return (<>
    {!mask && icon.under}
    {icon.parts.map((p, i) => {
      const ow = p.ow ?? OW, rule = p.evenodd ? "evenodd" as const : undefined;
      const wrap = (k: string | number, body: ReactNode) => {
        if (!p.clip) return <g key={k} transform={p.t}>{body}</g>;
        const pc = `bc${i}-${uid}${mask ? "m" : ""}`;
        return <g key={k} transform={p.t}><clipPath id={pc}><path d={p.clip} /></clipPath><g clipPath={`url(#${pc})`}>{body}</g></g>;
      };
      if (mask) return wrap(i, p.line
        ? <path d={p.d} fill="none" stroke="#fff" strokeWidth={p.line} strokeLinecap="round" strokeLinejoin="round" />
        : <path d={p.d} fill="#fff" fillRule={rule} />);
      const sh = p.sh ?? (p.line ? 1.1 : 2.4);
      if (p.line) {
        const mid = `bm${i}-${uid}`, L = { fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
        return wrap(i, <>
          <path d={p.d} {...L} stroke={O} strokeWidth={p.line + OW} />
          {p.shade ? <>
            <mask id={mid} maskUnits="userSpaceOnUse" x="-4" y="-4" width="72" height="72"><path d={p.d} {...L} stroke="#fff" strokeWidth={p.line} /></mask>
            <g mask={`url(#${mid})`}>
              <path d={p.d} {...L} stroke={p.shade} strokeWidth={p.line} />
              <path d={p.d} {...L} stroke={p.fill} strokeWidth={p.line} transform={`translate(${-sh} ${-sh})`} />
            </g>
          </> : <path d={p.d} {...L} stroke={p.fill} strokeWidth={p.line} />}
        </>);
      }
      const cid = `bp${i}-${uid}`;
      return wrap(i, <>
        {ow > 0 && <path d={p.d} fill={O} fillRule={rule} stroke={O} strokeWidth={ow} strokeLinejoin="round" />}
        <clipPath id={cid}><path d={p.d} clipRule={rule} /></clipPath>
        <g clipPath={`url(#${cid})`}>
          <path d={p.d} fill={p.shade ?? p.fill} fillRule={rule} />
          {p.shade && <path d={p.d} fill={p.fill} fillRule={rule} transform={`translate(${-sh} ${-sh})`} />}
          {p.detail}
        </g>
      </>);
    })}
    {!mask && icon.over}
  </>);
}

export function BadgeArt({ art, step, size = 64, shine = false }: { art: string; step: number; size?: number; shine?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const icon = ICONS[art] ?? ICONS.medal;
  const metal = step === 2 ? "silver" : step === 3 ? "gold" : null;
  const f = (k: string) => `${k}-${uid}`;
  // filters cover the whole canvas so wide icons are never clipped
  const [lr, lg, lb] = icon.lum ?? [0.2126, 0.7152, 0.0722];
  const lumM = `${lr} ${lg} ${lb} 0 0  ${lr} ${lg} ${lb} 0 0  ${lr} ${lg} ${lb} 0 0  0 0 0 1 0`;
  const box = { filterUnits: "userSpaceOnUse" as const, x: -4, y: -4, width: 72, height: 72, colorInterpolationFilters: "sRGB" as const };
  return (
    <svg className={`badge-art ${step === 0 ? "locked" : ""}`} width={size} height={size} viewBox="-4 -4 72 72" aria-hidden>
      <defs>
        <filter id={f("silver")} {...box}>
          <feColorMatrix type="matrix" values={lumM} />
          <feComponentTransfer>
            <feFuncR type="table" tableValues="0.17 0.45 0.68 0.85 0.96 1" /><feFuncG type="table" tableValues="0.17 0.47 0.71 0.88 0.97 1" /><feFuncB type="table" tableValues="0.23 0.55 0.78 0.93 1 1" />
          </feComponentTransfer>
        </filter>
        <filter id={f("gold")} {...box}>
          <feColorMatrix type="matrix" values={lumM} />
          <feComponentTransfer>
            <feFuncR type="table" tableValues="0.24 0.66 0.9 0.99 1 1" /><feFuncG type="table" tableValues="0.13 0.38 0.62 0.8 0.92 1" /><feFuncB type="table" tableValues="0.07 0.08 0.14 0.3 0.58 0.88" />
          </feComponentTransfer>
        </filter>
        <filter id={f("grey")} {...box}><feColorMatrix type="saturate" values="0" /></filter>
        <filter id={f("soft")} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" /></filter>
        <mask id={f("m")} maskUnits="userSpaceOnUse" x="-4" y="-4" width="72" height="72"><Parts icon={icon} uid={uid} mask /></mask>
      </defs>
      <g filter={step === 0 ? `url(#${f("grey")})` : metal ? `url(#${f(metal)})` : undefined} opacity={step === 0 ? .3 : 1}>
        <Parts icon={icon} uid={uid} />
      </g>
      {/* soft metal sheen, clipped to the coloured shapes, drifting across every few seconds */}
      {metal && (
        <g mask={`url(#${f("m")})`}>
          <rect x="-40" y="-10" width="14" height="90" fill="#fff" opacity=".5" filter={`url(#${f("soft")})`} transform="rotate(28 32 32)">
            <animate attributeName="x" values="-40;90;90" keyTimes="0;.4;1" dur={shine ? "3s" : "5.5s"} repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;0 0 1 1" />
          </rect>
        </g>
      )}
      {step === 3 && [[60, 4, 0], [2, 10, 1.1], [61, 56, 2.2]].map(([x, y, d], i) => (
        <path key={i} d={`M${x} ${y - 4.5}l1.2 3.3 3.3 1.2-3.3 1.2-1.2 3.3-1.2-3.3-3.3-1.2 3.3-1.2z`} fill="#fff8d6" opacity="0">
          <animate attributeName="opacity" values="0;1;0" dur="2.6s" begin={`${d}s`} repeatCount="indefinite" />
        </path>
      ))}
      {step === 0 && <g transform="translate(32 34)"><rect x="-8" y="-2" width="16" height="12" rx="2.5" fill="#fff" stroke="#5b626d" strokeWidth="2.4" /><path d="M-4.5 -2v-3a4.5 4.5 0 0 1 9 0v3" fill="none" stroke="#5b626d" strokeWidth="2.4" /></g>}
    </svg>
  );
}
