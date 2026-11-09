"use client";
import { useEffect, useRef, useState } from "react";
import type { RomView } from "../lib/games";
import { api } from "../lib/client";
import Icon from "./Icon";
import { focusFirst, useNavEvent } from "./nav";
import { sfx } from "./sfx";

type Cand = { name: string; dir: string; score: number; url: string };

/** Pick boxart from the libretro-thumbnails library (best matches first, or search). */
export default function CoverPicker({ rom, onClose, onPicked, onUpload }: { rom: RomView; onClose: () => void; onPicked: () => void; onUpload: () => void }) {
  const [q, setQ] = useState("");
  const [cands, setCands] = useState<Cand[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const timer = useRef<any>(null);
  useNavEvent("nav:back", onClose, [onClose]);

  const search = (query?: string) => {
    setCands(null); setErr("");
    api<{ candidates: Cand[] }>(`/api/roms/${rom.id}`, { method: "POST", body: JSON.stringify({ action: "cover-find", q: query }) })
      .then((r) => { setCands(r.candidates); setTimeout(() => focusFirst(".coverpick .cover-opt"), 40); })
      .catch((e) => { setErr(e.message); setCands([]); });
  };
  useEffect(() => { search(); /* eslint-disable-next-line */ }, [rom.id]);

  async function pick(c: Cand) {
    setBusy(c.name);
    try {
      await api(`/api/roms/${rom.id}`, { method: "POST", body: JSON.stringify({ action: "cover-auto", dir: c.dir, name: c.name }) });
      sfx("saved"); onPicked();
    } catch (e: any) { setErr(e.message); sfx("error"); setBusy(null); }
  }

  return (
    <div className="scrim" data-nav-scope>
      <div className="modal coverpick">
        <div className="modal-inner">
          <h2>Choose cover art</h2>
          <label className="search-input small"><Icon name="search" size={22} />
            <input data-nav value={q} placeholder={rom.title} onChange={(e) => { setQ(e.target.value); clearTimeout(timer.current); timer.current = setTimeout(() => search(e.target.value), 350); }} />
          </label>
          {rom.header?.title && <p className="dim small">Cartridge header: <b>{rom.header.title}</b>{rom.header.code ? ` · ${rom.header.code}` : ""}{rom.header.region ? ` · ${rom.header.region}` : ""}</p>}
          <div className="cover-grid">
            {cands === null && Array.from({ length: 6 }, (_, i) => <div key={i} className="cover-opt skeleton" />)}
            {cands?.map((c) => (
              <button key={c.dir + c.name} data-nav className={`cover-opt ${busy === c.name ? "busy" : ""}`} onClick={() => pick(c)} title={c.name}>
                <img src={c.url} alt="" loading="lazy" />
                <span>{c.name}</span>
              </button>
            ))}
            {cands?.length === 0 && <p className="empty">No matches{q ? ` for “${q}”` : ""}. Try a shorter search.</p>}
          </div>
          {err && <p className="lock-msg">{err}</p>}
          <p className="dim small">Box art from the libretro-thumbnails project.</p>
        </div>
        <div className="modal-actions">
          <button data-nav className="btn" onClick={onClose}>Cancel</button>
          <button data-nav className="btn" onClick={onUpload}><Icon name="image" size={20} />Upload my own</button>
        </div>
      </div>
    </div>
  );
}
