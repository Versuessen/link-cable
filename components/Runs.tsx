"use client";
import { useCallback, useEffect, useState } from "react";
import type { RomView } from "../lib/games";
import { gameFor } from "../lib/achievements";
import { api, ago } from "../lib/client";
import { DEFAULT_RULES, REGION, REGION_LABEL, randomizerSupported, type Mode, type RandomOpts, type Rules, type RunMeta } from "../lib/runs";
import Icon from "./Icon";
import { Modal, Toggle, useMe, usePresence, type Push } from "./Shell";
import { MODE_LABEL, RunBoard, useRun } from "./RunBoard";
import { sfx } from "./sfx";

const MODE_INFO: Record<Mode, string> = {
  normal: "A separate save slot. Your main save stays untouched.",
  nuzlocke: "Only the first encounter in each area counts. A Pokémon that faints is gone for good. Tracked live while you play.",
  soullink: "A Nuzlocke with friends. Catches from the same area are linked: if one faints, its partner is lost too.",
};
const RULE_INFO: [keyof Rules, string, string][] = [
  ["dupes", "Dupes clause", "Already-caught species don't use up an area"],
  ["shiny", "Shiny clause", "Shinies can always be caught"],
  ["levelCaps", "Level caps", "Warn when the team is above the next Gym Leader's ace"],
  ["typeClause", "Type clause", "Soul Link: linked pairs may not share a primary type"],
];

/** The game page's Playthroughs tab: the main save, every run of this game, invitations, and "New playthrough". */
export function RunsTab({ rom, onPlay, toast }: { rom: RomView; onPlay: (runId?: string) => void; toast: Push }) {
  const me = useMe();
  const game = gameFor(rom);
  const region = game ? REGION[game.version] ?? "" : "";
  const [list, setList] = useState<{ runs: RunMeta[]; invites: RunMeta[] } | null>(null);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => api<{ runs: RunMeta[]; invites: RunMeta[] }>("/api/runs").then(setList).catch(() => setList({ runs: [], invites: [] })), []);
  useEffect(() => { load(); }, [load]);

  const mine = (list?.runs ?? []).filter((r) => r.players.some((p) => p.uid === me?.id && p.romId === rom.id)).sort((a, b) => b.createdAt - a.createdAt);
  const invites = (list?.invites ?? []).filter((r) => r.region && r.region === region);
  if (open) return <RunDetail runId={open} onBack={() => { setOpen(null); load(); }} onPlay={() => onPlay(open)} toast={toast} />;

  return (
    <div className="runs">
      {invites.map((r) => (
        <div key={r.id} className="run-invite">
          <Icon name="link" size={26} />
          <span><b>{r.players.find((p) => p.uid === r.owner)?.name} invited you to a Soul Link</b><small>{r.name} · {REGION_LABEL[r.region]}{r.random ? " · randomized" : ""}</small></span>
          <button data-nav className="btn small primary" onClick={async () => { await api(`/api/runs/${r.id}`, { method: "POST", body: JSON.stringify({ action: "join", romId: rom.id }) }); sfx("saved"); toast({ title: "Joined the Soul Link", text: `Playing with ${rom.title}`, icon: "link" }); load(); }}>Join with this game</button>
          <button data-nav className="btn small" onClick={async () => { await api(`/api/runs/${r.id}`, { method: "POST", body: JSON.stringify({ action: "decline" }) }); load(); }}>Decline</button>
        </div>
      ))}
      <div className="runlist">
        <button data-nav className="runcard main" onClick={() => onPlay()}>
          <span className="runcard-mode"><Icon name="cloud" size={22} />Main save</span>
          <b>{rom.title}</b><small>{rom.lastPlayedAt ? `Played ${ago(rom.lastPlayedAt)}` : "Not started"}</small>
        </button>
        {mine.map((r) => (
          <button key={r.id} data-nav className={`runcard mode-${r.mode} ${r.status}`} onClick={() => { setOpen(r.id); sfx("open"); }}>
            <span className="runcard-mode"><Icon name={r.mode === "soullink" ? "link" : r.mode === "nuzlocke" ? "flame" : "layers"} size={22} />{MODE_LABEL[r.mode]}{r.random ? " · Random" : ""}</span>
            <b>{r.name}</b>
            <small>{r.status === "active" ? `Started ${ago(r.createdAt)}` : r.status === "won" ? "Won 🏆" : "Lost"}{r.players.length > 1 ? ` · with ${r.players.filter((p) => p.uid !== me?.id).map((p) => p.name + (p.joined ? "" : " (invited)")).join(", ")}` : ""}</small>
          </button>
        ))}
        <button data-nav className="runcard new" onClick={() => { setCreating(true); sfx("open"); }}><Icon name="plus" size={30} /><b>New playthrough</b><small>{game ? "Normal, Nuzlocke or Soul Link" : "A separate save slot"}</small></button>
      </div>
      {list === null && <p className="dim small">Loading…</p>}
      {creating && <NewRunModal rom={rom} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); load(); setOpen(id); }} toast={toast} />}
    </div>
  );
}

function RunDetail({ runId, onBack, onPlay, toast }: { runId: string; onBack: () => void; onPlay: () => void; toast: Push }) {
  const run = useRun(runId, { poll: 8000 });
  const [confirm, setConfirm] = useState<null | "delete" | "leave" | "won" | "lost">(null);
  const m = run.meta;
  const owner = m?.owner === run.me?.id;
  return (
    <div className="rundetail">
      <div className="rundetail-head">
        <button data-nav className="btn small" onClick={onBack}><Icon name="back" size={18} />All playthroughs</button>
        <h3>{m?.name ?? "…"}</h3>
        {m && <span className="rundetail-actions">
          {m.status === "active" ? <>
            <button data-nav className="btn small" onClick={() => setConfirm("won")}>Mark won</button>
            {m.mode !== "normal" && <button data-nav className="btn small" onClick={() => setConfirm("lost")}>Mark lost</button>}
          </> : <button data-nav className="btn small" onClick={async () => { await run.action({ action: "reopen" }); sfx("tab"); }}>Reopen</button>}
          {owner ? <button data-nav className="btn small danger" onClick={() => setConfirm("delete")}>Delete</button> : <button data-nav className="btn small danger" onClick={() => setConfirm("leave")}>Leave</button>}
        </span>}
      </div>
      <RunBoard run={run} onPlay={m?.status === "active" && m.players.some((p) => p.uid === run.me?.id && p.joined) ? onPlay : undefined} />
      {confirm && m && (
        <Modal title={confirm === "delete" ? "Delete this playthrough?" : confirm === "leave" ? "Leave this playthrough?" : confirm === "won" ? "Mark as won?" : "End this run?"} onClose={() => setConfirm(null)} actions={[
          { label: "Cancel", onClick: () => setConfirm(null) },
          { label: confirm === "delete" ? "Delete" : confirm === "leave" ? "Leave" : confirm === "won" ? "We won!" : "End run", primary: confirm === "won", danger: confirm !== "won", onClick: async () => {
            const c = confirm; setConfirm(null);
            if (c === "delete" || c === "leave") { await run.action({ action: c }); toast({ title: c === "delete" ? "Playthrough deleted" : "Left the playthrough", icon: "trash" }); onBack(); }
            else { await run.action({ action: "end", result: c }); sfx(c === "won" ? "saved" : "back"); }
          } },
        ]}>
          {confirm === "delete" && <p>The run, its saves{m.players.length > 1 ? " and everyone's tracker" : ""} are removed. Your main save isn&apos;t affected.</p>}
          {confirm === "leave" && <p>You stop taking part. Your saves for it are removed.</p>}
          {confirm === "won" && <p>Congratulations! The run is closed and kept as a record. You can reopen it any time.</p>}
          {confirm === "lost" && <p>The run is closed and kept as a record{m.players.length > 1 ? " for everyone" : ""}. You can reopen it.</p>}
        </Modal>
      )}
    </div>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="seg small">{options.map(([v, l]) => <button key={v} data-nav className={value === v ? "on" : ""} onClick={() => { onChange(v); sfx("tab"); }}>{l}</button>)}</div>;
}

function NewRunModal({ rom, onClose, onCreated, toast }: { rom: RomView; onClose: () => void; onCreated: (id: string) => void; toast: Push }) {
  const game = gameFor(rom);
  const me = useMe();
  const pres = usePresence();
  const friends = (pres?.users ?? []).filter((u) => u.id !== me?.id);
  const [mode, setMode] = useState<Mode>(game ? "nuzlocke" : "normal");
  const [name, setName] = useState("");
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [rand, setRand] = useState<Omit<RandomOpts, "seed"> & { seed: string }>({ seed: "", wild: "off", trainers: "off", starters: "off", legendsInWild: false });
  const [partners, setPartners] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const canRandom = randomizerSupported(game);

  async function create() {
    if (mode === "soullink" && !partners.length) { toast({ title: "Pick at least one friend to link with", icon: "users", error: true }); return; }
    setBusy(true);
    try {
      const seed = rand.seed.trim() ? (parseInt(rand.seed.replace(/\D/g, ""), 10) >>> 0) : undefined;
      const r = await api<{ run: RunMeta }>("/api/runs", { method: "POST", body: JSON.stringify({ romId: rom.id, name, mode, rules, partners, random: canRandom ? { ...rand, seed } : null }) });
      sfx("saved");
      toast({ title: `${MODE_LABEL[mode]} created`, text: mode === "soullink" ? "Your friends see the invite on a game of the same region" : "Press Play to start it", icon: "layers" });
      onCreated(r.run.id);
    } catch (e: any) { toast({ title: "Couldn't create it", text: e.message, error: true }); setBusy(false); }
  }

  return (
    <Modal title="New playthrough" onClose={onClose} actions={[{ label: "Cancel", onClick: onClose }, { label: busy ? "Creating…" : "Create", primary: true, onClick: () => !busy && create() }]}>
      <div className="newrun">
        <label className="field"><span>Name (optional)</span><input data-nav data-autofocus value={name} maxLength={40} placeholder={`${game?.name ?? rom.title} ${MODE_LABEL[mode]}`} onChange={(e) => setName(e.target.value)} /></label>
        <div className="newrun-sec">
          <span className="newrun-label">Mode</span>
          <Seg value={mode} onChange={setMode} options={(game ? [["normal", "Normal"], ["nuzlocke", "Nuzlocke"], ["soullink", "Soul Link"]] : [["normal", "Normal"]]) as [Mode, string][]} />
          <p className="dim small">{MODE_INFO[mode]}</p>
        </div>
        {mode !== "normal" && (
          <div className="newrun-sec">
            <span className="newrun-label">Rules</span>
            {RULE_INFO.filter(([k]) => k !== "typeClause" || mode === "soullink").map(([k, l, d]) => (
              <div key={k} className="row"><span><b>{l}</b><small>{d}</small></span><Toggle label={l} on={rules[k]} onChange={(v) => setRules({ ...rules, [k]: v })} /></div>
            ))}
          </div>
        )}
        {mode === "soullink" && (
          <div className="newrun-sec">
            <span className="newrun-label">Link with</span>
            {friends.length === 0 && <p className="dim small">No other accounts yet. Invite friends from Settings first.</p>}
            <div className="newrun-friends">
              {friends.map((f) => {
                const on = partners.includes(f.id);
                return <button key={f.id} data-nav className={`chip ${on ? "on" : ""}`} style={{ ["--pc" as any]: f.color }} onClick={() => { setPartners(on ? partners.filter((x) => x !== f.id) : [...partners, f.id].slice(0, 3)); sfx("tab"); }}><i />{f.name}{on && <Icon name="link" size={16} />}</button>;
              })}
            </div>
            <p className="dim small">They join with their own copy of a {game ? REGION_LABEL[REGION[game.version]] ?? "same-region" : ""} game. Each player keeps their own saves.</p>
          </div>
        )}
        <div className="newrun-sec">
          <span className="newrun-label">Randomizer</span>
          {!canRandom ? <p className="dim small">{game ? "Randomizing is available for Game Boy and Game Boy Advance games." : "Randomizing needs a supported Pokémon game."}</p> : <>
            <div className="row"><span><b>Wild Pokémon</b><small>{rand.wild === "similar" ? "Replaced by Pokémon of similar strength" : rand.wild === "swap" ? "Each species swapped for one other everywhere" : rand.wild === "random" ? "Anything can appear" : "As in the original"}</small></span>
              <Seg value={rand.wild} onChange={(v) => setRand({ ...rand, wild: v })} options={[["off", "Off"], ["random", "Random"], ["similar", "Similar"], ["swap", "1:1 swap"]]} /></div>
            {game!.gen === 3 && <div className="row"><span><b>Trainers</b><small>Trainer teams</small></span>
              <Seg value={rand.trainers} onChange={(v) => setRand({ ...rand, trainers: v })} options={[["off", "Off"], ["random", "Random"], ["similar", "Similar"]]} /></div>}
            {game!.gen === 3 && <div className="row"><span><b>Starters</b><small>{rand.starters === "basic" ? "Three random unevolved Pokémon" : "The three starter choices"}</small></span>
              <Seg value={rand.starters} onChange={(v) => setRand({ ...rand, starters: v })} options={[["off", "Off"], ["random", "Random"], ["basic", "Unevolved"]]} /></div>}
            {rand.wild !== "off" && <div className="row"><span><b>Legendaries in the wild</b><small>Allow legendary and mythical Pokémon in grass and caves</small></span><Toggle label="Legendaries" on={rand.legendsInWild} onChange={(v) => setRand({ ...rand, legendsInWild: v })} /></div>}
            <label className="field"><span>Seed (optional, share it for the same randomization)</span><input data-nav inputMode="numeric" value={rand.seed} placeholder="random" onChange={(e) => setRand({ ...rand, seed: e.target.value.replace(/\D/g, "").slice(0, 10) })} /></label>
            <p className="dim small">Randomized playthroughs don&apos;t earn achievements.{mode === "soullink" ? " Linked friends play with the same seed." : ""}</p>
          </>}
        </div>
      </div>
    </Modal>
  );
}
