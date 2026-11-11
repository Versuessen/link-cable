import { keys, deleteKeys, deletePrefix, exists, getJson, getRange, putBytes, putJson, signGet, signPut, validId, type Keys } from "../../../../lib/s3";
import { RomEntry, cleanTitle, systemFromFilename } from "../../../../lib/games";
import { viewer } from "../../../../lib/views";
import { requireUser } from "../../../../lib/users";
import { confident, findCovers, readHeader, thumbUrl } from "../../../../lib/covers";
import { gameFor } from "../../../../lib/achievements";
import { bad, guard, json } from "../../../../lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
type Ctx = { params: Promise<{ id: string }> };

export const GET = guard(async (_req: Request, { params }: Ctx) => {
  const K = keys((await requireUser()).prefix);
  const { id } = await params;
  if (!validId(id)) return bad("bad id");
  const rom = ((await getJson<RomEntry[]>(K.index)) ?? []).find((r) => r.id === id);
  if (!rom) return bad("not found", 404);
  // older library entries may lack a header (or a Game Boy game code): read it now so achievements can identify the game
  if (!rom.header?.title) { const h = await header(K, rom); if (h) rom.header = h; }
  return json({ rom: await viewer(K)(rom), url: await signGet(K.rom(id)), game: gameFor(rom) });
});

async function header(K: Keys, rom: RomEntry) {
  const b = await getRange(K.rom(rom.id), "0-511").catch(() => null);
  return b ? readHeader(rom.system, b) : null;
}

/** Download one boxart image from libretro-thumbnails and store it as this game's cover. */
async function storeCover(K: Keys, rom: RomEntry, dir: string, name: string) {
  const r = await fetch(thumbUrl(dir, name), { headers: { "User-Agent": "linkcable-rom-library" } });
  if (!r.ok) throw Object.assign(new Error(`cover download failed (${r.status})`), { status: 502 });
  const ver = Date.now().toString(36);
  await putBytes(K.cover(rom.id, ver), new Uint8Array(await r.arrayBuffer()), r.headers.get("content-type") || "image/png");
  if (rom.coverVer) await deleteKeys([K.cover(rom.id, rom.coverVer)]).catch(() => {});
  rom.coverVer = ver; rom.coverSource = "auto"; rom.coverName = name;
}

/** actions: commit · rename · cover-url · cover (commit custom) · cover-reset · cover-find · cover-auto */
export const POST = guard(async (req: Request, { params }: Ctx) => {
  const K = keys((await requireUser()).prefix);
  const { id } = await params;
  if (!validId(id)) return bad("bad id");
  const body = await req.json();
  const index = (await getJson<RomEntry[]>(K.index)) ?? [];
  const rom = index.find((r) => r.id === id);
  if (body.action !== "commit" && !rom) return bad("not found", 404);

  switch (body.action) {
    case "commit": {
      if (rom) return json({ ok: true });
      const system = systemFromFilename(body.filename ?? "");
      if (!system) return bad("unsupported file");
      if (!(await exists(K.rom(id)))) return bad("upload not found in bucket", 409);
      const entry: RomEntry = { id, system, filename: String(body.filename), size: Number(body.size) || 0, title: cleanTitle(String(body.filename)), addedAt: Date.now() };
      // identify the cartridge and grab its boxart right away (best effort)
      try {
        const h = await header(K, entry);
        if (h) entry.header = h;
        const c = await findCovers(system, entry.filename, h);
        if (confident(c)) {
          await storeCover(K, entry, c[0].dir, c[0].name);
          entry.title = cleanTitle(c[0].name); // official name, e.g. "Pokemon - Emerald Version"
        }
      } catch (e) { console.warn("auto cover failed", e); }
      index.push(entry);
      break;
    }
    case "rename":
      rom!.title = String(body.title).slice(0, 60);
      break;
    case "cover-url": {
      const ver = Date.now().toString(36);
      return json({ ver, uploadUrl: await signPut(K.cover(id, ver), "application/octet-stream") });
    }
    case "cover": {
      const ver = String(body.ver);
      if (!/^[a-z0-9]{6,12}$/.test(ver) || !(await exists(K.cover(id, ver)))) return bad("cover upload missing", 409);
      if (rom!.coverVer) await deleteKeys([K.cover(id, rom!.coverVer)]).catch(() => {});
      rom!.coverVer = ver; rom!.coverSource = "custom"; delete rom!.coverName;
      break;
    }
    case "cover-reset":
      if (rom!.coverVer) await deleteKeys([K.cover(id, rom!.coverVer)]).catch(() => {});
      delete rom!.coverVer; delete rom!.coverSource; delete rom!.coverName;
      break;
    case "cover-find": {
      // candidates for the picker; `q` lets the user type their own search
      const h = await header(K, rom!);
      const q = typeof body.q === "string" && body.q.trim() ? body.q.trim() : undefined;
      return json({ candidates: await findCovers(rom!.system, rom!.filename, h, q), header: h });
    }
    case "cover-auto": {
      // explicit pick ({dir, name}) or best automatic match
      if (rom!.coverSource === "custom" && !body.name && !body.force) return json({ skipped: "custom cover" });
      let dir = body.dir as string | undefined, name = body.name as string | undefined;
      if (!name) {
        const h = await header(K, rom!);
        if (h) rom!.header = h; else delete rom!.header;
        const c = await findCovers(rom!.system, rom!.filename, h);
        if (!confident(c)) { await putJson(K.index, index); return json({ matched: false, candidates: c.slice(0, 6) }); }
        ({ dir, name } = c[0]);
      }
      if (!dir || !/^Nintendo - /.test(dir)) return bad("bad cover source");
      await storeCover(K, rom!, dir, name!);
      // adopt the official title too, unless the user already renamed the game themselves
      if (rom!.title === cleanTitle(rom!.filename)) rom!.title = cleanTitle(name!);
      break;
    }
    default:
      return bad("bad action");
  }
  await putJson(K.index, index);
  const out = rom ?? index.find((r) => r.id === id);
  return json({ ok: true, rom: out ? await viewer(K)(out) : null });
});

export const DELETE = guard(async (_req: Request, { params }: Ctx) => {
  const K = keys((await requireUser()).prefix);
  const { id } = await params;
  if (!validId(id)) return bad("bad id");
  const index = ((await getJson<RomEntry[]>(K.index)) ?? []).filter((r) => r.id !== id);
  await putJson(K.index, index);
  await deletePrefix(K.romDir(id));
  await deletePrefix(K.saveDir(id));
  return json({ ok: true });
});
