// Signed session cookie (HMAC-SHA256 via Web Crypto) — works in Edge middleware and Node routes.
export const COOKIE = "lc_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(data: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) throw new Error("SESSION_SECRET missing or too short");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function createSession(uid: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload = `v3.${uid}.${now}.${now + MAX_AGE}`;
  return { value: `${payload}.${await hmac(payload)}`, maxAge: MAX_AGE };
}

/** Returns { uid, iat } for a valid token, otherwise null. `iat` lets "sign out everywhere" revoke older sessions. */
export async function verifySession(token?: string): Promise<{ uid: string; iat: number } | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "v3") return null;
  const [v, uid, iat, exp, sig] = parts;
  if (Number(exp) < Date.now() / 1000) return null;
  const expected = await hmac(`${v}.${uid}.${iat}.${exp}`);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? { uid, iat: Number(iat) } : null;
}

export const cookieOpts = (maxAge: number) => ({
  httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge,
});
