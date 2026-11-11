"use client";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RomView, SaveVersion } from "../../../lib/games";
import { SYSTEMS } from "../../../lib/games";
import { ago, playtime } from "../../../lib/client";
import Art, { tint } from "../../../components/Art";
import Icon from "../../../components/Icon";
import { BottomBar, Clock, H, Modal, Toasts, usePresence, useToasts } from "../../../components/Shell";
import { focusFirst, useNavEvent } from "../../../components/nav";
import { sfx } from "../../../components/sfx";

type Status = { running: boolean; saving: boolean; paused: boolean; lastSyncAt: number; blocked: boolean; dirty: boolean };
type Sync = { save: (r?: string) => Promise<any>; forceSave: () => Promise<any>; pullLatest: (v?: string) => Promise<boolean>; status: () => Status; pause: () => void; play: () => void };

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
  const [chip, setChip] = useState(true);
  const toasts = useToasts();
  usePresence(rom?.title);
  const leaving = useRef(false);
  const sync = () => (frame.current?.contentWindow as any)?.pokeSync as Sync | undefined;

  const openOverlay = useCallback(() => { sync()?.pause(); setOverlay(true); setTimeout(() => focusFirst(".overlay-menu [data-autofocus]"), 40); }, []);
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
        case "saved": if (d.reason !== "auto" && d.reason !== "leave") { sfx("saved"); toasts.push({ title: "Saved to cloud", icon: "cloudok" }, 2000); } break;
        case "conflict": sync()?.pause(); setConflict(d.current); break;
        case "error": setError({ message: d.message, fatal: d.fatal }); break;
        case "menu": openOverlay(); break;
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

  // status chip shows on mouse move, hides after 2.5s
  useEffect(() => {
    let t: any; const show = () => { setChip(true); clearTimeout(t); t = setTimeout(() => setChip(false), 2500); };
    show(); addEventListener("pointermove", show);
    return () => { removeEventListener("pointermove", show); clearTimeout(t); };
  }, []);

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
    router.push("/");
  }

  const s = status;
  const syncText = !s?.running ? "Starting…" : s.blocked ? "Sync paused" : s.saving ? "Saving…" : `Saved ${ago(s.lastSyncAt)}`;
  const inGame = !overlay && !boot && !conflict && !error;

  return (
    <main className="playview" style={{ ["--tint" as any]: tint(rom) }} {...(inGame ? { "data-nav-off": "" } : {})}>
      <iframe ref={frame} src={`/player.html?id=${encodeURIComponent(id)}`} title="emulator" allow="autoplay; fullscreen; gamepad" />

      <button className={`status-chip px-frame ${chip || s?.saving ? "show" : ""}`} onClick={openOverlay}>
        <Icon name="home" size={18} /><span>Menu</span><i />
        <Icon name={s?.saving ? "sync" : "cloudok"} size={18} className={s?.saving ? "spin" : "ok"} /><span>{syncText}</span>
      </button>

      {boot && (
        <div className="launch">
          <div className="wash" aria-hidden><i /><i /></div>
          <div className="launch-card">
            {rom && <div className="launch-cap"><Art rom={rom} /></div>}
            <h1>{rom?.title ?? "Launching"}</h1>
            <p>{boot.label}…</p>
            <div className="bar wide"><i style={{ width: `${boot.pct * 100}%` }} /></div>
            <small>First launch downloads the ROM · after that it&apos;s cached on this device</small>
          </div>
        </div>
      )}

      {overlay && (
        <div className="scrim left" data-nav-scope onClick={(e) => e.target === e.currentTarget && closeOverlay()}>
          <nav className="drawer overlay-menu">
            <div className="ov-head">
              {rom && <div className="ov-art"><Art rom={rom} prefer="shot" label={false} /></div>}
              <strong>{rom?.title}</strong>
              <span>{rom && SYSTEMS[rom.system].label} · <Clock /></span>
              <span className={`ov-sync ${s?.blocked ? "warn" : ""}`}><Icon name={s?.saving ? "sync" : "cloudok"} size={18} />{syncText}</span>
            </div>
            {exiting ? <div className="ov-exiting"><Icon name="sync" size={28} className="spin" />{exiting}</div> : (
              <>
                <button data-nav data-autofocus className="drawer-item" onClick={closeOverlay}><Icon name="play" size={26} />Resume game</button>
                <button data-nav className="drawer-item" onClick={async () => { const r = await sync()?.save("manual"); if (r?.unchanged) toasts.push({ title: "Already up to date", icon: "cloudok" }, 1600); }}><Icon name="cloudup" size={26} />Save to cloud</button>
                <div className="drawer-sep" />
                <button data-nav className="drawer-item" onClick={() => exit(true)}><Icon name="home" size={26} />Save &amp; quit</button>
                <button data-nav className="drawer-item danger" onClick={() => exit(false)}><Icon name="power" size={26} />Quit without saving</button>
                <p className="ov-note">Autosaves every 45 s and whenever you leave this tab.{rom?.playSeconds ? ` Total ${playtime(rom.playSeconds)} hrs.` : ""}</p>
              </>
            )}
          </nav>
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
      <Toasts items={toasts.items} />
    </main>
  );
}
