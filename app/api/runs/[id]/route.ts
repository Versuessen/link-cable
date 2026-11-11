import { deletePrefix, getJson, keys, putJson, validId } from "../../../../lib/s3";
import { getProfile, listUsers, patchProfile, requireUser } from "../../../../lib/users";
import { gameFor } from "../../../../lib/achievements";
import type { RomEntry } from "../../../../lib/games";
import { REGION, type PlayerState, type RunMeta } from "../../../../lib/runs";
import { bad, guard, json } from "../../../../lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const metaKey = (id: string) => `shared/runs/${id}/meta.json`;
const stateKey = (id: string, uid: string) => `shared/runs/${id}/p-${uid}.json`;
const ok = (id: string) => /^[a-z0-9]{8}$/.test(id);

async function load(id: string, uid: string) {
  if (!ok(id)) throw Object.assign(new Error("bad id"), { status: 400 });
  const meta = await getJson<RunMeta>(metaKey(id));
  if (!meta || !meta.players.some((p) => p.uid === uid)) throw Object.assign(new Error("not found"), { status: 404 });
  return meta;
}

/** The whole board: settings plus every player's tracker state. */
export const GET = guard(async (_req: Request, { params }: Ctx) => {
  const me = await requireUser(), { id } = await params;
  const meta = await load(id, me.id);
  const states = await Promise.all(meta.players.filter((p) => p.joined).map((p) => getJson<PlayerState>(stateKey(id, p.uid)).catch(() => null)));
  return json({ meta, states: states.filter(Boolean) });
});

/** Save my own tracker state (nobody else's). */
export const PUT = guard(async (req: Request, { params }: Ctx) => {
  const me = await requireUser(), { id } = await params;
  const meta = await load(id, me.id);
  if (!meta.players.find((p) => p.uid === me.id)?.joined) return bad("join the run first", 403);
  const b = (await req.json().catch(() => null)) as PlayerState | null;
  if (!b || typeof b.mons !== "object") return bad("bad state");
  const body = JSON.stringify({ ...b, uid: me.id });
  if (body.length > 400_000) return bad("too large", 413);
  await putJson(stateKey(id, me.id), JSON.parse(body));
  return json({ ok: true });
});

/** join (Soul Link: with my own copy of the game) · decline · end (won/lost) · reopen · delete (owner) · rename */
export const POST = guard(async (req: Request, { params }: Ctx) => {
  const me = await requireUser(), { id } = await params;
  const meta = await load(id, me.id);
  const b = await req.json().catch(() => ({}));
  const save = () => putJson(metaKey(id), meta);
  const forget = async (uid: string) => {
    const u = (await listUsers()).find((x) => x.id === uid);
    if (u) { const prof = await getProfile(u); await patchProfile(u, { runs: (prof.runs ?? []).filter((r) => r !== id) }); }
  };
  if (b.action === "join") {
    if (!validId(b.romId)) return bad("pick your copy of the game");
    const rom = ((await getJson<RomEntry[]>(keys(me.prefix).index)) ?? []).find((r) => r.id === b.romId);
    const game = rom ? gameFor(rom) : null;
    if (!game || REGION[game.version] !== meta.region) return bad("That game doesn't match this Soul Link's region", 400);
    const p = meta.players.find((x) => x.uid === me.id)!;
    Object.assign(p, { joined: true, romId: rom!.id, game: game.version, name: me.name, color: me.color });
    await save(); return json({ run: meta });
  }
  if (b.action === "decline" || b.action === "leave") {
    if (meta.owner === me.id) return bad("The host can delete the run instead");
    const mine = meta.players.find((p) => p.uid === me.id);
    if (mine?.romId) await deletePrefix(keys(me.prefix).saveDir(`${mine.romId}-r-${id}`)).catch(() => {});
    meta.players = meta.players.filter((p) => p.uid !== me.id);
    await save(); await forget(me.id); return json({ ok: true });
  }
  if (b.action === "end" || b.action === "reopen") {
    meta.status = b.action === "reopen" ? "active" : b.result === "won" ? "won" : "lost";
    meta.endedAt = b.action === "end" ? Date.now() : undefined;
    await save(); return json({ run: meta });
  }
  if (b.action === "rename" && typeof b.name === "string" && b.name.trim()) { meta.name = b.name.trim().slice(0, 40); await save(); return json({ run: meta }); }
  if (b.action === "delete") {
    if (meta.owner !== me.id) return bad("Only the host can delete a run", 403);
    // each player's saves for this run live in their own space
    for (const p of meta.players) {
      const u = (await listUsers()).find((x) => x.id === p.uid);
      if (u && p.romId) await deletePrefix(keys(u.prefix).saveDir(`${p.romId}-r-${id}`)).catch(() => {});
      await forget(p.uid);
    }
    await deletePrefix(`shared/runs/${id}/`);
    return json({ ok: true });
  }
  return bad("unknown action");
});
