"use client";
import { achievementsFor, totalPoints, CATEGORY_LABEL, type Achievement } from "../lib/achievements";
import { useEffect, useRef, useState } from "react";
import type { RomView, SaveMeta, SaveVersion } from "../lib/games";
import { SYSTEMS } from "../lib/games";
import { ago, api, mb, playtime, putWithProgress } from "../lib/client";
import Art, { tint } from "./Art";
import Icon from "./Icon";
import { BottomBar, H, Modal, PromptModal, type Push } from "./Shell";
import { focusFirst, useNavEvent } from "./nav";
import CoverPicker from "./CoverPicker";
import { sfx } from "./sfx";

type Hist = SaveVersion & { shotUrl?: string | null };
type M = Omit<SaveMeta, "history"> & { history: Hist[] };

function AchievementList({ set, unlocked }: { set: Achievement[]; unlocked: Record<string, number> }) {
  const got = set.filter((a) => unlocked[a.id]), pts = got.reduce((n, a) => n + a.points, 0), all = totalPoints(set);
  const cats = (Object.keys(CATEGORY_LABEL) as (keyof typeof CATEGORY_LABEL)[]).map((c) => ({ c, items: set.filter((a) => a.cat === c) })).filter((x) => x.items.length);
  return (
    <div className="ach">
      <div className={`ach-summary ${got.length === set.length ? "mastered" : ""}`}>
        <span className="ach-ring" style={{ ["--p" as any]: got.length / set.length }}><b>{Math.round((got.length / set.length) * 100)}%</b></span>
        <span className="ach-sum-text">
          <strong>{got.length === set.length ? "Mastered" : `${got.length} of ${set.length} unlocked`}</strong>
          <span>{pts.toLocaleString()} / {all.toLocaleString()} points · unlocks appear while you play{got.length === 0 ? ", after your first in-game save" : ""}</span>
        </span>
      </div>
      {cats.map(({ c, items }) => (
        <section key={c}>
          <h3 className="dayline"><span>{CATEGORY_LABEL[c]}</span><em>{items.filter((a) => unlocked[a.id]).length} / {items.length}</em></h3>
          <div className="ach-grid">
            {items.map((a) => {
              const on = !!unlocked[a.id], hide = a.secret && !on;
              return (
                <div key={a.id} className={`ach-card ${on ? "on" : ""} cat-${a.cat}`}>
                  <span className="ach-medal"><Icon name={on ? "star" : hide ? "lock" : "star"} size={22} /></span>
                  <span className="ach-text"><b>{hide ? "Secret achievement" : a.title}</b><small>{hide ? "Keep playing to find out" : a.desc}</small>
                    {on && <small className="ach-when">{new Date(unlocked[a.id]).toLocaleDateString()}</small>}</span>
                  <span className="ach-pts">{a.points}</span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Game details page: hero banner, Play bar, Cloud Saves / Game Info tabs. */
export default function GamePage({ rom, onClose, onPlay, onChanged, toast }: {
  rom: RomView; onClose: () => void; onPlay: () => void; onChanged: (deleted?: boolean) => void; toast: Push;
}) {
  const [meta, setMeta] = useState<M | null>(null);
  const [tab, setTab] = useState<"saves" | "ach" | "info">("saves");
  const set = achievementsFor(rom.header?.code);
  const [unlocked, setUnlocked] = useState<Record<string, number> | null>(null);
  const tabsOrder = (set ? ["saves", "ach", "info"] : ["saves", "info"]) as ("saves" | "ach" | "info")[];
  const [modal, setModal] = useState<null | "rename" | "delete" | "cover" | { restore: Hist }>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<{ meta: M }>(`/api/saves/${rom.id}`).then((r) => setMeta(r.meta)).catch(() => setMeta({ current: null, history: [], playSeconds: 0 }));
    if (set) api<{ unlocked: Record<string, number> }>(`/api/achievements/${rom.id}`).then((r) => setUnlocked(r.unlocked)).catch(() => setUnlocked({}));
    setTimeout(() => focusFirst(".gamepage .btn.play"), 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rom.id]);
  useNavEvent("nav:back", () => { if (!modal) onClose(); }, [modal, onClose]);
  useNavEvent("nav:tab", (d: number) => { if (!modal) { sfx("tab"); setTab((t) => tabsOrder[(tabsOrder.indexOf(t) + (d || 1) + tabsOrder.length) % tabsOrder.length]); } }, [modal, tabsOrder.length]);

  async function setCover(file: File) {
    const t = toast({ title: "Uploading cover…", text: file.name, progress: 0, icon: "image" }, 0);
    try {
      const { ver, uploadUrl } = await api<{ ver: string; uploadUrl: string }>(`/api/roms/${rom.id}`, { method: "POST", body: JSON.stringify({ action: "cover-url" }) });
      await putWithProgress(uploadUrl, file, (p) => t.update({ progress: p }));
      await api(`/api/roms/${rom.id}`, { method: "POST", body: JSON.stringify({ action: "cover", ver }) });
      t.update({ title: "Cover updated", progress: undefined, icon: "cloudok" }); t.close(2000); sfx("saved");
      onChanged();
    } catch (e: any) { t.update({ title: "Cover upload failed", text: e.message, progress: undefined, error: true }); t.close(5000); }
  }

  const cur = meta?.current;
  const saves = meta?.history ?? [];

  return (
    <div className="gamepage" data-nav-scope style={{ ["--tint" as any]: tint(rom) }}>
      <div className="gp-hero">
        <Art rom={rom} prefer="shot" label={false} />
        <div className="gp-hero-title">
          <span className="sys">{SYSTEMS[rom.system].label}</span>
          <h1>{rom.title}</h1>
        </div>
        <button className="gp-close" onClick={onClose} aria-label="Back"><Icon name="back" size={26} /></button>
      </div>

      <div className="gp-bar">
        <button data-nav className="btn play" onClick={onPlay}><Icon name="play" size={26} />{cur ? "Continue" : "Play"}</button>
        <div className="gp-stat"><small>Last played</small><b>{cur ? ago(cur.updatedAt) : "Never"}</b></div>
        <div className="gp-stat"><small>Play time</small><b>{playtime(meta?.playSeconds)} hours</b></div>
        <div className="gp-stat"><small>Cloud</small><b className="ok"><Icon name="cloudok" size={20} />{cur ? "Synced" : "No saves"}</b></div>
        <div className="gp-tools">
          <button data-nav className="roundbtn" title="Cover art" onClick={() => setModal("cover")}><Icon name="image" size={24} /></button>
          <button data-nav className="roundbtn" title="Rename" onClick={() => setModal("rename")}><Icon name="pencil" size={24} /></button>
          <button data-nav className="roundbtn" title="Delete" onClick={() => setModal("delete")}><Icon name="trash" size={24} /></button>
        </div>
      </div>

      <div className="tabs center">
        <span className="shoulder"><kbd className="key">Q</kbd><span className="glyph sq">L</span></span>
        <div className="tablist">
          <button className={`tab ${tab === "saves" ? "on" : ""}`} onClick={() => setTab("saves")}>Cloud Saves<span className="count">{saves.length}</span></button>
          {set && <button className={`tab ${tab === "ach" ? "on" : ""}`} onClick={() => setTab("ach")}>Achievements<span className="count">{unlocked ? Object.keys(unlocked).length : 0} / {set.length}</span></button>}
          <button className={`tab ${tab === "info" ? "on" : ""}`} onClick={() => setTab("info")}>Game Info</button>
        </div>
        <span className="shoulder"><kbd className="key">E</kbd><span className="glyph sq">R</span></span>
      </div>

      <div className="gp-body">
        {tab === "saves" && (meta === null ? <div className="savegrid"><div className="savecard skeleton" /><div className="savecard skeleton" /></div> :
          saves.length === 0 ? <p className="empty">No saves yet — press Play and progress syncs automatically.</p> : (
          <div className="savegrid">
            {saves.map((h) => (
              <button key={h.ver} data-nav className={`savecard ${h.ver === cur?.ver ? "current" : ""}`} onClick={() => (h.ver !== cur?.ver ? setModal({ restore: h }) : onPlay())}>
                <span className="savecard-art"><Art rom={rom} src={h.shotUrl ?? null} label={false} /></span>
                <span className="savecard-meta">
                  <b>{ago(h.updatedAt)}</b>
                  <span>{h.device}</span>
                  {h.ver === cur?.ver ? <span className="pill accent">Active</span> : <span className="pill">{h.reason}</span>}
                </span>
              </button>
            ))}
          </div>
        ))}
        {tab === "ach" && set && <AchievementList set={set} unlocked={unlocked ?? {}} />}
        {tab === "info" && (
          <div className="gp-info">
            <div className="gp-cover"><Art rom={rom} prefer="cover" /></div>
            <dl>
              <dt>System</dt><dd>{SYSTEMS[rom.system].label}</dd>
              <dt>File</dt><dd>{rom.filename}</dd>
              <dt>Size</dt><dd>{mb(rom.size)}</dd>
              <dt>Added</dt><dd>{new Date(rom.addedAt).toLocaleDateString()}</dd>
              {rom.header?.title && <><dt>Cartridge</dt><dd>{rom.header.title}{rom.header.code ? ` · ${rom.header.code}` : ""}</dd></>}
              <dt>Cover art</dt><dd>
                {rom.coverSource === "auto" ? <>Box art: {rom.coverName}</> : rom.coverVer ? "Your upload" : "Latest save screenshot"}
                {" · "}<button data-nav className="link" onClick={() => setModal("cover")}>change</button>
                {rom.coverVer && <>{" · "}<button data-nav className="link" onClick={async () => { await api(`/api/roms/${rom.id}`, { method: "POST", body: JSON.stringify({ action: "cover-reset" }) }); onChanged(); }}>remove</button></>}
              </dd>
            </dl>
          </div>
        )}
      </div>

      <input ref={coverInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setCover(f); e.target.value = ""; }} />
      <BottomBar hints={[H.back, { btn: "A", key: "Enter", label: "Select" }]} />

      {modal === "cover" && (
        <CoverPicker rom={rom} onClose={() => setModal(null)} onPicked={() => { setModal(null); toast({ title: "Cover updated", icon: "image" }, 2000); onChanged(); }}
          onUpload={() => { setModal(null); coverInput.current?.click(); }} />
      )}
      {modal === "rename" && (
        <PromptModal title="Rename game" label="Display name" initial={rom.title} onClose={() => setModal(null)}
          onSubmit={async (v) => { setModal(null); await api(`/api/roms/${rom.id}`, { method: "POST", body: JSON.stringify({ action: "rename", title: v }) }); onChanged(); }} />
      )}
      {modal === "delete" && (
        <Modal title={`Delete ${rom.title}?`} onClose={() => setModal(null)} actions={[
          { label: "Delete", danger: true, onClick: async () => { setModal(null); await api(`/api/roms/${rom.id}`, { method: "DELETE" }); sfx("back"); onChanged(true); } },
          { label: "Cancel", primary: true, onClick: () => setModal(null) },
        ]}>
          <p>The game file and <b>all its cloud saves</b> will be removed. This can&apos;t be undone.</p>
        </Modal>
      )}
      {modal && typeof modal === "object" && (
        <Modal title="Restore this save?" art={<Art rom={rom} src={modal.restore.shotUrl ?? null} label={false} />} onClose={() => setModal(null)} actions={[
          { label: "Cancel", onClick: () => setModal(null) },
          { label: "Restore", primary: true, onClick: async () => {
            const r = await api<{ meta: M }>(`/api/saves/${rom.id}`, { method: "PUT", body: JSON.stringify({ restore: modal.restore.ver }) });
            setMeta((m) => (m ? { ...m, current: r.meta.current } : m)); setModal(null); sfx("saved");
            toast({ title: "Save restored", text: "It loads the next time you press Play." }); onChanged();
          } },
        ]}>
          <p>From <b>{new Date(modal.restore.updatedAt).toLocaleString()}</b> on {modal.restore.device}.</p>
          <p className="dim">Your current save stays in the list, so you can switch back.</p>
        </Modal>
      )}
    </div>
  );
}
