"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RomView, SYSTEMS, System, systemFromFilename } from "../lib/games";
import { ago, api, playtime, putWithProgress } from "../lib/client";
import Art from "../components/Art";
import Icon from "../components/Icon";
import { BottomBar, H, QuickMenu, TopBar, Toasts, useToasts, type MenuAnchor } from "../components/Shell";
import { focusFirst, navigate, useNavEvent } from "../components/nav";
import { sfx } from "../components/sfx";
import GamePage from "../components/GamePage";
import Search from "../components/Search";
import Carousel from "../components/Carousel";
import { useArtColor } from "../lib/artColor";
import { useMe } from "../components/Shell";
import { AddView, LibraryView, SettingsView, TimelineView, type TimelineItem } from "../components/Views";

export type View = "home" | "library" | "timeline" | "add" | "settings";

export default function Home() {
  const router = useRouter();
  const [roms, setRoms] = useState<RomView[] | null>(null);
  const [focused, setFocused] = useState<RomView | null>(null);
  const [view, setView] = useState<View>("home");
  const [open, setOpen] = useState<RomView | null>(null);
  const [openTab, setOpenTab] = useState<"runs" | undefined>();
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const [search, setSearch] = useState(false);
  const [timeline, setTimeline] = useState<TimelineItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const toasts = useToasts();
  const fileInput = useRef<HTMLInputElement>(null);
  const lastHomeFocus = useRef<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [settingsSec, setSettingsSec] = useState("profile");
  const [holding, setHolding] = useState(false);
  const homeRef = useRef<HTMLElement>(null);
  const me = useMe();
  const tintColor = useArtColor(view === "home" ? focused : null);

  const load = useCallback(async () => {
    const r = await api<{ roms: RomView[] }>("/api/roms");
    setRoms(r.roms);
    return r.roms;
  }, []);
  const loadTimeline = useCallback(() => api<{ items: TimelineItem[] }>("/api/timeline").then((r) => setTimeline(r.items)).catch(() => setTimeline([])), []);

  useEffect(() => {
    load().then((list) => {
      setFocused(list[0] ?? null); setTimeout(() => focusFirst(".carousel [data-nav]"), 80);
      // back from a playthrough → reopen that game's Playthroughs tab
      const q = new URLSearchParams(location.search), g = list.find((r) => r.id === q.get("game"));
      if (g) { setOpenTab(q.get("tab") === "runs" ? "runs" : undefined); setOpen(g); history.replaceState(null, "", "/"); }
    })
      .catch((e) => toasts.push({ title: "Couldn't reach your PC", text: e.message, error: true, icon: "wifioff" }));
    loadTimeline();
    api<{ invites: { name: string; region: string; players: { uid: string; name: string }[]; owner: string }[] }>("/api/runs").then((r) => {
      for (const i of r.invites) toasts.push({ title: `${i.players.find((p) => p.uid === i.owner)?.name ?? "A friend"} invited you to a Soul Link`, text: `Open a game of the same region → Playthroughs to join "${i.name}"`, icon: "link" }, 9000);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (v: View) => {
    if (view === "home" && document.activeElement instanceof HTMLElement) lastHomeFocus.current = document.activeElement.dataset.rom ?? null;
    setView(v); sfx("open");
    setTimeout(() => {
      if (v === "home") focusFirst(lastHomeFocus.current ? `[data-rom="${lastHomeFocus.current}"]` : ".carousel [data-nav]");
      else focusFirst(".view [data-autofocus], .view [data-nav]");
    }, 60);
  };

  // ---- controller bindings ----
  const overlayOpen = !!(open || menu || search);
  useNavEvent("nav:back", () => { if (!overlayOpen && view !== "home") go("home"); }, [overlayOpen, view]);
  useNavEvent("nav:menu", () => { if (!open && !search) setMenu((m) => (m ? null : "bottom")); }, [open, search]);

  // Hold ↓ on the game row → All Games. A short tap still moves down to the dock as usual;
  // holding never lets the cursor drop into the dock — the cue fills up instead and opens the library.
  const TAP_MS = 200, HOLD_MS = 700;
  const hold = useRef<{ start: number; key: boolean; raf: number; dir: "up" | "down" } | null>(null);
  const keyDown = useRef(false);
  useEffect(() => {
    const kd = (e: KeyboardEvent) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") keyDown.current = true; };
    const ku = (e: KeyboardEvent) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") keyDown.current = false; };
    const padDown = () => Array.from(navigator.getGamepads?.() ?? []).some((p) => p && (p.buttons[13]?.pressed || p.buttons[12]?.pressed || Math.abs(p.axes[1] ?? 0) > 0.6));
    const setP = (v: number) => homeRef.current?.style.setProperty("--hold", v.toFixed(3));
    const end = () => { if (hold.current) cancelAnimationFrame(hold.current.raf); hold.current = null; setHolding(false); setP(0); };
    const tick = () => {
      const h = hold.current; if (!h) return;
      const t = performance.now() - h.start;
      if (!(h.key ? keyDown.current : padDown())) { end(); if (t < TAP_MS) navigate(h.dir, true); return; } // released → it was a tap
      if (t > TAP_MS) { setHolding(true); setP(Math.min(1, (t - TAP_MS) / (HOLD_MS - TAP_MS))); }
      if (t >= HOLD_MS) { const d = h.dir; end(); go(d === "up" ? "home" : "library"); return; }
      h.raf = requestAnimationFrame(tick);
    };
    const onMove = (e: Event) => {
      const { dir, from } = (e as CustomEvent).detail as { dir: string; from: HTMLElement | null };
      if (overlayOpen) return;
      const down = view === "home" && dir === "down" && !!from?.closest(".carousel");
      // All Games: hold ↑ on the top row to go back to the recent games (a tap still moves up as usual)
      const first = document.querySelector<HTMLElement>(".cardgrid .card");
      const up = view === "library" && dir === "up" && !!from?.closest(".cardgrid") && !!first && from!.offsetTop <= first.offsetTop + 4;
      if (!down && !up) return;
      e.preventDefault();                 // key-repeat / pad-repeat while holding lands here too
      if (hold.current) return;
      hold.current = { start: performance.now(), key: keyDown.current, raf: 0, dir: up ? "up" : "down" };
      hold.current.raf = requestAnimationFrame(tick);
    };
    addEventListener("keydown", kd, true); addEventListener("keyup", ku, true); addEventListener("nav:move", onMove);
    return () => { removeEventListener("keydown", kd, true); removeEventListener("keyup", ku, true); removeEventListener("nav:move", onMove); end(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, overlayOpen]);
  useNavEvent("nav:options", () => {
    if (overlayOpen) return;
    const id = (document.activeElement as HTMLElement | null)?.dataset.rom;
    const r = roms?.find((x) => x.id === id);
    if (r) { sfx("open"); setOpen(r); }
  }, [overlayOpen, roms]);

  // ---- upload ("add game") ----
  async function addGame(file: File) {
    if (!systemFromFilename(file.name)) { sfx("error"); toasts.push({ title: "Not a supported game file", text: "Use .gb, .gbc, .gba or .nds", error: true, icon: "info" }); return; }
    setBusy(true);
    const t = toasts.push({ title: "Adding game…", text: file.name, progress: 0, icon: "cloudup" }, 0);
    try {
      const { id, uploadUrl } = await api<{ id: string; uploadUrl: string }>("/api/roms", { method: "POST", body: JSON.stringify({ filename: file.name, size: file.size }) });
      await putWithProgress(uploadUrl, file, (p) => t.update({ progress: p }));
      t.update({ title: "Identifying cartridge…", progress: undefined, icon: "cart" });
      await api(`/api/roms/${id}`, { method: "POST", body: JSON.stringify({ action: "commit", filename: file.name, size: file.size }) });
      const list = await load();
      const added = list.find((r) => r.id === id);
      t.update({ title: "Ready to play", text: added ? `${added.title}${added.coverSource === "auto" ? " · cover found" : ""}` : undefined, icon: "cloudok" });
      sfx("saved"); t.close(3000);
    } catch (e: any) {
      sfx("error");
      t.update({ title: "Couldn't add game", text: e.message, progress: undefined, error: true, icon: "info" }); t.close(6000);
    } finally { setBusy(false); }
  }

  useEffect(() => {
    let depth = 0;
    const has = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const over = (e: DragEvent) => has(e) && e.preventDefault();
    const enter = (e: DragEvent) => { if (has(e)) { depth++; setDragging(true); } };
    const leave = () => { depth = Math.max(0, depth - 1); if (!depth) setDragging(false); };
    const drop = (e: DragEvent) => { e.preventDefault(); depth = 0; setDragging(false); Array.from(e.dataTransfer?.files ?? []).forEach(addGame); };
    addEventListener("dragover", over); addEventListener("dragenter", enter); addEventListener("dragleave", leave); addEventListener("drop", drop);
    return () => { removeEventListener("dragover", over); removeEventListener("dragenter", enter); removeEventListener("dragleave", leave); removeEventListener("drop", drop); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const play = (r: RomView, run?: string) => { sfx("open"); router.push(`/play/${r.id}${run ? `?run=${run}` : ""}`); };
  const pick = addGame;
  const recent = roms?.slice(0, 10) ?? [];
  const dock: { icon: string; label: string; onClick: () => void; color: string }[] = [
    { icon: "grid", label: "Library", onClick: () => go("library"), color: "#3a8dff" },
    { icon: "clock", label: "Save Timeline", onClick: () => go("timeline"), color: "#9b5cf6" },
    { icon: "plus", label: "Add Games", onClick: () => go("add"), color: "#16b26a" },
    { icon: "search", label: "Search", onClick: () => setSearch(true), color: "#f59e0b" },
    { icon: "gear", label: "Settings", onClick: () => { setSettingsSec("profile"); go("settings"); }, color: "#64748b" },
  ];
  const [dockFocus, setDockFocus] = useState<string | null>(null);

  return (
    <main ref={homeRef} className={`home ${holding ? "holding" : ""} v-${view}`} style={{ ["--tint" as any]: tintColor }}>
      <div className="wash live" aria-hidden><i /><i /><i /></div>
      <TopBar busy={busy} onProfile={() => { sfx("open"); setMenu("top"); }} onSearch={() => setSearch(true)} />

      {view === "home" && (
        <section className="homeview">
          <Carousel count={(roms?.length ? recent.length : 0) + 1} index={idx}
            onStep={(d) => (document.querySelectorAll<HTMLElement>(".carousel .track > [data-nav]")[idx + d])?.focus({ preventScroll: true })}>
            {roms === null && Array.from({ length: 5 }, (_, i) => <div key={i} className={`tile skeleton ${i === 0 ? "on" : ""}`} />)}
            {recent.map((r, i) => (
              <button key={r.id} data-nav data-rom={r.id} className={`tile ${idx === i && focused?.id === r.id ? "on" : ""}`}
                onFocus={() => { setFocused(r); setIdx(i); setDockFocus(null); }} onClick={() => (focused?.id === r.id ? play(r) : setFocused(r))}
                onContextMenu={(e) => { e.preventDefault(); setOpen(r); }} aria-label={r.title}>
                <Art rom={r} />
                {r.lastPlayedAt && <span className="tile-badge"><Icon name="cloudok" size={18} /></span>}
              </button>
            ))}
            {roms !== null && (
              <button data-nav className={`tile more ${idx === recent.length && !focused ? "on" : ""}`} onFocus={() => { setFocused(null); setIdx(recent.length); setDockFocus("All Games"); }} onClick={() => go("library")}>
                <span className="more-icon"><Icon name="grid" size={36} /></span>
                <span>All Games</span>
                <small>{roms.length}</small>
              </button>
            )}
          </Carousel>
          {/* hold-↓ cue: no container — text that fills as you hold, with cascading chevrons */}
          <div className="downhint" aria-hidden={!holding}>
            <span className="chevrons"><i /><i /><i /></span>
            <span className="downhint-text" data-text="All Games">All Games</span>
          </div>

          <div className="home-foot">
            <div className="dock">
              {dock.map((d) => (
                <button key={d.label} data-nav className="dock-btn" style={{ ["--c" as any]: d.color }} aria-label={d.label}
                  onFocus={() => setDockFocus(d.label)} onBlur={() => setDockFocus(null)} onClick={d.onClick}>
                  <Icon name={d.icon} size={30} stroke={2.2} />
                </button>
              ))}
            </div>
            <div className="caption">
              {dockFocus === "All Games" ? (
                <><h1>All Games</h1><div className="caption-hints"><button className="hint" onClick={() => go("library")}><kbd className="key">Enter</kbd><span className="glyph">A</span>Open</button><span className="caption-meta">{roms?.length ?? 0} in your library</span></div></>
              ) : dockFocus ? <><h1>{dockFocus}</h1><div className="caption-hints" /></> : focused ? (
                <>
                  <h1>{focused.title}</h1>
                  <div className="caption-hints">
                    <button className="hint" onClick={() => play(focused)}><kbd className="key">Enter</kbd><span className="glyph">A</span>Start</button>
                    <button className="hint" onClick={() => setOpen(focused)}><kbd className="key">O</kbd><span className="glyph">+</span>Options</button>
                    <span className="caption-meta">{focused.lastPlayedAt ? `Played ${ago(focused.lastPlayedAt)} · ${playtime(focused.playSeconds)} hrs` : SYSTEMS[focused.system].label}</span>
                  </div>
                </>
              ) : roms?.length === 0 ? (
                <><h1>No games yet</h1><div className="caption-hints"><span className="caption-meta">Drop a .gb / .gbc / .gba / .nds file anywhere</span></div></>
              ) : null}
            </div>
          </div>
        </section>
      )}

      {view === "library" && (
        <div className="uphint" aria-hidden={!holding}>
          <span className="downhint-text" data-text="Recent Games">Recent Games</span>
          <span className="chevrons up"><i /><i /><i /></span>
        </div>
      )}
      {view === "library" && <LibraryView roms={roms ?? []} onBack={() => go("home")} onOpen={(r) => { sfx("open"); setOpen(r); }} />}
      {view === "timeline" && <TimelineView items={timeline} roms={roms ?? []} onBack={() => go("home")} onOpen={(id) => { const r = roms?.find((x) => x.id === id); if (r) setOpen(r); }} />}
      {view === "add" && <AddView roms={roms ?? []} onBack={() => go("home")} onPick={() => fileInput.current?.click()} />}
      {view === "settings" && <SettingsView roms={roms ?? []} timeline={timeline ?? []} section={settingsSec} onBack={() => go("home")} onChanged={load} toast={toasts.push} />}

      <input ref={fileInput} type="file" multiple accept=".gb,.gbc,.gba,.nds" hidden onChange={(e) => { Array.from(e.target.files ?? []).forEach(pick); e.target.value = ""; }} />

      <BottomBar onMenu={() => { sfx("open"); setMenu("bottom"); }} hints={view === "home" ? [H.options, H.start] : [H.back, H.select]} />

      {dragging && <div className="scrim drop"><div className="dropzone big"><Icon name="plus" size={56} /><strong>Drop to add</strong></div></div>}

      {open && (
        <GamePage rom={open} onClose={() => { const id = open.id; setOpen(null); setOpenTab(undefined); setTimeout(() => focusFirst(`[data-rom="${id}"]`), 40); }}
          onPlay={(run) => play(open, run)} toast={toasts.push} initialTab={openTab}
          onChanged={async (deleted) => {
            const list = await load(); loadTimeline();
            if (deleted) { setOpen(null); setFocused(list[0] ?? null); setTimeout(() => focusFirst(".view [data-nav], .carousel [data-nav]"), 50); }
            else setOpen(list.find((r) => r.id === open.id) ?? null);
          }} />
      )}
      {search && roms && <Search roms={roms} onClose={() => setSearch(false)} onPick={(r) => { setSearch(false); setOpen(r); }} />}
      {menu && <QuickMenu key={menu} anchor={menu} onAnchor={setMenu} onClose={() => setMenu(null)} onHome={view !== "home" ? () => go("home") : undefined}
        onProfile={(sec) => { setSettingsSec(sec ?? "profile"); go("settings"); }} />}
      <Toasts items={toasts.items} />
    </main>
  );
}
