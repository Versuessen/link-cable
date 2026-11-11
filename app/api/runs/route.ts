import { getJson, keys, putJson, validId } from "../../../lib/s3";
import { getProfile, listUsers, patchProfile, requireUser } from "../../../lib/users";
import { gameFor } from "../../../lib/achievements";
import type { RomEntry } from "../../../lib/games";
import { DEFAULT_RULES, REGION, randomizerSupported, type Mode, type RunMeta } from "../../../lib/runs";
import { bad, guard, json } from "../../../lib/http";

export const dynamic = "force-dynamic";
const metaKey = (id: string) => `shared/runs/${id}/meta.json`;

/** My playthroughs (all games), plus Soul Link invitations waiting for me. */
export const GET = guard(async () => {
  const me = await requireUser();
  const ids: string[] = (await getProfile(me)).runs ?? [];
  const metas = (await Promise.all(ids.map((id) => getJson<RunMeta>(metaKey(id)).catch(() => null)))).filter(Boolean) as RunMeta[];
  return json({ runs: metas.filter((m) => m.players.some((p) => p.uid === me.id && p.joined)), invites: metas.filter((m) => m.players.some((p) => p.uid === me.id && !p.joined)) });
});

/** Start a playthrough of one of my games. Soul Link: name the friends to invite (they pick their own copy). */
export const POST = guard(async (req: Request) => {
  const me = await requireUser(), K = keys(me.prefix);
  const b = await req.json().catch(() => ({}));
  if (!validId(b.romId)) return bad("pick a game");
  const rom = ((await getJson<RomEntry[]>(K.index)) ?? []).find((r) => r.id === b.romId);
  const game = rom ? gameFor(rom) : null;
  const mode: Mode = ["normal", "nuzlocke", "soullink"].includes(b.mode) ? b.mode : "normal";
  if (!rom) return bad("game not found", 404);
  if (mode !== "normal" && !game) return bad("Nuzlocke and Soul Link need a supported Pokémon game");
  const users = await listUsers();
  const invite: string[] = mode === "soullink" ? (Array.isArray(b.partners) ? b.partners : []).filter((u: string) => u !== me.id && users.some((x) => x.id === u)).slice(0, 3) : [];
  if (mode === "soullink" && !invite.length) return bad("Invite at least one friend for a Soul Link");
  const r = b.random;
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const meta: RunMeta = {
    id, name: String(b.name || "").trim().slice(0, 40) || `${game?.name ?? rom.title} ${mode === "normal" ? "playthrough" : mode === "nuzlocke" ? "Nuzlocke" : "Soul Link"}`,
    mode, region: game ? REGION[game.version] ?? "" : "", game: game?.version ?? "", createdAt: Date.now(), owner: me.id, status: "active",
    rules: { ...DEFAULT_RULES, ...(b.rules ?? {}) },
    random: r && randomizerSupported(game) && (r.wild !== "off" || r.trainers !== "off" || r.starters !== "off") ? {
      seed: Number.isInteger(r.seed) ? r.seed >>> 0 : Math.floor(Math.random() * 2 ** 32),
      wild: ["off", "random", "similar", "swap"].includes(r.wild) ? r.wild : "off", trainers: ["off", "random", "similar"].includes(r.trainers) ? r.trainers : "off",
      starters: ["off", "random", "basic"].includes(r.starters) ? r.starters : "off", legendsInWild: !!r.legendsInWild,
    } : null,
    players: [
      { uid: me.id, name: me.name, color: me.color, romId: rom.id, game: game?.version, joined: true },
      ...invite.map((u) => { const x = users.find((y) => y.id === u)!; return { uid: x.id, name: x.name, color: x.color, joined: false }; }),
    ],
  };
  await putJson(metaKey(id), meta);
  for (const p of meta.players) {
    const u = users.find((x) => x.id === p.uid);
    if (u) { const prof = await getProfile(u); await patchProfile(u, { runs: [...(prof.runs ?? []), id] }); }
  }
  return json({ run: meta });
});
