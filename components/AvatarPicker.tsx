"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/client";
import Icon, { Avatar } from "./Icon";
import { focusFirst, useNavEvent } from "./nav";
import { sfx } from "./sfx";
import type { Me } from "./Shell";

type Opt = { n: string; s: string; u: string };
type Index = { amiibo: Opt[]; pokemon: Opt[] };

/** Choose a preset profile picture: any amiibo character (by series) or any Pokémon (by region). */
export default function AvatarPicker({ me, onClose }: { me: Me | null; onClose: () => void }) {
  const [idx, setIdx] = useState<Index | null>(null);
  const [err, setErr] = useState("");
  const [src, setSrc] = useState<"amiibo" | "pokemon">("amiibo");
  const [group, setGroup] = useState("All");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useNavEvent("nav:back", onClose, [onClose]);
  useNavEvent("nav:tab", () => { setSrc((s) => (s === "amiibo" ? "pokemon" : "amiibo")); setGroup("All"); sfx("tab"); }, []);

  useEffect(() => {
    api<Index>("/api/avatars").then((d) => { setIdx(d); setTimeout(() => focusFirst(".avpick .av-opt"), 60); }).catch((e) => setErr(e.message));
  }, []);

  const list = idx?.[src] ?? [];
  const groups = useMemo(() => ["All", ...Array.from(new Set(list.map((o) => o.s)))], [list]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return list.filter((o) => (group === "All" || o.s === group) && (!t || o.n.toLowerCase().includes(t) || o.s.toLowerCase().includes(t)));
  }, [list, group, q]);

  async function choose(url: string | null) {
    setBusy(true);
    try {
      await api("/api/account", { method: "PATCH", body: JSON.stringify({ avatar: url }) });
      sfx("saved"); dispatchEvent(new Event("pc-me")); onClose();
    } catch (e: any) { setErr(e.message); sfx("error"); setBusy(false); }
  }

  return (
    <div className="scrim" data-nav-scope>
      <div className="modal avpick">
        <div className="modal-inner">
          <div className="avpick-head">
            <Avatar name={me?.name} color={me?.color} src={me?.avatar} size={72} />
            <div><h2>Choose your profile picture</h2><p className="dim small">Characters via AmiiboAPI · Pokémon via PokéAPI</p></div>
          </div>
          <div className="avpick-bar">
            <div className="tablist">
              <button className={`tab ${src === "amiibo" ? "on" : ""}`} onClick={() => { setSrc("amiibo"); setGroup("All"); }}>Characters{idx && <span className="count">{idx.amiibo.length}</span>}</button>
              <button className={`tab ${src === "pokemon" ? "on" : ""}`} onClick={() => { setSrc("pokemon"); setGroup("All"); }}>Pokémon{idx && <span className="count">{idx.pokemon.length}</span>}</button>
            </div>
            <label className="search-input small"><Icon name="search" size={20} />
              <input ref={input} data-nav value={q} onChange={(e) => setQ(e.target.value)} placeholder={src === "amiibo" ? "Mario, Link, Kirby…" : "Pikachu, Rayquaza…"} />
            </label>
          </div>
          <div className="chips">
            {groups.map((g) => <button key={g} data-nav className={`chip ${g === group ? "on" : ""}`} onClick={() => setGroup(g)}>{g}</button>)}
          </div>
          <div className="av-grid">
            {!idx && !err && Array.from({ length: 16 }, (_, i) => <div key={i} className="av-opt"><span className="avatar skeleton" style={{ width: 92, height: 92 }} /></div>)}
            {shown.map((o) => (
              <button key={o.u} data-nav className={`av-opt ${me?.avatar === o.u ? "on" : ""}`} onClick={() => !busy && choose(o.u)} title={`${o.n} · ${o.s}`}>
                <Avatar src={o.u} color={me?.color} size={92} />
                <span>{o.n}</span>
              </button>
            ))}
            {idx && !shown.length && <p className="empty">No match for “{q}”.</p>}
            {err && <p className="lock-msg">{err}</p>}
          </div>
        </div>
        <div className="modal-actions">
          <button data-nav className="btn" onClick={onClose}>Cancel</button>
          <button data-nav className="btn" onClick={() => choose(null)} disabled={!me?.avatar}>Use my initial</button>
        </div>
      </div>
    </div>
  );
}
