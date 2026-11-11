import { getJson, putJson } from "./s3";
import { listUsers, toPublic } from "./users";

/*
 * Who's online. One small shared file, updated by a heartbeat from every open tab (every 2 min, less often
 * in the background). The same heartbeat adds up "time spent in Link Cable" for the Plugged In badge.
 */
export type Mode = "online" | "away" | "dnd" | "invisible";
export type Status = "online" | "away" | "dnd" | "offline";
type Entry = { at: number; state: "active" | "idle"; mode: Mode; game?: string; link: number };
type File = Record<string, Entry>;
const KEY = "shared/presence.json";
export const OFFLINE_AFTER = 6 * 60_000;
const MODES: Mode[] = ["online", "away", "dnd", "invisible"];

export const statusOf = (e: Entry | undefined, now = Date.now()): Status =>
  !e || now - e.at > OFFLINE_AFTER || e.mode === "invisible" ? "offline" : e.mode === "dnd" ? "dnd" : e.mode === "away" || e.state === "idle" ? "away" : "online";

export const linkSecondsOf = async (uid: string) => ((await getJson<File>(KEY).catch(() => null)) ?? {})[uid]?.link ?? 0;

export async function beat(uid: string, b: { state?: string; mode?: string; game?: string }) {
  const file = (await getJson<File>(KEY).catch(() => null)) ?? {};
  const now = Date.now(), prev = file[uid];
  const e: Entry = { at: now, state: b.state === "idle" ? "idle" : "active", mode: MODES.includes(b.mode as Mode) ? (b.mode as Mode) : prev?.mode ?? "online", link: prev?.link ?? 0 };
  if (typeof b.game === "string" && b.game) e.game = b.game.slice(0, 80);
  // count the time since the last beat, if the tab was open and in use the whole time
  if (prev && prev.state === "active" && now - prev.at < OFFLINE_AFTER) e.link += Math.round((now - prev.at) / 1000);
  if (b.state === "gone") { e.at = 0; delete e.game; }
  file[uid] = e;
  await putJson(KEY, file);
  const users = await listUsers();
  return {
    me: { mode: e.mode, linkSeconds: e.link },
    users: users.map((u) => { const x = file[u.id], status = statusOf(x, now); return { ...toPublic(u), status, game: status === "offline" ? undefined : x?.game, seenAt: x?.at || undefined }; }),
  };
}
