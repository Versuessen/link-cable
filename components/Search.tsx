"use client";
import { useEffect, useRef, useState } from "react";
import type { RomView, System } from "../lib/games";
import { SYSTEMS } from "../lib/games";
import Art from "./Art";
import Icon from "./Icon";
import { BottomBar, Clock, H } from "./Shell";
import { useNavEvent } from "./nav";

/** Full-screen search: input bar across the top, filter pills, result grid. */
export default function Search({ roms, onClose, onPick }: { roms: RomView[]; onClose: () => void; onPick: (r: RomView) => void }) {
  const [q, setQ] = useState("");
  const [sys, setSys] = useState<"all" | System>("all");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => ref.current?.focus(), 30); }, []);
  useNavEvent("nav:back", onClose, [onClose]);
  const match = roms.filter((r) => r.title.toLowerCase().includes(q.toLowerCase()) || r.filename.toLowerCase().includes(q.toLowerCase()));
  const res = match.filter((r) => sys === "all" || r.system === sys);
  const systems = (["gba", "nds", "gbc", "gb"] as System[]).filter((s) => match.some((r) => r.system === s));
  return (
    <div className="searchpage" data-nav-scope>
      <div className="search-top">
        <label className="search-input"><Icon name="search" size={28} />
          <input ref={ref} data-nav value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your games"
            onKeyDown={(e) => { if (e.key === "Enter" && res[0]) onPick(res[0]); }} />
          {q && <button className="clear" onClick={() => { setQ(""); ref.current?.focus(); }} aria-label="Clear"><Icon name="close" size={20} stroke={2.6} /></button>}
        </label>
        <Clock />
      </div>
      <div className="tablist center">
        <button className={`tab ${sys === "all" ? "on" : ""}`} onClick={() => setSys("all")}>All<span className="count">{match.length}</span></button>
        {systems.map((s) => <button key={s} className={`tab ${sys === s ? "on" : ""}`} onClick={() => setSys(s)}>{SYSTEMS[s].label}<span className="count">{match.filter((r) => r.system === s).length}</span></button>)}
      </div>
      <div className="cardgrid">
        {res.map((r) => (
          <button key={r.id} data-nav className="card" onClick={() => onPick(r)}>
            <span className="card-art"><Art rom={r} prefer="shot" /></span>
            <span className="card-label"><Icon name="grid" size={18} />In library<em>{SYSTEMS[r.system].label}</em></span>
            <span className="card-title">{r.title}</span>
          </button>
        ))}
        {!res.length && <p className="empty">No games match “{q}”.</p>}
      </div>
      <BottomBar hints={[H.back, H.select]} />
    </div>
  );
}
