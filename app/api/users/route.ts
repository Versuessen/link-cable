import { cookies } from "next/headers";
import { COOKIE, cookieOpts, createSession } from "../../../lib/auth";
import { createUser, getProfile, listUsers, toPublic } from "../../../lib/users";
import { exists } from "../../../lib/s3";
import { bad, guard, json } from "../../../lib/http";

export const dynamic = "force-dynamic";

/** Public: the "Who's playing?" picker. `setup: true` means no account exists yet. */
export const GET = guard(async () => {
  const users = await listUsers(true);
  // flair (borders/badges) is only drawn by browsers that have the Labs toggle on
  const withFlair = await Promise.all(users.map(async (u) => {
    const p = await getProfile(u).catch(() => ({} as any));
    return { ...toPublic(u), flair: p.flair ?? null };
  }));
  return json({ users: withFlair, setup: users.length === 0, invite: !!process.env.INVITE_CODE });
});

/** Create an account. The very first account needs no code (it becomes the owner); after that INVITE_CODE is required. */
export const POST = guard(async (req: Request) => {
  const { name, password, invite } = await req.json().catch(() => ({}));
  await new Promise((r) => setTimeout(r, 350));
  const users = await listUsers(true);
  if (users.length > 0) {
    const code = process.env.INVITE_CODE;
    if (!code) return bad("Sign-ups are closed. Set INVITE_CODE to allow new accounts.", 403);
    if (typeof invite !== "string" || invite.trim() !== code) return bad("That invite code isn't right", 403);
  }
  if (typeof name !== "string" || typeof password !== "string") return bad("missing fields");
  const legacy = users.length === 0 && (await exists("roms/index.json"));
  const u = await createUser(name, password, legacy);
  const s = await createSession(u.id);
  (await cookies()).set(COOKIE, s.value, cookieOpts(s.maxAge));
  return json({ user: toPublic(u) });
});
