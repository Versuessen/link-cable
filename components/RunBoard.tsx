"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/client";
import data from "../lib/pokedata.json";
import {
  emptyState, levelCap, links, speciesName, spriteUrl, step, typesOf, REGION_LABEL,
  type Alert, type PlayerState, type RunMeta, type RunMon, type Snapshot,
} from "../lib/runs";
import Icon from "./Icon";
import { useMe } from "./Shell";
import { sfx } from "./sfx";

export const MODE_LABEL = { normal: "Normal", nuzlocke: "Nuzlocke", soullink: "Soul Link" } as const;

/**
 * A run's live data: settings, every player's tracker state, polling for partners' changes,
 * and `feed()` to fold a reading of the running game into my own state (used on the play page).
 */
export function useRun(runId: string | null, opts: { poll?: number } = {}) {
  const me = useMe();
  const [meta, setMeta] = useState<RunMeta | null>(null);
  const [states, setStates] = useState<PlayerState[]>([]);
  const mine = useRef<PlayerState | null>(null);
  const dirty = useRef<any>(null);
  const load = useCallback(async () => {
    if (!runId) return;
    const d = await api<{ meta: RunMeta; states: PlayerState[] }>(`/api/runs/${runId}`);
    setMeta(d.meta);
    setStates((cur) => {
      // keep my local copy (it may be newer than the server's); take everyone else's from the server
      const local = mine.current;
      return d.states.map((s) => (local && s.uid === local.uid && local.updatedAt >= s.updatedAt ? local : s))
        .concat(local && !d.states.some((s) => s.uid === local.uid) ? [local] : []);
    });
    return d;
  }, [runId]);
  useEffect(() => {
    if (!runId) return;
    load().catch(() => {});
    const t = setInterval(() => { if (!document.hidden) load().catch(() => {}); }, opts.poll ?? 5000);
    return () => clearInterval(t);
  }, [runId, load, opts.poll]);
  useEffect(() => { if (me && !mine.current) mine.current = states.find((s) => s.uid === me.id) ?? null; }, [me, states]);

  const save = useCallback((st: PlayerState) => {
    mine.current = st;
    setStates((cur) => [...cur.filter((s) => s.uid !== st.uid), st]);
    clearTimeout(dirty.current);
    dirty.current = setTimeout(() => { fetch(`/api/runs/${runId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mine.current) }).catch(() => {}); }, 1500);
  }, [runId]);

  /** One reading of the game → my updated state + alerts to show. */
  const feed = useCallback((s: Snapshot): Alert[] => {
    if (!meta || !me || meta.status !== "active") return [];
    const cur = mine.current ?? emptyState(me.id);
    const partners = states.filter((x) => x.uid !== me.id);
    const { state, alerts } = step(meta, cur, s, partners);
    if (state.updatedAt !== cur.updatedAt || state.badges !== cur.badges) save(state);
    return alerts;
  }, [meta, me, states, save]);

  const markFailed = useCallback((area: string, on: boolean) => {
    if (!me) return;
    const cur = mine.current ?? emptyState(me.id);
    const failed = { ...cur.failed }; if (on) failed[area] = Date.now(); else delete failed[area];
    save({ ...cur, failed, updatedAt: Date.now(), log: [...cur.log, { at: Date.now(), text: on ? `${area}: encounter lost` : `${area}: reopened`, kind: "info" as const }].slice(-200) });
  }, [me, save]);
  const setMon = useCallback((id: string, patch: Partial<RunMon>) => {
    if (!me || !mine.current?.mons[id]) return;
    const cur = mine.current;
    save({ ...cur, mons: { ...cur.mons, [id]: { ...cur.mons[id], ...patch } }, updatedAt: Date.now() });
  }, [me, save]);
  const action = useCallback(async (body: object) => { await api(`/api/runs/${runId}`, { method: "POST", body: JSON.stringify(body) }); return load(); }, [runId, load]);

  return { meta, states, me, load, feed, markFailed, setMon, action };
}

function Mon({ m, small = false }: { m: RunMon; small?: boolean }) {
  const t = typesOf(m.sp)[0];
  return (
    <span className={`rmon ${m.state} ${small ? "small" : ""}`} title={`${speciesName(m.sp)} · Lv ${m.lv} · ${m.area}${m.cause ? ` · ${m.cause}` : ""}`}>
      <img src={spriteUrl(m.sp)} alt="" loading="lazy" />
      {!small && <span className="rmon-text"><b>{speciesName(m.sp)}</b><small>Lv {m.lv}{t ? ` · ${t}` : ""}</small>
        {m.state === "alive" && m.max ? <i className="hpbar"><i style={{ width: `${Math.round(((m.hp ?? 0) / m.max) * 100)}%` }} /></i> : null}</span>}
      {m.shiny && <span className="rmon-shiny">✦</span>}
    </span>
  );
}

/** The board: team, areas (or Soul Link pairs), graveyard and log. Used on the game page and next to the running game. */
export function RunBoard({ run, compact = false, onPlay }: { run: ReturnType<typeof useRun>; compact?: boolean; onPlay?: () => void }) {
  const { meta, states, me } = run;
  const [tab, setTab] = useState<"team" | "areas" | "graves" | "log">("team");
  const [failArea, setFailArea] = useState("");
  const L = useMemo(() => (meta ? links(meta, states) : { list: [], clash: new Set<string>() }), [meta, states]);
  if (!meta) return <div className="rboard skeleton" style={{ minHeight: 240 }} />;
  const nuz = meta.mode !== "normal";
  const mine = states.find((s) => s.uid === me?.id);
  const myMons = Object.values(mine?.mons ?? {});
  const team = myMons.filter((m) => m.inParty);
  const dead = states.flatMap((s) => Object.values(s.mons).filter((m) => m.state === "dead").map((m) => ({ m, s })));
  const cap = meta.rules.levelCaps && meta.game ? levelCap(meta.game, mine?.badges ?? 0) : null;
  const playerOf = (uid: string) => meta.players.find((p) => p.uid === uid);
  const log = states.flatMap((s) => s.log.map((l) => ({ ...l, uid: s.uid }))).sort((a, b) => b.at - a.at).slice(0, 60);
  const gen = meta.region.startsWith("kanto-rby") ? "1" : meta.region === "johto-gsc" ? "2" : meta.region.startsWith("kanto") || meta.region === "hoenn" ? "3" : meta.region.startsWith("unova") ? "5" : "4";
  const areaNames = Object.values((data.loc as Record<string, Record<string, string>>)[gen] ?? {}).filter((v, i, a) => a.indexOf(v) === i).sort();

  return (
    <div className={`rboard ${compact ? "compact" : ""}`}>
      <div className="rboard-head">
        <span className={`pill mode-${meta.mode}`}>{MODE_LABEL[meta.mode]}</span>
        {meta.random && <span className="pill">Randomized · seed {meta.random.seed}</span>}
        {meta.status !== "active" && <span className={`pill ${meta.status === "won" ? "accent" : ""}`}>{meta.status === "won" ? "Won" : "Lost"}</span>}
        {cap != null && nuz && <span className="pill">Level cap {cap}</span>}
        <span className="dim small">{REGION_LABEL[meta.region] ?? ""}</span>
        {onPlay && <button data-nav className="btn small primary rboard-play" onClick={onPlay}><Icon name="play" size={18} />Play</button>}
      </div>
      {nuz && (
        <div className="tablist rboard-tabs">
          {(["team", "areas", "graves", "log"] as const).map((t) => (
            <button key={t} className={`tab ${tab === t ? "on" : ""}`} onClick={() => { setTab(t); sfx("tab"); }}>
              {t === "team" ? "Team" : t === "areas" ? (meta.mode === "soullink" ? "Links" : "Areas") : t === "graves" ? "Graveyard" : "Log"}
              <span className="count">{t === "areas" ? L.list.length : t === "graves" ? dead.length : t === "team" ? team.length : ""}</span>
            </button>
          ))}
        </div>
      )}

      {(!nuz || tab === "team") && (
        <div className="rteams">
          {meta.players.filter((p) => p.joined).map((p) => {
            const s = states.find((x) => x.uid === p.uid);
            const t = Object.values(s?.mons ?? {}).filter((m) => m.inParty);
            return (
              <div key={p.uid} className="rteam" style={{ ["--pc" as any]: p.color }}>
                {meta.players.length > 1 && <h4><i />{p.name}{p.uid === me?.id ? " (you)" : ""}<span className="dim">{s?.badges ?? 0} badges</span></h4>}
                <div className="rteam-mons">{t.length ? t.map((m) => <Mon key={m.id} m={m} />) : <p className="dim small">{s ? "No Pokémon in the party yet." : "Hasn't started yet."}</p>}</div>
              </div>
            );
          })}
          {!nuz && <p className="dim small">A normal playthrough with its own saves. Start a Nuzlocke or Soul Link to track catches and deaths.</p>}
        </div>
      )}

      {nuz && tab === "areas" && (
        <div className="rareas">
          {L.list.length === 0 && <p className="dim small">Areas appear here as you catch Pokémon.</p>}
          {L.list.map((a) => (
            <div key={a.area} className={`rarea ${L.clash.has(a.area) ? "clash" : ""}`}>
              <b>{a.area}{L.clash.has(a.area) && <span className="pill warn">type clash</span>}</b>
              <span className="rarea-mons">
                {meta.players.filter((p) => p.joined).map((p) => {
                  const m = a.by[p.uid];
                  return <span key={p.uid} className="rarea-slot" style={{ ["--pc" as any]: p.color }}>{!m ? <i className="dim">—</i> : m === "failed" ? <i className="dim">lost</i> : <Mon m={m} small />}</span>;
                })}
              </span>
              {a.by[me?.id ?? ""] === "failed" && <button className="link small" onClick={() => run.markFailed(a.area, false)}>reopen</button>}
            </div>
          ))}
          <div className="rfail">
            <select data-nav value={failArea} onChange={(e) => setFailArea(e.target.value)} aria-label="Area">
              <option value="">Encounter fled or fainted? Pick the area…</option>
              {areaNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button data-nav className="btn small" disabled={!failArea} onClick={() => { run.markFailed(failArea, true); setFailArea(""); sfx("back"); }}>Mark as used</button>
          </div>
        </div>
      )}

      {nuz && tab === "graves" && (
        <div className="rgraves">
          {dead.length === 0 && <p className="dim small">Nobody has fallen. Keep it that way.</p>}
          {dead.sort((a, b) => (b.m.diedAt ?? 0) - (a.m.diedAt ?? 0)).map(({ m, s }) => (
            <div key={s.uid + m.id} className="rgrave"><Mon m={m} small /><span><b>{speciesName(m.sp)}</b> <span className="dim">Lv {m.lv} · {m.area}</span><small>{m.cause ?? "fainted"}{meta.players.length > 1 ? ` · ${playerOf(s.uid)?.name}` : ""}{m.diedAt ? ` · ${new Date(m.diedAt).toLocaleDateString()}` : ""}</small></span></div>
          ))}
        </div>
      )}

      {nuz && tab === "log" && (
        <div className="rlog">
          {log.map((l, i) => <p key={i} className={`rlog-${l.kind}`}><time>{new Date(l.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>{meta.players.length > 1 && <b style={{ color: playerOf(l.uid)?.color }}>{playerOf(l.uid)?.name}</b>}{l.text}</p>)}
        </div>
      )}
    </div>
  );
}
