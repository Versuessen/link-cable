"use client";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RomView, SaveVersion } from "../../../lib/games";
import { SYSTEMS } from "../../../lib/games";
import { ago, playtime } from "../../../lib/client";
import Art, { tint } from "../../../components/Art";
import Icon from "../../../components/Icon";
import { BottomBar, Clock, H, Modal, Toasts, Toggle, usePresence, useToasts } from "../../../components/Shell";
import { focusFirst, useNavEvent } from "../../../components/nav";
import { sfx } from "../../../components/sfx";
import { achievementsFor, newlyUnlocked, type GameState } from "../../../lib/achievements";
import { RunBoard, useRun, MODE_LABEL } from "../../../components/RunBoard";

type Status = { running: boolean; saving: boolean; paused: boolean; lastSyncAt: number; blocked: boolean; dirty: boolean; failing: number };
type Sync = { save: (r?: string) => Promise<any>; forceSave: () => Promise<any>; pullLatest: (v?: string) => Promise<boolean>; status: () => Status; pause: () => void; play: () => void; setVolume: (v: number) => void; getVolume: () => number };
type Pane = "game" | "run" | "ach";

export default function Play({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const frame = useRef<HTMLIFrameElement>(null);
  const [rom, setRom] = useState<RomView | null>(null);
  const [boot, setBoot] = useState<{ label: string; pct: number } | null>({ label: "Preparing", pct: 0 });
  const [status, setStatus] = useState<Status | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [exiting, setExiting] = useState<string | null>(null);
  const [conflict, setConflict] = useState<SaveVersion | null>(null);
  const [error, setError] = useState<{ message: string; fatal?: boolean } | null>(null);
  const [hud, setHud] = useState(true);
  const [pane, setPane] = useState<Pane>("game");
  const [muted, setMuted] = useState(false);
  const [full, setFull] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const toasts = useToasts();
  usePresence(rom?.title);
  // ---- playthroughs: ?run=<id> plays that run's own saves and feeds its tracker
  const [runId, setRunId] = useState<string | null>(null);
  const [runReady, setRunReady] = useState(false);
  useEffect(() => { const r = new URLSearchParams(location.search).get("run"); setRunId(r && /^[a-z0-9]{8}$/.test(r) ? r : null); setRunReady(true); }, []);
  const run = useRun(runId);
  const [board, setBoard] = useState(false);
  const runRef = useRef(run); runRef.current = run;
  // ---- in-game achievements: the emulator page reports the game's state, we decide what just unlocked
  const ach = useRef<{ have: Record<string, number> | null; prev: GameState | null; busy: boolean; migrate: boolean }>({ have: null, prev: null, busy: false, migrate: false });
  const [achCount, setAchCount] = useState(0);
  const [reader, setReader] = useState<{ note: string; tracking: boolean; supported: boolean } | null>(null);
  // randomized runs don't earn achievements (the game isn't the one they describe)
  const set = rom && !(runId && (!run.meta || run.meta.random)) ? achievementsFor(rom) : null;
  const sessionStart = useRef(Date.now());
  useEffect(() => {
    if (!set) return;
    fetch(`/api/achievements/${id}`).then((r) => r.json()).then((d) => { ach.current.have = d.unlocked ?? {}; ach.current.migrate = d.v !== 2 && Object.keys(d.unlocked ?? {}).length > 0; setAchCount(Object.keys(d.unlocked ?? {}).length); }).catch(() => { ach.current.have = {}; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, !!set]);
  const onState = (input: GameState) => {
    let st = input;
    const a = ach.current;
    if (!set || !a.have) return;
    // Gen 1/2 have no readable clock: use the time played here (all sessions so far + this one)
    if (st.playSeconds == null) st = { ...st, playSeconds: (rom?.playSeconds ?? 0) + (Date.now() - sessionStart.current) / 1000 };
    // one-time cleanup: unlocks recorded by the old reader that this verified reading doesn't back up
    let revoke: string[] = [];
    if (a.migrate) {
      revoke = Object.keys(a.have).filter((k) => { const x = set.find((y) => y.id === k); if (!x || x.cat === "feat") return false; try { return !x.test(st, null); } catch { return false; } });
      for (const k of revoke) delete a.have[k];
    }
    const fresh = newlyUnlocked(set, st, a.prev, a.have);
    a.prev = st;
    if (a.migrate) {
      a.migrate = false;
      setAchCount(Object.keys(a.have).length + fresh.length);
      if (revoke.length) toasts.push({ title: `Corrected ${revoke.length} achievement${revoke.length > 1 ? "s" : ""}`, text: "Removed unlocks an earlier version misread", icon: "info" }, 6000);
      fetch(`/api/achievements/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: fresh.map((x) => x.id), revoke, migrate: 2 }) }).catch(() => {});
      if (!fresh.length) return;
    } else if (!fresh.length) return;
    const now = Date.now();
    for (const x of fresh) a.have[x.id] = now;
    setAchCount(Object.keys(a.have).length);
    sfx("saved");
    // a long-running save can unlock a whole batch on first contact: one summary instead of a wall of pop-ups
    if (fresh.length > 3) toasts.push({ title: `${fresh.length} achievements unlocked`, text: `+${fresh.reduce((n, x) => n + x.points, 0)} points · see them on the game page`, icon: "star", gold: true }, 7000);
    else fresh.forEach((x, i) => setTimeout(() => toasts.push({ title: x.title, text: `${x.desc} · +${x.points}`, icon: "star", gold: true }, 6500), i * 900));
    fetch(`/api/achievements/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: fresh.map((x) => x.id) }) }).catch(() => {});
  };
  const onStateRef = useRef(onState); onStateRef.current = onState;
  const leaving = useRef(false);
  const sync = () => (frame.current?.contentWindow as any)?.pokeSync as Sync | undefined;

  const openOverlay = useCallback((p: Pane = "game") => { sync()?.pause(); setPane(p); setOverlay(true); setBoard(false); setTimeout(() => focusFirst(".pause [data-autofocus]"), 40); }, []);
  const closeOverlay = useCallback(() => { setOverlay(false); sync()?.play(); frame.current?.focus(); frame.current?.contentWindow?.focus(); }, []);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.data?.source !== "pokepc") return;
      const d = e.data;
      switch (d.type) {
        case "boot": setRom(d.rom); setBoot({ label: "Reading cartridge", pct: 0 }); break;
        case "progress": setBoot({ label: "Downloading ROM", pct: d.pct }); break;
        case "started":
          setBoot(null); frame.current?.focus();
          toasts.push(d.hadSave
            ? { title: "Cloud save loaded", text: `${ago(d.meta.current?.updatedAt)} · ${d.meta.current?.device ?? ""}`, icon: "cloudok" }
            : { title: "New game", text: "Progress syncs to the cloud automatically", icon: "cloud" });
          break;
        case "status": setStatus(d); break;
        case "saved":
          setSaveErr(null);
          if (d.reason !== "auto" && d.reason !== "leave") { sfx("saved"); toasts.push({ title: "Saved to cloud", icon: "cloudok" }, 2000); }
          break;
        case "save-failed":
          // autosaves retry by themselves: only a save you asked for gets a pop-up
          setSaveErr(d.message);
          if (d.reason === "manual" || d.reason === "ingame") toasts.push({ title: "Couldn't save to the cloud", text: `${d.message} · your game keeps running, try again in a moment`, icon: "wifioff", error: true }, 6000);
          break;
        case "conflict": sync()?.pause(); setConflict(d.current); break;
        case "error": setError({ message: d.message, fatal: d.fatal }); break;
        case "menu": openOverlay(); break;
        case "game-state": {
          onStateRef.current(d.state);
          const R = runRef.current;
          if (R.meta && d.state?.party && d.state.partyLive !== false) {
            for (const a of R.feed(d.state)) {
              if (a.big) sfx("error");
              toasts.push({ title: a.text, icon: a.kind === "death" || a.kind === "link" ? "flame" : a.kind === "catch" ? "star" : "info", error: a.kind === "death" || a.kind === "link" }, a.big ? 8000 : 4500);
            }
          }
          break;
        }
        case "randomized": toasts.push({ title: "Randomized", text: `Seed ${d.seed}${d.log?.length ? " · " + d.log.slice(0, 2).join(" · ") : ""}`, icon: "auto" }, 6000); break;
        case "reader-status": setReader(d); break;
        case "auth": location.href = `/login?next=/play/${id}`; break;
      }
    };
    addEventListener("message", onMsg);
    return () => removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // closing the tab / reloading while the cloud may be behind → browser "Leave site?" + kick off a save
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (leaving.current) return;
      if (sync()?.status()?.dirty) { sync()?.save("leave"); e.preventDefault(); e.returnValue = ""; }
    };
    addEventListener("beforeunload", before);
    return () => removeEventListener("beforeunload", before);
  }, []);

  // the corner buttons show on mouse move and fade after 2.5 s
  useEffect(() => {
    let t: any; const show = () => { setHud(true); clearTimeout(t); t = setTimeout(() => setHud(false), 2500); };
    const fromGame = (e: MessageEvent) => { if (e.data?.source === "pokepc" && e.data.type === "pointer") show(); };
    show(); addEventListener("pointermove", show); addEventListener("message", fromGame);
    return () => { removeEventListener("pointermove", show); removeEventListener("message", fromGame); clearTimeout(t); };
  }, []);
  useEffect(() => { const f = () => setFull(!!document.fullscreenElement); document.addEventListener("fullscreenchange", f); return () => document.removeEventListener("fullscreenchange", f); }, []);
  const toggleFull = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else document.documentElement.requestFullscreen().catch(() => {}); };
  const toggleMute = (m: boolean) => { setMuted(m); sync()?.setVolume(m ? 0 : 1); };

  useNavEvent("nav:menu", () => (overlay ? closeOverlay() : openOverlay()), [overlay]);
  useNavEvent("nav:back", () => { if (overlay && !exiting && !conflict && !error) closeOverlay(); }, [overlay, exiting, conflict, error]);

  async function exit(withSave: boolean) {
    if (withSave) {
      setExiting("Saving to cloud…");
      const r = await sync()?.save("manual");
      if (r?.conflict || r?.error) { setExiting(null); return; }
      sfx("saved"); setExiting("Saved. Exiting…");
      await new Promise((res) => setTimeout(res, 600));
    }
    leaving.current = true;
    router.push(runId ? `/?game=${id}&tab=runs` : "/");
  }

  const s = status;
  const failing = !!saveErr && !s?.saving;
  const syncText = !s?.running ? "Starting…" : s.blocked ? "Sync paused" : s.saving ? "Saving…" : failing ? "Cloud unreachable, retrying" : `Saved ${ago(s.lastSyncAt)}`;
  const inGame = !overlay && !boot && !conflict && !error;
  const have = ach.current.have ?? {};
  const recent = set ? set.filter((x) => have[x.id]).sort((a, b) => have[b.id] - have[a.id]).slice(0, 5) : [];
  const achPts = set ? set.filter((x) => have[x.id]).reduce((n, x) => n + x.points, 0) : 0;
  const achPct = set?.length ? achCount / set.length : 0;
  const session = Math.round((Date.now() - sessionStart.current) / 60000);

  return (
    <main className="playview" style={{ ["--tint" as any]: tint(rom) }} {...(inGame ? { "data-nav-off": "" } : {})}>
      {runReady && <iframe ref={frame} src={`/player.html?id=${encodeURIComponent(id)}${runId ? `&run=${runId}` : ""}`} title="emulator" allow="autoplay; fullscreen; gamepad" />}

      {/* corner HUD: a menu button that only shows when you move the mouse, and a tiny sync mark */}
      <div className={`hud ${hud && inGame ? "show" : ""}`}>
        <button className="hud-btn" onClick={() => openOverlay()} aria-label="Menu (Esc)" title="Menu · Esc"><Icon name="menu" size={20} /></button>
        {run.meta && <button className={`hud-btn ${board ? "on" : ""}`} onClick={() => { setBoard((b) => !b); sfx("tab"); }} aria-label="Playthrough board" title={`${MODE_LABEL[run.meta.mode]} board`}><Icon name={run.meta.mode === "soullink" ? "link" : run.meta.mode === "nuzlocke" ? "flame" : "layers"} size={20} /></button>}
      </div>
      {inGame && (s?.saving || failing || s?.blocked) && (
        <span className={`sync-dot ${failing || s?.blocked ? "warn" : ""}`} title={syncText} aria-label={syncText}>
          <Icon name={failing || s?.blocked ? "wifioff" : "sync"} size={14} className={s?.saving ? "spin" : ""} />
        </span>
      )}
      {run.meta && board && inGame && (
        <aside className="run-side"><button className="run-side-x" aria-label="Close board" onClick={() => { setBoard(false); frame.current?.focus(); }}><Icon name="close" size={18} /></button><RunBoard run={run} compact /></aside>
      )}

      {boot && (
        <div className="launch">
          <div className="wash" aria-hidden><i /><i /></div>
          <div className="launch-card">
            {rom && <div className="launch-cap"><Art rom={rom} /></div>}
            <h1>{rom?.title ?? "Launching"}</h1>
            {run.meta && <p className="launch-run"><span className={`pill mode-${run.meta.mode}`}>{MODE_LABEL[run.meta.mode]}</span> {run.meta.name}</p>}
            <p>{boot.label}…</p>
            <div className="bar wide"><i style={{ width: `${boot.pct * 100}%` }} /></div>
            <small>First launch downloads the ROM · after that it&apos;s cached on this device</small>
          </div>
        </div>
      )}

      {overlay && (
        <div className="pause" data-nav-scope onClick={(e) => e.target === e.currentTarget && closeOverlay()}>
          <div className="pause-top">
            <span className="pause-title"><b>{rom?.title}</b>{run.meta && <span className={`pill mode-${run.meta.mode}`}>{MODE_LABEL[run.meta.mode]}{run.meta.name ? ` · ${run.meta.name}` : ""}</span>}</span>
            <span className="pause-meta"><span className={`pause-sync ${failing || s?.blocked ? "warn" : ""}`}><Icon name={s?.saving ? "sync" : failing ? "wifioff" : "cloudok"} size={16} className={s?.saving ? "spin" : ""} />{syncText}</span><Clock /></span>
          </div>
          {exiting ? <div className="pause-exiting"><Icon name="sync" size={30} className="spin" />{exiting}</div> : (
            <div className="pause-grid">
              <nav className="pause-menu">
                <button data-nav data-autofocus className="pm-item primary" onClick={closeOverlay}><Icon name="play" size={24} />Resume</button>
                <button data-nav className="pm-item" onClick={async () => { const r = await sync()?.save("manual"); if (r?.unchanged) toasts.push({ title: "Already up to date", icon: "cloudok" }, 1600); }}><Icon name="cloudup" size={24} />Save now</button>
                <div className="pm-sep" />
                <button data-nav className={`pm-item ${pane === "game" ? "on" : ""}`} onFocus={() => setPane("game")} onClick={() => setPane("game")}><Icon name="info" size={24} />Overview</button>
                {run.meta && <button data-nav className={`pm-item ${pane === "run" ? "on" : ""}`} onFocus={() => setPane("run")} onClick={() => setPane("run")}><Icon name={run.meta.mode === "soullink" ? "link" : "flame"} size={24} />Playthrough</button>}
                {set && <button data-nav className={`pm-item ${pane === "ach" ? "on" : ""}`} onFocus={() => setPane("ach")} onClick={() => setPane("ach")}><Icon name="star" size={24} />Achievements<span className="pm-count">{achCount}/{set.length}</span></button>}
                <div className="pm-sep" />
                <div className="pm-row"><span><Icon name="sound" size={22} />Sound</span><Toggle label="Sound" on={!muted} onChange={(v) => toggleMute(!v)} /></div>
                <button data-nav className="pm-item" onClick={toggleFull}><Icon name="layers" size={24} />{full ? "Exit full screen" : "Full screen"}</button>
                <div className="pm-sep" />
                <button data-nav className="pm-item" onClick={() => exit(true)}><Icon name="home" size={24} />Save &amp; quit</button>
                <button data-nav className="pm-item danger" onClick={() => exit(false)}><Icon name="power" size={24} />Quit without saving</button>
              </nav>

              <section className="pause-pane">
                {pane === "game" && (
                  <div className="pp-game">
                    {rom && <div className="pp-art"><Art rom={rom} prefer="shot" label={false} /></div>}
                    <div className="pp-stats">
                      <div><small>This session</small><b>{session < 1 ? "just started" : `${session} min`}</b></div>
                      <div><small>Total play time</small><b>{playtime((rom?.playSeconds ?? 0) + session * 60)} h</b></div>
                      <div><small>System</small><b>{rom && SYSTEMS[rom.system].label}</b></div>
                      {set && <div><small>Achievements</small><b>{Math.round(achPct * 100)}%</b></div>}
                    </div>
                    {failing && <p className="pp-warn"><Icon name="wifioff" size={18} />The last autosave couldn&apos;t reach the cloud ({saveErr}). It retries on its own; nothing is lost while the game keeps running.</p>}
                    <p className="pp-note">Autosaves every {rom?.system === "nds" ? "90" : "45"} s and when you leave this tab. Esc or F1 opens this menu.</p>
                  </div>
                )}
                {pane === "run" && run.meta && <RunBoard run={run} compact />}
                {pane === "ach" && set && (
                  <div className="pp-ach">
                    <div className="pp-ring" style={{ ["--p" as any]: achPct }}><b>{achCount}</b><small>of {set.length}</small></div>
                    <div className="pp-ach-side">
                      <p><b>{achPts}</b> points · <span className={reader?.tracking ? "ok" : "dim"}>{reader?.tracking ? "tracking live" : reader?.note ?? "starting"}</span></p>
                      <h4>Recently unlocked</h4>
                      {recent.length ? recent.map((x) => <div key={x.id} className="pp-ach-row"><Icon name="star" size={18} /><span><b>{x.title}</b><small>{x.desc}</small></span><em>+{x.points}</em></div>) : <p className="dim small">Nothing yet this game.</p>}
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      )}

      {conflict && (
        <Modal title="Newer save found" onClose={() => {}} actions={[
          { label: "Load newer save", primary: true, onClick: async () => { setConflict(null); await sync()?.pullLatest(); sync()?.play(); frame.current?.focus(); } },
          { label: "Keep my progress", onClick: async () => { setConflict(null); await sync()?.forceSave(); sync()?.play(); frame.current?.focus(); } },
        ]}>
          <p><b>{conflict.device}</b> saved this game {ago(conflict.updatedAt)}, after this session started.</p>
          <p className="dim">Whichever you don&apos;t pick stays in Cloud Saves on the game page.</p>
        </Modal>
      )}
      {error && (
        <Modal title="Something went wrong" onClose={() => !error.fatal && setError(null)} actions={[
          ...(error.fatal ? [] : [{ label: "OK", primary: true, onClick: () => setError(null) }]),
          { label: "Back to Home", primary: !!error.fatal, onClick: () => { leaving.current = true; router.push("/"); } },
        ]}><p>{error.message}</p></Modal>
      )}

      {(overlay || boot) && <BottomBar onMenu={overlay ? closeOverlay : undefined} hints={[{ ...H.back, label: overlay ? "Resume" : "Back" }, H.select]} />}
      <div className={inGame ? "toasts-game" : ""}><Toasts items={toasts.items} /></div>
    </main>
  );
}
