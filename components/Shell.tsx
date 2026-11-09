"use client";
import { useEffect, useRef, useState } from "react";
import Icon, { Avatar, Battery } from "./Icon";
import { focusFirst, useNavEvent } from "./nav";
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

function useBattery() {
  const [b, setB] = useState<{ level: number; charging: boolean } | null>(null);
  useEffect(() => {
    let bat: any;
    const upd = () => bat && setB({ level: bat.level, charging: bat.charging });
    (navigator as any).getBattery?.().then((x: any) => { bat = x; upd(); x.addEventListener("levelchange", upd); x.addEventListener("chargingchange", upd); }).catch(() => {});
  }, []);
  return b;
}
function useOnline() {
  const [on, setOn] = useState(true);
  useEffect(() => { setOn(navigator.onLine); const a = () => setOn(true), b = () => setOn(false); addEventListener("online", a); addEventListener("offline", b); return () => { removeEventListener("online", a); removeEventListener("offline", b); }; }, []);
  return on;
}

export type Me = { id: string; name: string; color: string; owner?: boolean; avatar?: string; profile?: { flair?: FlairSnapshot | null; playSeconds?: number; saves?: number; nightSaves?: number; earlySaves?: number; devices?: string[] }; createdAt?: number };
let meCache: Me | null = null;
/** The signed-in account (name + colour for the avatar). */
export function useMe() {
  const [me, setMe] = useState<Me | null>(meCache);
  useEffect(() => {
    const load = () => fetch("/api/account").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.user) { meCache = { ...d.user, profile: d.profile, createdAt: d.createdAt }; setMe(meCache); } }).catch(() => {});
    load(); addEventListener("pc-me", load);
    return () => removeEventListener("pc-me", load);
  }, []);
  return me;
}

export function TopBar({ onSearch, onProfile, busy, title }: { onSearch?: () => void; onProfile?: () => void; busy?: boolean; title?: React.ReactNode }) {
  const bat = useBattery(), online = useOnline(), me = useMe();
  return (
    <header className="topbar">
      <div className="topbar-left">
        {onProfile
          ? <button data-nav className="avatar-btn" onClick={onProfile} aria-label="Profile menu"><FlairAvatar name={me?.name} color={me?.color} src={me?.avatar} size={46} flair={me?.profile?.flair} compact /></button>
          : <FlairAvatar name={me?.name} color={me?.color} src={me?.avatar} size={46} flair={me?.profile?.flair} compact />}
        {title}
      </div>
      <div className="topbar-right">
        {onSearch && <button data-nav className="iconbtn" onClick={onSearch} aria-label="Search"><Icon name="search" size={26} /></button>}
        <span className={`status ${busy ? "busy" : ""}`} title={busy ? "Syncing to cloud…" : online ? "Online · cloud saves up to date" : "Offline"}>
          <Icon name={busy ? "sync" : online ? "wifi" : "wifioff"} size={26} className={busy ? "spin" : ""} />
        </span>
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
export function BottomBar({ hints = [H.select, H.back], onMenu }: { hints?: Hint[]; onMenu?: () => void }) {
  return (
    <footer className="bottombar">
      <button className="hint menu" onClick={onMenu}><kbd className="key">F1</kbd><span className="glyph">−</span>Menu</button>
      <div className="hints">
        {hints.map((h) => (
          <span key={h.btn + h.label} className="hint"><kbd className="key">{h.key}</kbd><span className="glyph">{h.btn}</span>{h.label}</span>
        ))}
      </div>
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
 * Quick menu — opened by clicking your picture or pressing F1 / − / Home.
 * The dock already covers navigation, so this is about *you*: profile, quick settings, sign out.
 * It's anchored to the avatar so the little pointer always lines up with it.
 */
export function QuickMenu({ onClose, onProfile, onHome }: { onClose: () => void; onProfile: (section?: string) => void; onHome?: () => void }) {
  const me = useMe();
  const [prefs, update] = usePrefs();
  const [leaving, setLeaving] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; arrow: number } | null>(null);
  useNavEvent("nav:back", onClose, [onClose]);
  useNavEvent("nav:menu", onClose, [onClose]);
  useEffect(() => {
    const place = () => {
      const a = document.querySelector<HTMLElement>(".topbar .avatar-btn, .topbar .avatar")?.getBoundingClientRect();
      if (!a) return setPos({ left: 16, top: 90, arrow: 32 });
      const cx = a.left + a.width / 2, width = Math.min(360, innerWidth - 24);
      const left = Math.max(12, Math.min(cx - 40, innerWidth - width - 12));
      setPos({ left, top: a.bottom + 14, arrow: cx - left });
    };
    place(); addEventListener("resize", place);
    setTimeout(() => focusFirst(".menu-pop [data-autofocus]"), 30);
    return () => removeEventListener("resize", place);
  }, []);
  async function logout() {
    setLeaving(true); sfx("back");
    try { await fetch("/api/logout", { method: "POST", keepalive: true }); } catch {}
    location.replace("/login");
  }
  const go = (fn: () => void) => () => { onClose(); fn(); };
  return (
    <div className="scrim clear" data-nav-scope onClick={(e) => e.target === e.currentTarget && onClose()}>
      {pos && (
        <nav className="menu-pop" role="menu" style={{ left: pos.left, top: pos.top, ["--arrow" as any]: `${pos.arrow}px` }}>
          <button className="menu-head" data-nav data-autofocus onClick={go(() => onProfile("profile"))}>
            <FlairAvatar name={me?.name} color={me?.color} src={me?.avatar} size={48} flair={me?.profile?.flair} showLevel={false} />
            <span className="menu-who">
              <strong>{me?.name ?? "…"} <EquippedBadge flair={me?.profile?.flair} size={24} /></strong>
              <span>View profile</span>
            </span>
            <Icon name="back" size={18} className="flip dim" />
          </button>
          <div className="menu-quick">
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
          {onHome && <button data-nav role="menuitem" className="menu-item" onClick={go(onHome)}><Icon name="home" size={22} />Home</button>}
          <button data-nav role="menuitem" className="menu-item" onClick={go(() => onProfile("security"))}><Icon name="shield" size={22} />Security</button>
          <button data-nav role="menuitem" className="menu-item" onClick={logout}><Icon name="users" size={22} />Switch user</button>
          <div className="menu-sep" />
          <button data-nav role="menuitem" className="menu-item danger" onClick={logout} disabled={leaving}>
            <Icon name="power" size={22} />{leaving ? "Signing off…" : "Log out"}
          </button>
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
