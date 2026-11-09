import { keys, getJson, signPut } from "../../../lib/s3";
import { RomEntry, systemFromFilename } from "../../../lib/games";
import { viewer } from "../../../lib/views";
import { requireUser } from "../../../lib/users";
import { bad, guard, json } from "../../../lib/http";

export const dynamic = "force-dynamic";
const MAX = 512 * 1024 * 1024;

export const GET = guard(async () => {
  const K = keys((await requireUser()).prefix);
  const roms = (await getJson<RomEntry[]>(K.index)) ?? [];
  roms.sort((a, b) => (b.lastPlayedAt ?? b.addedAt) - (a.lastPlayedAt ?? a.addedAt));
  return json({ roms: await Promise.all(roms.map(viewer(K))) });
});

/** Step 1 of upload: presigned URL. The browser PUTs straight to the bucket
 *  (Vercel functions cap request bodies at ~4.5 MB, so ROMs must not go through us). */
export const POST = guard(async (req: Request) => {
  const K = keys((await requireUser()).prefix);
  const { filename, size } = await req.json();
  if (typeof filename !== "string" || typeof size !== "number") return bad("filename and size required");
  if (!systemFromFilename(filename)) return bad("unsupported file — use .gb .gbc .gba or .nds");
  if (size <= 0 || size > MAX) return bad("file too large");
  const id = crypto.randomUUID().slice(0, 13).replace(/[^a-z0-9-]/g, "");
  return json({ id, uploadUrl: await signPut(K.rom(id)) });
});
