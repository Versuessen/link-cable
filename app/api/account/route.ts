import { cookies } from "next/headers";
import { COOKIE, cookieOpts, createSession } from "../../../lib/auth";
import { checkPassword, deleteUser, getProfile, patchProfile, requireUser, toPublic, updateUser } from "../../../lib/users";
import { FAMILIES, FRAMES } from "../../../lib/flair";
import { bad, guard, json } from "../../../lib/http";

export const dynamic = "force-dynamic";

export const GET = guard(async () => {
  const me = await requireUser();
  return json({ user: toPublic(me), profile: await getProfile(me), createdAt: me.createdAt });
});

/** Profile + security changes. Changing the password needs the current one and signs out other devices. */
export const PATCH = guard(async (req: Request) => {
  const me = await requireUser();
  const b = await req.json();
  if (b.password !== undefined) {
    if (typeof b.currentPassword !== "string" || !(await checkPassword(me.id, b.currentPassword))) return bad("Your current password isn't right", 403);
  }
  const revoke = b.password !== undefined;
  const u = await updateUser(me.id, {
    name: b.name, color: b.color, avatar: b.avatar, password: b.password,
    revokedBefore: revoke ? Math.floor(Date.now() / 1000) : undefined,
  });
  if (revoke) { // keep this device signed in with a fresh session
    const s = await createSession(u.id);
    (await cookies()).set(COOKIE, s.value, cookieOpts(s.maxAge));
  }
  let profile;
  if (b.flair && typeof b.flair === "object") {
    // PTR snapshot computed by the Labs page (level, chosen frame, one equipped badge)
    const f = b.flair, level = Math.max(0, Math.min(999, Math.floor(Number(f.level) || 0)));
    const frame = ["auto", "none", ...FRAMES.map((x) => x.id)].includes(f.frame) ? f.frame : "auto";
    const badge = f.badge && FAMILIES.some((x) => x.id === f.badge.id) ? { id: String(f.badge.id), step: Math.max(1, Math.min(3, Number(f.badge.step) || 1)) } : null;
    profile = await patchProfile(u, { flair: { level, frame, badge } });
  }
  return json({ user: toPublic(u), profile });
});

/** action "signout-others": revoke every other session, re-issue this one. */
export const POST = guard(async (req: Request) => {
  const me = await requireUser();
  const { action } = await req.json();
  if (action !== "signout-others") return bad("bad action");
  await updateUser(me.id, { revokedBefore: Math.floor(Date.now() / 1000) });
  const s = await createSession(me.id);
  (await cookies()).set(COOKIE, s.value, cookieOpts(s.maxAge));
  return json({ ok: true });
});

/** Delete my account and all my games/saves (not available to the owner). */
export const DELETE = guard(async (req: Request) => {
  const me = await requireUser();
  const { password } = await req.json().catch(() => ({}));
  if (typeof password !== "string" || !(await checkPassword(me.id, password))) return bad("Password isn't right", 403);
  await deleteUser(me.id);
  (await cookies()).delete(COOKIE);
  return json({ ok: true });
});
