import { avatarIndex } from "../../../lib/avatars";
import { requireUser } from "../../../lib/users";
import { guard, json } from "../../../lib/http";

export const dynamic = "force-dynamic";
export const GET = guard(async () => {
  await requireUser();
  return json(await avatarIndex());
});
