// Rounded line icons (24px grid, 2px stroke) — drawn here so there's no icon-font dependency.
const P: Record<string, React.ReactNode> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  home: <path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />,
  grid: <><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></>,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3" /></>,
  power: <><path d="M12 3v8" /><path d="M6.3 7a8 8 0 1 0 11.4 0" /></>,
  play: <path d="M8 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5z" fill="currentColor" stroke="none" />,
  image: <><rect x="3.5" y="5" width="17" height="14" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" /></>,
  pencil: <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16zM13.5 6.5l4 4" />,
  trash: <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  cloud: <path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 8.5 4.8 4.8 0 0 1 17.5 18z" />,
  cloudok: <><path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 8.5 4.8 4.8 0 0 1 17.5 18z" /><path d="m9.5 13 2 2 3.5-3.5" /></>,
  cloudup: <><path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 8.5 4.8 4.8 0 0 1 17.5 18z" /><path d="M12 16v-5M9.5 13l2.5-2.5 2.5 2.5" /></>,
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
  wand: <><path d="m4 20 11-11M14 4v3M18.5 5.5l-2 2M20 10h-3M12.5 9.5l2 2" /></>,
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

/** Round profile badge: a preset character picture (amiibo figure / Pokémon artwork) or the initial, on the account colour. */
export function Avatar({ name = "?", color = "#ff9f1a", src, size = 48 }: { name?: string; color?: string; src?: string | null; size?: number }) {
  const kind = src ? (src.includes("/PokeAPI/") ? "poke" : "fig") : "";
  return (
    <span className={`avatar ${kind}`} style={{ width: size, height: size, fontSize: size * 0.42, ["--av" as any]: color }} aria-hidden>
      {src ? <img src={src} alt="" draggable={false} loading="lazy" /> : <span>{name.trim()[0]?.toUpperCase() ?? "?"}</span>}
    </span>
  );
}
