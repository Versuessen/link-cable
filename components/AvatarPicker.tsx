"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/client";
import { sampleAvatarColor } from "../lib/artColor";
import Icon, { Avatar, autoFraming, parseAvatar, withFraming, type Framing } from "./Icon";
import { focusFirst, useNavEvent } from "./nav";
import { sfx } from "./sfx";
import { patchMe, type Me } from "./Shell";

type Opt = { n: string; s: string; u: string };
type Index = { amiibo: Opt[]; pokemon: Opt[] };
const ART = { home: "other/home/", art: "other/official-artwork/" };

/**
 * Choose a preset profile picture: any amiibo figure (grouped by series) or any Pokémon (grouped by region).
 * Pick one, fine-tune the framing if the automatic one isn't right, then save.
 */
export default function AvatarPicker({ me, onClose }: { me: Me | null; onClose: () => void }) {
  const [idx, setIdx] = useState<Index | null>(null);
  const [err, setErr] = useState("");
  const [src, setSrc] = useState<"amiibo" | "pokemon">("amiibo");
  const [style, setStyle] = useState<keyof typeof ART>("home");
  const [group, setGroup] = useState("All");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  // the picture being edited (starts as your current one) and its framing; null framing = automatic
  const [sel, setSel] = useState<string | null>(me?.avatar ? parseAvatar(me.avatar).url : null);
  const [fr, setFr] = useState<Framing | null>(me?.avatar ? parseAvatar(me.avatar).framing : null);
  const grid = useRef<HTMLDivElement>(null);
  useNavEvent("nav:back", onClose, [onClose]);
  useNavEvent("nav:tab", () => { setSrc((s) => (s === "amiibo" ? "pokemon" : "amiibo")); setGroup("All"); sfx("tab"); }, []);

  useEffect(() => {
    api<Index>("/api/avatars").then((d) => { setIdx(d); setTimeout(() => focusFirst(".avpick .av-opt"), 60); }).catch((e) => setErr(e.message));
  }, []);

  const list = useMemo(() => (idx?.[src] ?? []).map((o) => (src === "pokemon" && style === "art" ? { ...o, u: o.u.replace(ART.home, ART.art) } : o)), [idx, src, style]);
  const groups = useMemo(() => Array.from(new Set(list.map((o) => o.s))), [list]);
  // always shown in sections (series / region); the chips jump to or isolate one
  const sections = useMemo(() => {
    const t = q.trim().toLowerCase();
    return groups.filter((g) => group === "All" || g === group)
      .map((g) => ({ g, items: list.filter((o) => o.s === g && (!t || o.n.toLowerCase().includes(t) || o.s.toLowerCase().includes(t))) }))
      .filter((s) => s.items.length);
  }, [list, groups, group, q]);

  const pick = (u: string) => { setSel(u); setFr(null); sfx("tab"); };
  const kind = sel ? parseAvatar(sel).kind : "";
  // sliders start from whatever is on screen now (automatic framing included)
  const current = (): Framing => {
    if (fr) return fr;
    const img = document.querySelector<HTMLImageElement>(".av-preview img");
    return (kind === "fig" && img?.complete && autoFraming(img, sel!)) || { z: kind === "poke" ? 0.86 : 1.6, x: 0, y: 0 };
  };
  const tweak = (p: Partial<Framing>) => setFr({ ...current(), ...p });

  async function save(url: string | null) {
    setBusy(true);
    try {
      const avatar = url ? withFraming(url, fr) : null;
      const color = me?.colorAuto && url ? await sampleAvatarColor(url) : null;
      await patchMe({ avatar, ...(color ? { color } : {}) });
      sfx("saved"); onClose();
    } catch (e: any) { setErr(e.message); sfx("error"); setBusy(false); }
  }
  const cur = fr ?? (sel ? current() : null);
  const changed = sel ? withFraming(sel, fr) !== (me?.avatar ?? "") : false;

  return (
    <div className="scrim" data-nav-scope>
      <div className="modal avpick">
        <div className="modal-inner">
          <div className="avpick-head">
            <span className="av-preview"><Avatar name={me?.name} color={me?.color} src={sel ? withFraming(sel, fr) : null} size={104} /></span>
            <div className="avpick-title">
              <h2>Profile picture</h2>
              {sel ? (
                <div className="av-adjust" data-nav-row>
                  {([["Zoom", "z", 0.6, 4, 0.02], ["Left / right", "x", -150, 150, 1], ["Up / down", "y", -150, 150, 1]] as const).map(([label, k, min, max, step]) => (
                    <label key={k}><span>{label}</span>
                      <input data-nav type="range" min={min} max={max} step={step} value={cur ? cur[k] : 0} aria-label={label}
                        onChange={(e) => tweak({ [k]: +e.target.value })}
                        onKeyDown={(e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); const v = (cur ? cur[k] : 0) + (e.key === "ArrowRight" ? 1 : -1) * step * (k === "z" ? 3 : 4); tweak({ [k]: Math.max(min, Math.min(max, v)) }); } }} />
                    </label>
                  ))}
                  <button data-nav className="btn small" disabled={!fr} onClick={() => { setFr(null); sfx("tab"); }} title="Frame it automatically"><Icon name="auto" size={18} />Auto</button>
                </div>
              ) : <p className="dim small">Pick a character below. You can adjust how it sits in the circle.</p>}
            </div>
          </div>
          <div className="avpick-bar">
            <div className="tablist">
              <button className={`tab ${src === "amiibo" ? "on" : ""}`} onClick={() => { setSrc("amiibo"); setGroup("All"); sfx("tab"); }}>Characters{idx && <span className="count">{idx.amiibo.length}</span>}</button>
              <button className={`tab ${src === "pokemon" ? "on" : ""}`} onClick={() => { setSrc("pokemon"); setGroup("All"); sfx("tab"); }}>Pokémon{idx && <span className="count">{idx.pokemon.length}</span>}</button>
            </div>
            {src === "pokemon" && (
              <span className="seg small">
                <button data-nav className={style === "home" ? "on" : ""} onClick={() => { setStyle("home"); sfx("tab"); }}>3D</button>
                <button data-nav className={style === "art" ? "on" : ""} onClick={() => { setStyle("art"); sfx("tab"); }}>Artwork</button>
              </span>
            )}
            <label className="search-input small"><Icon name="search" size={20} />
              <input data-nav value={q} onChange={(e) => setQ(e.target.value)} placeholder={src === "amiibo" ? "Mario, Link, Kirby…" : "Pikachu, Rayquaza…"} />
            </label>
          </div>
          <div className="chips" data-nav-row>
            {["All", ...groups].map((g) => <button key={g} data-nav className={`chip ${g === group ? "on" : ""}`} onClick={() => { setGroup(g); grid.current?.scrollTo({ top: 0 }); sfx("tab"); }}>{g}</button>)}
          </div>
          <div className="av-scroll" ref={grid}>
            {!idx && !err && <div className="av-grid">{Array.from({ length: 16 }, (_, i) => <div key={i} className="av-opt"><span className="avatar skeleton" style={{ width: 92, height: 92 }} /></div>)}</div>}
            {sections.map(({ g, items }) => (
              <section key={g}>
                <h3 className="dayline"><span>{g}</span><em>{items.length}</em></h3>
                <div className="av-grid">
                  {items.map((o) => (
                    <button key={o.u} data-nav className={`av-opt ${sel === o.u ? "on" : ""}`} onClick={() => pick(o.u)} title={`${o.n} · ${o.s}`}>
                      <Avatar src={o.u} color={me?.color} size={92} />
                      <span>{o.n}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
            {idx && !sections.length && <p className="empty">No match for “{q}”.</p>}
            {err && <p className="lock-msg">{err}</p>}
          </div>
        </div>
        <div className="modal-actions">
          <button data-nav className="btn" onClick={onClose}>Cancel</button>
          <button data-nav className="btn reset" onClick={() => save(null)} disabled={busy || !me?.avatar}><Icon name="reset" size={20} />Use my initial</button>
          <button data-nav className="btn primary" onClick={() => save(sel)} disabled={busy || !sel || !changed}>Save</button>
        </div>
      </div>
    </div>
  );
}
