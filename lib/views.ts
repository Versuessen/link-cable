import { signGet, type Keys } from "./s3";
import type { RomEntry, RomView } from "./games";

/** Attach signed image URLs (signing is local crypto — no network round-trips). */
export const viewer = (K: Keys) => async (r: RomEntry): Promise<RomView> => {
  return {
    ...r,
    shotUrl: r.shotVer ? await signGet(K.saveBlob(r.id, r.shotVer, "shot"), 3600) : null,
    coverUrl: r.coverVer ? await signGet(K.cover(r.id, r.coverVer), 3600) : null,
  };
};
