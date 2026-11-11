import { getJson, keys, putJson, validId } from "../../../../lib/s3";
import { getProfile, patchProfile, requireUser } from "../../../../lib/users";
import { achievementsFor } from "../../../../lib/achievements";
import type { RomEntry } from "../../../../lib/games";
import { bad, guard, json } from "../../../../lib/http";

export const dynamic = "force-dynamic";
type File = { unlocked: Record<string, number> };

/** Which in-game achievements this user has unlocked for one game: { id: unlockedAt }. */
export const GET = guard(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!validId(id)) return bad("bad id");
  const K = keys((await requireUser()).prefix);
  return json((await getJson<File>(`${K.saveDir(id)}achievements.json`)) ?? { unlocked: {} });
});

/** Record newly unlocked achievements (only ids that exist for this cartridge are accepted). */
export const POST = guard(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!validId(id)) return bad("bad id");
  const me = await requireUser(), K = keys(me.prefix);
  const rom = ((await getJson<RomEntry[]>(K.index)) ?? []).find((r) => r.id === id);
  const set = achievementsFor(rom?.header?.code);
  if (!rom || !set) return bad("no achievements for this game", 404);
  const { ids } = await req.json().catch(() => ({}));
  if (!Array.isArray(ids)) return bad("ids required");
  const key = `${K.saveDir(id)}achievements.json`;
  const file = (await getJson<File>(key)) ?? { unlocked: {} };
  const now = Date.now();
  let added = 0;
  for (const a of ids) if (typeof a === "string" && set.some((x) => x.id === a) && !file.unlocked[a]) { file.unlocked[a] = now; added++; }
  if (added) {
    await putJson(key, file);
    // per-game point totals live in the profile so the account level can count them without opening every game
    const points = set.filter((x) => file.unlocked[x.id]).reduce((n, x) => n + x.points, 0);
    const prof = await getProfile(me);
    await patchProfile(me, { ach: { ...(prof.ach ?? {}), [id]: { points, count: Object.keys(file.unlocked).length, total: set.length } } });
  }
  return json(file);
});
