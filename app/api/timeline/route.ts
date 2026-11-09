import { keys, getJson, signGet } from "../../../lib/s3";
import { requireUser } from "../../../lib/users";
import { RomEntry, SaveMeta } from "../../../lib/games";
import { guard, json } from "../../../lib/http";

export const dynamic = "force-dynamic";

/** Every kept save of every game, newest first — feeds the "Save Timeline" calendar. */
export const GET = guard(async () => {
  const K = keys((await requireUser()).prefix);
  const roms = (await getJson<RomEntry[]>(K.index)) ?? [];
  const metas = await Promise.all(roms.map((r) => getJson<SaveMeta>(K.saveMeta(r.id))));
  const items = (await Promise.all(roms.flatMap((r, i) => (metas[i]?.history ?? []).map(async (h) => ({
    romId: r.id, title: r.title, system: r.system, ver: h.ver, updatedAt: h.updatedAt, device: h.device, reason: h.reason,
    current: metas[i]?.current?.ver === h.ver,
    shotUrl: h.hasShot ? await signGet(K.saveBlob(r.id, h.ver, "shot"), 3600) : null,
  }))))).sort((a, b) => b.updatedAt - a.updatedAt);
  return json({ items });
});
