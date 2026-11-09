"use client";
import { useMemo, useState } from "react";
import { RomView, SYSTEMS, System } from "../lib/games";
import { ago, mb, playtime } from "../lib/client";
import Art from "./Art";
import Icon from "./Icon";

import { useNavEvent } from "./nav";
import { sfx } from "./sfx";

export type TimelineItem = { romId: string; title: string; system: System; ver: string; updatedAt: number; device: string; reason: string; current: boolean; shotUrl: string | null };

function PageHead({ title, onBack, children }: { title: string; onBack: () => void; children?: React.ReactNode }) {
  return (
    <div className="pagehead">
      <button className="backbtn" onClick={onBack} aria-label="Back"><Icon name="back" size={26} /></button>
      <h1>{title}</h1>
      <div className="pagehead-extra">{children}</div>
    </div>
  );
}

/** Pill tabs switched with L / R (or Q / E). */
function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void }) {
  useNavEvent("nav:tab", (d: number) => {
    const i = tabs.findIndex((t) => t.id === value);
    onChange(tabs[(i + d + tabs.length) % tabs.length].id);
  }, [tabs, value]);
  return (
    <div className="tabs">
      <span className="shoulder"><kbd className="key">Q</kbd><span className="glyph sq">L</span></span>
      <div className="tablist">
        {tabs.map((t) => (
          <button key={t.id} className={`tab ${t.id === value ? "on" : ""}`} onClick={() => { sfx("tab"); onChange(t.id); }}>
            {t.label}{t.count !== undefined && <span className="count">{t.count}</span>}
          </button>
        ))}
      </div>
      <span className="shoulder"><kbd className="key">E</kbd><span className="glyph sq">R</span></span>
    </div>
  );
}

// ---------------------------------------------------------------- Library (Big Picture search-grid style)
export function LibraryView({ roms, onBack, onOpen }: { roms: RomView[]; onBack: () => void; onOpen: (r: RomView) => void }) {
  const [filter, setFilter] = useState<"all" | System>("all");
  const tabs = useMemo(() => [
    { id: "all" as const, label: "All", count: roms.length },
    ...(["gba", "nds", "gbc", "gb"] as System[]).filter((s) => roms.some((r) => r.system === s)).map((s) => ({ id: s, label: SYSTEMS[s].label, count: roms.filter((r) => r.system === s).length })),
  ], [roms]);
  const list = roms.filter((r) => filter === "all" || r.system === filter).sort((a, b) => a.title.localeCompare(b.title));
  return (
    <section className="view">
      <PageHead title="Library" onBack={onBack} />
      <Tabs tabs={tabs} value={filter} onChange={setFilter} />
      <div className="cardgrid">
        {list.map((r) => (
          <button key={r.id} data-nav data-rom={r.id} className="card" onClick={() => onOpen(r)}>
            <span className="card-art"><Art rom={r} prefer="shot" /></span>
            <span className="card-label"><Icon name="cart" size={18} />{SYSTEMS[r.system].label}<em>{r.lastPlayedAt ? `${playtime(r.playSeconds)} hrs` : "Not played"}</em></span>
            <span className="card-title">{r.title}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Save timeline (activity-feed style)
export function TimelineView({ items, roms, onBack, onOpen }: { items: TimelineItem[] | null; roms: RomView[]; onBack: () => void; onOpen: (id: string) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, TimelineItem[]>();
    for (const it of items ?? []) {
      const d = new Date(it.updatedAt), today = new Date(), y = new Date(Date.now() - 86400000);
      const k = d.toDateString() === today.toDateString() ? "Today" : d.toDateString() === y.toDateString() ? "Yesterday" : d.toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long" });
      m.set(k, [...(m.get(k) ?? []), it]);
    }
    return [...m.entries()];
  }, [items]);
  return (
    <section className="view narrow">
      <PageHead title="Save Timeline" onBack={onBack} />
      <p className="lead">Every cloud save, from every device.</p>
      {items === null && <div className="activity skeleton" style={{ height: 220 }} />}
      {items?.length === 0 && <p className="empty">No saves yet. Start a game and it autosaves to the cloud.</p>}
      {groups.map(([day, list]) => (
        <div key={day} className="daygroup">
          <h3 className="dayline"><span>{day}</span></h3>
          {list.map((it) => {
            const rom = roms.find((r) => r.id === it.romId);
            return (
              <button key={it.ver} data-nav className="activity" onClick={() => onOpen(it.romId)}>
                <span className="activity-head">
                  <span className="activity-icon"><Icon name={it.reason === "auto" ? "sync" : it.reason === "leave" ? "cloudup" : "disk"} size={20} /></span>
                  <span><b>{it.title}</b> {it.reason === "auto" ? "autosaved" : it.reason === "leave" ? "saved when you left" : it.reason === "ingame" ? "save state" : "saved"} on <b>{it.device}</b></span>
                  <time>{new Date(it.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                </span>
                <span className="activity-body">
                  <span className="activity-shot">{rom && <Art rom={rom} src={it.shotUrl} />}</span>
                  <span className="activity-text">
                    {it.current && <span className="pill accent">Active save</span>}
                    <span>{SYSTEMS[it.system].label}</span>
                    <span className="dim">{ago(it.updatedAt)}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------- Add games
export function AddView({ roms, onBack, onPick }: { roms: RomView[]; onBack: () => void; onPick: () => void }) {
  return (
    <section className="view narrow">
      <PageHead title="Add Games" onBack={onBack} />
      <p className="lead">Your own cartridge dumps go straight to your private cloud bucket.</p>
      <button data-nav data-autofocus className="dropzone" onClick={onPick}>
        <span className="dz-icon"><Icon name="plus" size={40} stroke={2.4} /></span>
        <strong>Choose files</strong>
        <span>or drag them anywhere onto this page</span>
      </button>
      <div className="rows">
        <h3>Supported systems</h3>
        {Object.entries(SYSTEMS).map(([k, s]) => (
          <div key={k} className="row"><span>{s.label}</span><code>.{s.exts.join(" .")}</code></div>
        ))}
        <h3>In your library</h3>
        <div className="row"><span>{roms.length} games</span><span className="dim">{mb(roms.reduce((a, r) => a + r.size, 0))}</span></div>
      </div>
    </section>
  );
}


export { default as SettingsView } from "./Settings";
