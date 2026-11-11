"use client";
import { useEffect, useRef, useState } from "react";
import Icon, { Avatar, Battery } from "./Icon";
import { activate, emit, focusFirst, useNavEvent } from "./nav";
import { sfx } from "./sfx";
import { usePrefs } from "../lib/prefs";
import { EquippedBadge, FlairAvatar, type FlairSnapshot } from "./Flair";

export function Clock({ big = false }: { big?: boolean }) {
  const [prefs] = usePrefs();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const i = setInterval(() => setNow(new Date()), 5000); return () => clearInterval(i); }, []);
  if (!now) return <span className="clock" />;
  const h = now.getHours(), m = String(now.getMinutes()).padStart(2, "0");
  if (prefs.clock24) return <span className={`clock ${big ? "big" : ""}`}>{String(h).padStart(2, "0")}:{m}</span>;
  return <span className={`clock ${big ? "big" : ""}`}>{String(h % 12 || 12).padStart(2, "0")}:{m}<sup>{h < 12 ? "AM" : "PM"}</sup></span>;
}

/** Battery level where the browser exposes it (Chrome/Edge on laptops and Android). Hidden on desktops
 *  without a battery and on browsers that don't share it (Safari, Firefox, all iOS browsers). */
function useBattery() {
  const [b, setB] = useState<{ level: number; charging: boolean } | null>(null);
  useEffect(() => {
    let bat: any;
    // a desktop PC reports "100 %, charging, never discharges": that isn't a battery worth showing
    const upd = () => bat && setB(bat.level === 1 && bat.charging && bat.dischargingTime === Infinity && bat.chargingTime === 0 && !matchMedia("(pointer: coarse)").matches ? null : { level: bat.level, charging: bat.charging });
    (navigator as any).getBattery?.().then((x: any) => { bat = x; upd(); for (const ev of ["levelchange", "chargingchange", "dischargingtimechange"]) x.addEventListener(ev, upd); }).catch(() => {});
  }, []);
  return b;
}

export type Me = { id: string; name: string; color: string; owner?: boolean; avatar?: string; colorAuto?: boolean; createdAt?: number;
  profile?: { flair?: FlairSnapshot | null; playSeconds?: number; saves?: number; nightSaves?: number; earlySaves?: number; devices?: string[]; linkSeconds?: number; bestStreak?: number; dayMax?: number } };
// one shared copy of "me" for every component: one request, instant local updates
let meCache: Me | null = null, meLoading: Promise<void> | null = null;
const meSubs = new Set<(m: Me | null) => void>();
const setMe = (m: Me | null) => { meCache = m; meSubs.forEach((f) => f(m)); };
export function loadMe() {
  return (meLoading ??= fetch("/api/account").then((r) => (r.ok ? r.json() : null))
    .then((d) => { if (d?.user) setMe({ ...d.user, profile: d.profile, createdAt: d.createdAt }); }).catch(() => {}).finally(() => { meLoading = null; }));
}
/** Change something about me: the UI updates immediately, the server catches up in the background. */
export async function patchMe(patch: { name?: string; color?: string; avatar?: string | null; colorAuto?: boolean }, body: Record<string, unknown> = patch) {
  const before = meCache;
  if (meCache) { const { avatar, ...rest } = patch; setMe({ ...meCache, ...rest, avatar: avatar === null ? undefined : avatar ?? meCache.avatar }); }
  try {
    const r = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Couldn't save");
    if (d.profile && meCache) setMe({ ...meCache, profile: { ...meCache.profile, ...d.profile } });
  } catch (e) { setMe(before); throw e; }
}
/** The signed-in account (name + colour for the avatar). */
export function useMe() {
  const [me, set] = useState<Me | null>(meCache);
  useEffect(() => {
    meSubs.add(set); set(meCache);
    if (!meCache) loadMe();
    return () => { meSubs.delete(set); };
  }, []);
  return me;
}
if (typeof window !== "undefined") addEventListener("pc-me", () => { loadMe(); });

// ---------------------------------------------------------------- presence (who's online)
export type Friend = { id: string; name: string; color: string; avatar?: string; status: "online" | "away" | "dnd" | "offline"; game?: string; seenAt?: number };
type Presence = { users: Friend[]; mode: "online" | "away" | "dnd" | "invisible" };
let presence: Presence | null = null, beating = false, lastInput = Date.now(), nowPlaying: string | undefined;
const presSubs = new Set<(p: Presence | null) => void>();
async function heartbeat(extra: { mode?: string; state?: string } = {}) {
  const idle = document.hidden || (!nowPlaying && Date.now() - lastInput > 5 * 60_000); // in a game the emulator has the keyboard, so input here says nothing
  try {
    const r = await fetch("/api/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: idle ? "idle" : "active", game: nowPlaying, ...extra }) });
    if (!r.ok) return;
    const d = await r.json();
    presence = { users: d.users, mode: d.me.mode };
    if (meCache) meCache = { ...meCache, profile: { ...meCache.profile, linkSeconds: d.me.linkSeconds } };
    presSubs.forEach((f) => f(presence));
  } catch {}
}
export const setPresenceMode = (mode: Presence["mode"]) => { if (presence) { presence = { ...presence, mode }; presSubs.forEach((f) => f(presence)); } return heartbeat({ mode }); };
/** Keeps my status fresh while a tab is open; `game` shows "Playing …" to friends. */
export function usePresence(game?: string) {
  const [p, set] = useState<Presence | null>(presence);
  useEffect(() => {
    nowPlaying = game;
    presSubs.add(set);
    if (!beating) {
      beating = true;
      const mark = () => { lastInput = Date.now(); };
      for (const ev of ["pointerdown", "keydown", "pointermove"]) addEventListener(ev, mark, { passive: true });
      let timer: any;
      const loop = () => { heartbeat(); timer = setTimeout(loop, document.hidden ? 5 * 60_000 : 2 * 60_000); };
      loop();
      document.addEventListener("visibilitychange", () => { clearTimeout(timer); loop(); });
      addEventListener("pagehide", () => { try { navigator.sendBeacon("/api/presence", new Blob([JSON.stringify({ state: "gone" })], { type: "application/json" })); } catch {} });
    } else if (game) heartbeat();
    return () => { presSubs.delete(set); if (game) nowPlaying = undefined; };
  }, [game]);
  return p;
}
const STATUS_LABEL = { online: "Online", away: "Away", dnd: "Do not disturb", offline: "Offline" } as const;

/** Top-bar people button: a dot per friend who's on, opens the full list with your own status switch. */
function Friends({ busy }: { busy?: boolean }) {
  const p = usePresence(), me = useMe();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useNavEvent("nav:back", () => setOpen(false), []);
  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    addEventListener("pointerdown", out, true); setTimeout(() => focusFirst(".friends-pop [data-nav]"), 30);
    return () => removeEventListener("pointerdown", out, true);
  }, [open]);
  const others = (p?.users ?? []).filter((u) => u.id !== me?.id);
  const on = others.filter((u) => u.status !== "offline").length;
  const order = { online: 0, dnd: 1, away: 2, offline: 3 };
  const mine = p?.mode === "invisible" ? "offline" : p?.mode ?? "online";
  return (
    <div className="friends" ref={ref}>
      <button data-nav className={`iconbtn friends-btn ${busy ? "busy" : ""}`} onClick={() => { setOpen((o) => !o); sfx(open ? "back" : "open"); }} aria-label={`Friends: ${on} online`} title={busy ? "Syncing to cloud…" : `${on} online`}>
        <Icon name={busy ? "sync" : "users"} size={26} className={busy ? "spin" : ""} />
        {on > 0 && !busy && <span className="friends-count">{on}</span>}
        <i className={`dot ${mine}`} />
      </button>
      {open && (
        <div className="friends-pop" data-nav-scope role="dialog" aria-label="Friends">
          <div className="friends-me">
            <span className="seg small">
              {(["online", "away", "dnd", "invisible"] as const).map((m) => (
                <button key={m} data-nav className={p?.mode === m ? "on" : ""} onClick={() => { setPresenceMode(m); sfx("tab"); }} title={m === "invisible" ? "Appear offline" : STATUS_LABEL[m as "online"]}>
                  <i className={`dot ${m === "invisible" ? "offline" : m}`} />{m === "online" ? "Online" : m === "away" ? "Away" : m === "dnd" ? "Busy" : "Hidden"}
                </button>
              ))}
            </span>
          </div>
          {others.length === 0 && <p className="friends-empty">Nobody else has an account here yet.</p>}
          {[...others].sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name)).map((u) => (
            <div key={u.id} className={`friend ${u.status}`}>
              <span className="friend-av"><Avatar name={u.name} color={u.color} src={u.avatar} size={42} /><i className={`dot ${u.status}`} /></span>
              <span className="friend-text"><b>{u.name}</b><small>{u.status === "offline" ? "Offline" : u.game ? `Playing ${u.game}` : STATUS_LABEL[u.status]}</small></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TopBar({ onSearch, onProfile, busy, title }: { onSearch?: () => void; onProfile?: () => void; busy?: boolean; title?: React.ReactNode }) {
  const bat = useBattery(), me = useMe();
  return (
    <header className="topbar">
      <div className="topbar-left">
        {onProfile
          ? <button data-nav className="avatar-btn" onClick={onProfile} aria-label="Profile menu"><FlairAvatar self name={me?.name} color={me?.color} src={me?.avatar} size={46} flair={me?.profile?.flair} compact /></button>
          : <FlairAvatar self name={me?.name} color={me?.color} src={me?.avatar} size={46} flair={me?.profile?.flair} compact />}
        {title}
      </div>
      <div className="topbar-right">
        {onSearch && <button data-nav className="iconbtn" onClick={onSearch} aria-label="Search"><Icon name="search" size={26} /></button>}
        <Friends busy={busy} />
        <Clock />
        {bat && <span className="bat">{Math.round(bat.level * 100)}%<Battery level={bat.level} charging={bat.charging} /></span>}
      </div>
    </header>
  );
}

export type Hint = { btn: "A" | "B" | "X" | "Y" | "L" | "R" | "+" | "−"; key: string; label: string };
export const H = {
  select: { btn: "A", key: "Enter", label: "Select" } as Hint,
  start: { btn: "A", key: "Enter", label: "Start" } as Hint,
  back: { btn: "B", key: "Esc", label: "Back" } as Hint,
  options: { btn: "+", key: "O", label: "Options" } as Hint,
};
/** What an on-screen hint does when clicked or tapped: the same thing as its key / controller button. */
const HINT_ACT: Record<string, () => void> = {
  A: () => activate(), B: () => { sfx("back"); emit("nav:back"); }, "+": () => emit("nav:options"),
  L: () => { sfx("tab"); emit("nav:tab", -1); }, R: () => { sfx("tab"); emit("nav:tab", 1); },
};
export function HintButton({ h }: { h: Hint }) {
  // mousedown is cancelled so the click doesn't steal focus from the thing "Select" should press
  return <button className="hint" data-silent={h.btn === "A" ? "" : undefined} onMouseDown={(e) => e.preventDefault()} onClick={() => HINT_ACT[h.btn]?.()}><kbd className="key">{h.key}</kbd><span className="glyph">{h.btn}</span>{h.label}</button>;
}
export function BottomBar({ hints = [H.select, H.back], onMenu }: { hints?: Hint[]; onMenu?: () => void }) {
  return (
    <footer className="bottombar">
      <button className="hint menu" data-silent onMouseDown={(e) => e.preventDefault()} onClick={onMenu}><kbd className="key">F1</kbd><span className="glyph">−</span>Menu</button>
      <div className="hints">{hints.map((h) => <HintButton key={h.btn + h.label} h={h} />)}</div>
    </footer>
  );
}

/** Centered dialog. Traps console focus while open. */
export function Modal({ title, children, actions, onClose, art }: {
  title: string; children?: React.ReactNode; onClose: () => void; art?: React.ReactNode;
  actions: { label: string; onClick: () => void; primary?: boolean; danger?: boolean }[];
}) {
  useNavEvent("nav:back", onClose, [onClose]);
  useEffect(() => { setTimeout(() => focusFirst(".modal [data-autofocus], .modal .btn.primary"), 30); }, []);
  return (
    <div className="scrim" data-nav-scope>
      <div className="modal" role="dialog" aria-label={title}>
        {art && <div className="modal-art">{art}</div>}
        <div className="modal-inner">
          <h2>{title}</h2>
          <div className="modal-body">{children}</div>
        </div>
        <div className="modal-actions">
          {actions.map((a) => (
            <button key={a.label} data-nav className={`btn ${a.primary ? "primary" : ""} ${a.danger ? "danger" : ""}`} onClick={a.onClick}>{a.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PromptModal({ title, label, initial, onSubmit, onClose }: {
  title: string; label: string; initial: string; onSubmit: (v: string) => void; onClose: () => void;
}) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => ref.current?.select(), 40); }, []);
  return (
    <Modal title={title} onClose={onClose} actions={[{ label: "Cancel", onClick: onClose }, { label: "Save", primary: true, onClick: () => v.trim() && onSubmit(v.trim()) }]}>
      <label className="field">
        <span>{label}</span>
        <input ref={ref} data-nav value={v} maxLength={60} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && v.trim() && onSubmit(v.trim())} />
      </label>
    </Modal>
  );
}

/**
 * Quick menu: about *you* (profile, quick settings, sign out). Two anchors, never both at once:
 *  - "top": drops down from your picture (click it)
 *  - "bottom": rises from the Menu hint (click it, or F1 / − / Home), with the order flipped so the
 *    profile link sits nearest the hint.
 * Click outside to close. ← / → close it too, except on the theme / sound row where they move.
 */
export type MenuAnchor = "top" | "bottom";
export function QuickMenu({ anchor, onAnchor, onClose, onProfile, onHome }: { anchor: MenuAnchor; onAnchor: (a: MenuAnchor) => void; onClose: () => void; onProfile: (section?: string) => void; onHome?: () => void }) {
  const me = useMe();
  const [prefs, update] = usePrefs();
  const [leaving, setLeaving] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; arrow: number } | null>(null);
  useNavEvent("nav:back", onClose, [onClose]);
  const SEL = { top: ".topbar .avatar-btn, .topbar .avatar", bottom: ".bottombar .hint.menu" };
  useEffect(() => {
    const place = () => {
      const a = document.querySelector<HTMLElement>(SEL[anchor])?.getBoundingClientRect();
      const width = Math.min(360, innerWidth - 24);
      if (!a || !a.width) return setPos(anchor === "top" ? { left: 16, top: 96, arrow: 32 } : { left: 16, bottom: 84, arrow: 48 });
      const cx = a.left + a.width / 2;
      const left = Math.max(12, Math.min(cx - 44, innerWidth - width - 12));
      // clear of the avatar's focus ring and glow, so the pointer never touches it
      setPos(anchor === "top" ? { left, top: a.bottom + 26, arrow: cx - left } : { left, bottom: innerHeight - a.top + 22, arrow: cx - left });
    };
    place(); addEventListener("resize", place);
    setTimeout(() => focusFirst(".menu-pop [data-autofocus]"), 30);
    const onMove = (e: Event) => {
      const { dir, from } = (e as CustomEvent).detail as { dir: string; from: Element | null };
      if ((dir === "left" || dir === "right") && !from?.closest(".menu-quick")) { e.preventDefault(); sfx("back"); onClose(); }
    };
    addEventListener("nav:move", onMove);
    return () => { removeEventListener("resize", place); removeEventListener("nav:move", onMove); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);
  async function logout() {
    setLeaving(true); sfx("back");
    try { navigator.sendBeacon("/api/presence", new Blob([JSON.stringify({ state: "gone" })], { type: "application/json" })); } catch {}
    try { await fetch("/api/logout", { method: "POST", keepalive: true }); } catch {}
    location.replace("/login");
  }
  const go = (fn: () => void) => () => { onClose(); fn(); };
  // a click outside closes; a click on the *other* trigger switches the menu over to it
  const outside = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    const other: MenuAnchor = anchor === "top" ? "bottom" : "top";
    const r = document.querySelector<HTMLElement>(SEL[other])?.getBoundingClientRect();
    if (r && e.clientX >= r.left - 6 && e.clientX <= r.right + 6 && e.clientY >= r.top - 6 && e.clientY <= r.bottom + 6) { sfx("open"); onAnchor(other); }
    else { sfx("back"); onClose(); }
  };
  const head = (
    <button key="head" className="menu-head" data-nav data-autofocus onClick={go(() => onProfile("profile"))}>
      <FlairAvatar self name={me?.name} color={me?.color} src={me?.avatar} size={48} flair={me?.profile?.flair} showLevel={false} compact />
      <span className="menu-who">
        <strong>{me?.name ?? "…"} <EquippedBadge self flair={me?.profile?.flair} size={24} /></strong>
        <span>View profile</span>
      </span>
      <Icon name="back" size={18} className="flip dim" />
    </button>
  );
  const quick = (
    <div key="quick" className="menu-quick">
      <span className="seg small">
        {(["light", "dark", "system"] as const).map((t) => (
          <button key={t} data-nav className={prefs.theme === t ? "on" : ""} onClick={() => { update({ theme: t }); sfx("tab"); }} aria-label={`${t} theme`}>
            <Icon name={t === "light" ? "sun" : t === "dark" ? "moon" : "pad"} size={18} />{t === "light" ? "Light" : t === "dark" ? "Dark" : "Auto"}
          </button>
        ))}
      </span>
      <button data-nav className={`qtoggle ${prefs.sounds ? "on" : ""}`} onClick={() => { update({ sounds: !prefs.sounds }); if (!prefs.sounds) sfx("tab"); }} aria-label="Interface sounds">
        <Icon name="sound" size={20} />
      </button>
    </div>
  );
  const items = (<div key="items" className="menu-items">
    {onHome && <button data-nav role="menuitem" className="menu-item" onClick={go(onHome)}><Icon name="home" size={22} />Home</button>}
    <button data-nav role="menuitem" className="menu-item" onClick={go(() => onProfile("security"))}><Icon name="shield" size={22} />Security</button>
    <button data-nav role="menuitem" className="menu-item" onClick={logout}><Icon name="users" size={22} />Switch user</button>
    <button data-nav role="menuitem" className="menu-item danger" onClick={logout} disabled={leaving}>
      <Icon name="power" size={22} />{leaving ? "Signing off…" : "Log out"}
    </button>
  </div>);
  return (
    <div className="scrim clear" data-nav-scope onClick={outside}>
      {pos && (
        <nav className={`menu-pop ${anchor}`} role="menu" style={{ left: pos.left, top: pos.top, bottom: pos.bottom, ["--arrow" as any]: `${pos.arrow}px` }}>
          {anchor === "top" ? [head, quick, items] : [items, quick, head]}
        </nav>
      )}
    </div>
  );
}

export type ToastT = { id: number; icon?: string; title: string; text?: string; progress?: number; error?: boolean };
export function Toasts({ items }: { items: ToastT[] }) {
  return (
    <div className="toasts">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.error ? "err" : ""}`}>
          <span className="toast-icon"><Icon name={t.icon ?? "cloudok"} size={24} /></span>
          <div>
            <strong>{t.title}</strong>
            {t.text && <span>{t.text}</span>}
            {t.progress !== undefined && <div className="bar"><i style={{ width: `${Math.round(t.progress * 100)}%` }} /></div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export type Push = (t: Omit<ToastT, "id">, ms?: number) => { update: (p: Partial<ToastT>) => void; close: (after?: number) => void };
export function useToasts() {
  const [items, setItems] = useState<ToastT[]>([]);
  const push: Push = (t, ms = 3500) => {
    const id = Math.random();
    setItems((s) => [...s, { ...t, id }]);
    if (ms) setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), ms);
    return {
      update: (p) => setItems((s) => s.map((x) => (x.id === id ? { ...x, ...p } : x))),
      close: (after = 0) => setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), after),
    };
  };
  return { items, push };
}

/** iOS/Switch style toggle row control */
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button data-nav role="switch" aria-checked={on} aria-label={label} className={`toggle ${on ? "on" : ""}`} onClick={() => { onChange(!on); sfx("tab"); }}><i /></button>;
}
