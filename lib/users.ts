import { cookies } from "next/headers";
import { COOKIE, verifySession } from "./auth";
import { deletePrefix, getJson, putJson } from "./s3";
import { validAvatarUrl } from "./avatars";

/**
 * Accounts live in one small JSON file in the bucket. Each user's ROMs and saves live under
 * their own key prefix, so two people can use the site at the same time without touching
 * each other's data.
 */
export type User = { id: string; name: string; color: string; salt: string; hash: string; prefix: string; createdAt: number; owner?: boolean; avatar?: string; revokedBefore?: number; colorAuto?: boolean };
export type PublicUser = Pick<User, "id" | "name" | "color" | "owner" | "avatar" | "colorAuto">;
const USERS = "shared/users.json";
const COLORS = ["#ff9f1a", "#3a8dff", "#16b26a", "#e5484d", "#9b5cf6", "#00b4c8", "#f05aa6", "#7c8a99"];

let memo: { at: number; users: User[] } | null = null;
export async function listUsers(fresh = false): Promise<User[]> {
  if (!fresh && memo && Date.now() - memo.at < 15_000) return memo.users;
  const users = (await getJson<User[]>(USERS)) ?? [];
  memo = { at: Date.now(), users };
  return users;
}
async function saveUsers(users: User[]) { await putJson(USERS, users); memo = { at: Date.now(), users }; }
export const toPublic = (u: User): PublicUser => ({ id: u.id, name: u.name, color: u.color, owner: u.owner, avatar: u.avatar, colorAuto: u.colorAuto });

const enc = new TextEncoder();
async function pbkdf2(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 210_000 }, key, 256);
  return Buffer.from(bits).toString("base64");
}
function timingSafeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function checkPassword(uid: string, password: string) {
  const u = (await listUsers(true)).find((x) => x.id === uid);
  const h = await pbkdf2(password, u?.salt ?? "dummy-salt-for-timing");
  return u && timingSafeEq(h, u.hash) ? u : null;
}

export async function createUser(name: string, password: string, legacyPrefix: boolean) {
  const users = await listUsers(true);
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 24);
  if (clean.length < 2) throw Object.assign(new Error("Name needs at least 2 characters"), { status: 400 });
  if (password.length < 6) throw Object.assign(new Error("Password needs at least 6 characters"), { status: 400 });
  if (users.some((u) => u.name.toLowerCase() === clean.toLowerCase())) throw Object.assign(new Error("That name is taken"), { status: 409 });
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const salt = crypto.randomUUID();
  const first = users.length === 0;
  const user: User = {
    id, name: clean, salt, hash: await pbkdf2(password, salt), createdAt: Date.now(),
    color: COLORS[users.length % COLORS.length],
    // the first account adopts a library created before accounts existed (stored at the bucket root)
    prefix: first && legacyPrefix ? "" : `u/${id}/`,
    owner: first || undefined,
  };
  await saveUsers([...users, user]);
  return user;
}

export async function updateUser(uid: string, patch: { name?: string; password?: string; color?: string; avatar?: string | null; revokedBefore?: number; colorAuto?: boolean }) {
  const users = await listUsers(true);
  const u = users.find((x) => x.id === uid);
  if (!u) throw Object.assign(new Error("not found"), { status: 404 });
  if (patch.name) {
    const clean = patch.name.trim().slice(0, 24);
    if (users.some((x) => x.id !== uid && x.name.toLowerCase() === clean.toLowerCase())) throw Object.assign(new Error("That name is taken"), { status: 409 });
    u.name = clean;
  }
  if (patch.revokedBefore) u.revokedBefore = patch.revokedBefore;
  if (patch.name !== undefined && patch.name.trim().length < 2) throw Object.assign(new Error("Name needs at least 2 characters"), { status: 400 });
  if (patch.color && /^#[0-9a-f]{6}$/i.test(patch.color)) u.color = patch.color;
  if (typeof patch.colorAuto === "boolean") u.colorAuto = patch.colorAuto || undefined;
  if (patch.avatar === null) delete u.avatar;
  else if (patch.avatar !== undefined) {
    if (!validAvatarUrl(patch.avatar)) throw Object.assign(new Error("unsupported avatar image"), { status: 400 });
    u.avatar = patch.avatar;
  }
  if (patch.password) {
    if (patch.password.length < 6) throw Object.assign(new Error("Password needs at least 6 characters"), { status: 400 });
    u.salt = crypto.randomUUID(); u.hash = await pbkdf2(patch.password, u.salt);
  }
  await saveUsers(users);
  return u;
}

/** The signed-in user for this request, or a 401 (also for sessions revoked by "sign out everywhere"). */
export async function requireUser(): Promise<User> {
  const s = await verifySession((await cookies()).get(COOKIE)?.value).catch(() => null);
  const u = s ? (await listUsers()).find((x) => x.id === s.uid) : null;
  if (!u || (u.revokedBefore && s!.iat < u.revokedBefore)) throw Object.assign(new Error("unauthorized"), { status: 401 });
  return u;
}

/** Delete an account and everything stored under it. The owner account can't be deleted. */
export async function deleteUser(uid: string) {
  const users = await listUsers(true);
  const u = users.find((x) => x.id === uid);
  if (!u) throw Object.assign(new Error("not found"), { status: 404 });
  if (u.owner || !u.prefix) throw Object.assign(new Error("The owner account can't be deleted"), { status: 403 });
  await deletePrefix(u.prefix);
  await saveUsers(users.filter((x) => x.id !== uid));
}

// ---------------------------------------------------------------- per-user profile (stats + flair), its own file → no cross-user write races
export type Profile = { day?: { d: string; n: number }; streak?: number; bestStreak?: number; dayMax?: number; playSeconds?: number; saves?: number; nightSaves?: number; earlySaves?: number; devices?: string[]; flair?: { level: number; frame?: string; badge?: { id: string; step: number } | null } };
export const profileKey = (u: Pick<User, "prefix">) => `${u.prefix}profile.json`;
export const getProfile = async (u: Pick<User, "prefix">) => (await getJson<Profile>(profileKey(u))) ?? {};
export async function patchProfile(u: Pick<User, "prefix">, patch: Partial<Profile>) {
  const p = { ...(await getProfile(u)), ...patch };
  await putJson(profileKey(u), p);
  return p;
}
