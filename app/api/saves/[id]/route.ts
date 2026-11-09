import { keys, deleteKeys, exists, getJson, putJson, signGet, signPut, validId, validVer, type Keys } from "../../../../lib/s3";
import { patchProfile, requireUser, getProfile, type User } from "../../../../lib/users";
import { HISTORY_KEEP, RomEntry, SaveMeta, SaveVersion } from "../../../../lib/games";
import { bad, guard, json } from "../../../../lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const empty = (): SaveMeta => ({ current: null, history: [], playSeconds: 0 });

async function withUrls(K: Keys, id: string, v: SaveVersion | null) {
  if (!v) return null;
  return {
    ...v,
    stateUrl: v.hasState ? await signGet(K.saveBlob(id, v.ver, "state")) : null,
    sramUrl: v.hasSram ? await signGet(K.saveBlob(id, v.ver, "sram")) : null,
  };
}
async function shots(K: Keys, id: string, meta: SaveMeta) {
  return Promise.all(meta.history.map(async (h) => ({ ...h, shotUrl: h.hasShot ? await signGet(K.saveBlob(id, h.ver, "shot"), 3600) : null })));
}

/** Latest save (+ download URLs) and history. `?ver=` returns a specific backup. */
export const GET = guard(async (req: Request, { params }: Ctx) => {
  const K = keys((await requireUser()).prefix);
  const { id } = await params;
  if (!validId(id)) return bad("bad id");
  const meta = (await getJson<SaveMeta>(K.saveMeta(id))) ?? empty();
  const ver = new URL(req.url).searchParams.get("ver");
  const pick = ver ? meta.history.find((h) => h.ver === ver) ?? null : meta.current;
  return json({ meta: { ...meta, history: await shots(K, id, meta) }, save: await withUrls(K, id, pick) });
});

/** Step 1 of saving: presigned PUT URLs for a fresh version. */
export const POST = guard(async (req: Request, { params }: Ctx) => {
  const K = keys((await requireUser()).prefix);
  const { id } = await params;
  if (!validId(id)) return bad("bad id");
  const { hasState, hasSram, hasShot } = await req.json();
  const ver = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return json({
    ver,
    stateUrl: hasState ? await signPut(K.saveBlob(id, ver, "state")) : null,
    sramUrl: hasSram ? await signPut(K.saveBlob(id, ver, "sram")) : null,
    shotUrl: hasShot ? await signPut(K.saveBlob(id, ver, "shot")) : null,
  });
});

/** Step 2 of saving: flip meta.json to the new version, prune old backups. */
export const PUT = guard(async (req: Request, { params }: Ctx) => {
  const me = await requireUser();
  const K = keys(me.prefix);
  const { id } = await params;
  if (!validId(id)) return bad("bad id");
  const b = await req.json();
  const meta = (await getJson<SaveMeta>(K.saveMeta(id))) ?? empty();

  if (b.restore) {
    const v = meta.history.find((h) => h.ver === b.restore);
    if (!v) return bad("version not found", 404);
    meta.current = { ...v };
    await putJson(K.saveMeta(id), meta);
    await touchIndex(K, id, meta);
    return json({ meta });
  }

  if (!validVer(b.ver)) return bad("bad version");
  const v: SaveVersion = {
    ver: b.ver, updatedAt: Date.now(),
    device: String(b.device ?? "unknown").slice(0, 60), deviceId: String(b.deviceId ?? "").slice(0, 40),
    hasState: !!b.hasState, hasSram: !!b.hasSram, stateGz: !!b.stateGz, hasShot: !!b.hasShot,
    reason: ["auto", "manual", "leave", "ingame"].includes(b.reason) ? b.reason : "auto",
  };
  if (v.hasState && !(await exists(K.saveBlob(id, v.ver, "state")))) return bad("state upload missing", 409);

  // stale-write protection: a device that loaded an old save shouldn't silently clobber newer progress
  if (b.baseVer !== undefined && meta.current && b.baseVer !== meta.current.ver && meta.current.deviceId !== v.deviceId && !b.force) {
    return json({ conflict: true, current: meta.current }, 409);
  }

  meta.current = v;
  meta.playSeconds = (meta.playSeconds || 0) + Math.max(0, Math.min(3600, Number(b.playedDelta) || 0));
  // keep a few backups, but thin out consecutive autosaves so history spans more time
  const hist = [v, ...meta.history.filter((h) => h.ver !== v.ver)];
  const keep: SaveVersion[] = [];
  for (const h of hist) {
    const last = keep[keep.length - 1];
    if (keep.length && h.reason === "auto" && last && last.updatedAt - h.updatedAt < 10 * 60_000 && keep.length > 1) continue;
    keep.push(h);
    if (keep.length >= HISTORY_KEEP) break;
  }
  const dropped = hist.filter((h) => !keep.includes(h));
  meta.history = keep;
  await putJson(K.saveMeta(id), meta);
  await deleteKeys(dropped.flatMap((h) => [K.saveBlob(id, h.ver, "state"), K.saveBlob(id, h.ver, "sram"), K.saveBlob(id, h.ver, "shot")])).catch(() => {});
  await touchIndex(K, id, meta, me, Number.isInteger(b.localHour) ? b.localHour : undefined);
  return json({ meta });
});

/** keep library index in sync (recent ordering, play time, hero screenshot) */
async function touchIndex(K: Keys, id: string, meta: SaveMeta, user?: User, localHour?: number) {
  const index = (await getJson<RomEntry[]>(K.index)) ?? [];
  const rom = index.find((r) => r.id === id);
  if (!rom) return;
  rom.lastPlayedAt = meta.current?.updatedAt;
  rom.playSeconds = meta.playSeconds;
  const withShot = meta.history.find((h) => h.hasShot && h.ver === meta.current?.ver) ?? meta.history.find((h) => h.hasShot);
  rom.shotVer = withShot?.ver;
  await putJson(K.index, index);
  if (user) { // per-user stats for borders/badges
    const prof = await getProfile(user).catch(() => ({} as any));
    const devices = Array.from(new Set([...(prof.devices ?? []), meta.current?.device].filter(Boolean))).slice(-12) as string[];
    const h = typeof localHour === "number" ? localHour : -1; // the player's own clock, not the server's
    await patchProfile(user, {
      playSeconds: index.reduce((a, r) => a + (r.playSeconds ?? 0), 0), saves: (prof.saves ?? 0) + 1, devices,
      nightSaves: (prof.nightSaves ?? 0) + (h >= 0 && h < 4 ? 1 : 0), earlySaves: (prof.earlySaves ?? 0) + (h >= 5 && h < 8 ? 1 : 0),
    }).catch(() => {});
  }
}
