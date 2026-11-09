import { cookies } from "next/headers";
import { COOKIE, cookieOpts, createSession } from "../../../lib/auth";
import { checkPassword } from "../../../lib/users";
import { bad, guard, json } from "../../../lib/http";

export const POST = guard(async (req: Request) => {
  const { userId, password } = await req.json().catch(() => ({}));
  await new Promise((r) => setTimeout(r, 350)); // slow down guessing
  if (typeof userId !== "string" || typeof password !== "string") return bad("missing fields");
  const u = await checkPassword(userId, password);
  if (!u) return bad("wrong password", 401);
  const s = await createSession(u.id);
  (await cookies()).set(COOKIE, s.value, cookieOpts(s.maxAge));
  return json({ ok: true });
});
