import { beat } from "../../../lib/presence";
import { requireUser } from "../../../lib/users";
import { guard, json } from "../../../lib/http";

export const dynamic = "force-dynamic";

/** Heartbeat: "I'm here" (+ status mode / current game). Returns everyone's status. */
export const POST = guard(async (req: Request) => {
  const me = await requireUser();
  const b = await req.json().catch(() => ({}));
  return json(await beat(me.id, b));
});
