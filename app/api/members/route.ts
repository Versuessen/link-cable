import { deleteUser, getProfile, listUsers, requireUser, toPublic } from "../../../lib/users";
import { bad, guard, json } from "../../../lib/http";

export const dynamic = "force-dynamic";

/** Owner only: everyone with an account on this PC. */
export const GET = guard(async () => {
  const me = await requireUser();
  if (!me.owner) return bad("owner only", 403);
  const users = await listUsers(true);
  return json({ members: await Promise.all(users.map(async (u) => ({ ...toPublic(u), createdAt: u.createdAt, playSeconds: (await getProfile(u)).playSeconds ?? 0 }))) });
});

export const DELETE = guard(async (req: Request) => {
  const me = await requireUser();
  if (!me.owner) return bad("owner only", 403);
  const id = new URL(req.url).searchParams.get("id");
  if (!id || id === me.id) return bad("can't remove that account");
  await deleteUser(id);
  return json({ ok: true });
});
