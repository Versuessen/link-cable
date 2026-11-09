import { bucketUsage, setCors, storageLimit } from "../../../lib/s3";
import { requireUser } from "../../../lib/users";
import { bad, guard, json } from "../../../lib/http";

export const dynamic = "force-dynamic";

/** Whole-bucket usage vs the free-tier guard. */
export const GET = guard(async () => {
  await requireUser();
  return json({ used: await bucketUsage(true), limit: storageLimit() });
});

/** Owner only: write the bucket's CORS rule for this site's address (saves doing it in the storage dashboard). */
export const POST = guard(async (req: Request) => {
  const u = await requireUser();
  if (!u.owner) return bad("Only the owner can do this", 403);
  const origin = new URL(req.url).origin;
  const origins = Array.from(new Set([origin, "http://localhost:3000"]));
  await setCors(origins);
  return json({ ok: true, origins });
});
