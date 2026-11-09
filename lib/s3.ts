import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, HeadObjectCommand, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let _client: S3Client | null = null;
export function s3() {
  if (!_client) {
    _client = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: !!process.env.S3_FORCE_PATH_STYLE,
      // presigned browser uploads must not carry SDK-computed checksums (R2/S3 would reject the PUT)
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _client;
}
const Bucket = () => process.env.S3_BUCKET!;

export async function getJson<T>(Key: string): Promise<T | null> {
  try {
    const r = await s3().send(new GetObjectCommand({ Bucket: Bucket(), Key }));
    return JSON.parse(await r.Body!.transformToString()) as T;
  } catch (e: any) {
    if (e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404) return null;
    throw e;
  }
}

export async function putJson(Key: string, data: unknown) {
  await s3().send(new PutObjectCommand({
    Bucket: Bucket(), Key, Body: JSON.stringify(data), ContentType: "application/json", CacheControl: "no-store",
  }));
}

export const signGet = (Key: string, expiresIn = 600) =>
  getSignedUrl(s3(), new GetObjectCommand({ Bucket: Bucket(), Key, ResponseCacheControl: "no-store" }), { expiresIn });

export const signPut = (Key: string, ContentType = "application/octet-stream", expiresIn = 900) =>
  getSignedUrl(s3(), new PutObjectCommand({ Bucket: Bucket(), Key, ContentType }), { expiresIn });

export async function deletePrefix(Prefix: string) {
  if (!Prefix) throw new Error("refusing to delete the whole bucket");
  let ContinuationToken: string | undefined;
  do {
    const list = await s3().send(new ListObjectsV2Command({ Bucket: Bucket(), Prefix, ContinuationToken }));
    const objs = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (objs.length) await s3().send(new DeleteObjectsCommand({ Bucket: Bucket(), Delete: { Objects: objs } }));
    ContinuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (ContinuationToken);
}

/** Per-user keys. `p` is the user's prefix ("u/<id>/", or "" for a pre-accounts library). */
export const keys = (p: string) => ({
  index: `${p}roms/index.json`,
  rom: (id: string) => `${p}roms/${id}/rom.bin`,
  romDir: (id: string) => `${p}roms/${id}/`,
  cover: (id: string, ver: string) => `${p}roms/${id}/cover-${ver}`,
  saveDir: (id: string) => `${p}saves/${id}/`,
  saveMeta: (id: string) => `${p}saves/${id}/meta.json`,
  // every save is written under a new version key, then meta.json is flipped to point at it
  saveBlob: (id: string, ver: string, kind: "state" | "sram" | "shot") => `${p}saves/${id}/v/${ver}.${kind === "state" ? "state" : kind === "shot" ? "png" : "sav"}`,
});
export type Keys = ReturnType<typeof keys>;

export async function getRange(Key: string, bytes: string) {
  const r = await s3().send(new GetObjectCommand({ Bucket: Bucket(), Key, Range: `bytes=${bytes}` }));
  return new Uint8Array(await r.Body!.transformToByteArray());
}
export async function putBytes(Key: string, Body: Uint8Array, ContentType: string) {
  await s3().send(new PutObjectCommand({ Bucket: Bucket(), Key, Body, ContentType }));
}

export const validId = (id: string) => /^[a-z0-9-]{4,64}$/.test(id);

export async function exists(Key: string) {
  try { await s3().send(new HeadObjectCommand({ Bucket: Bucket(), Key })); return true; }
  catch { return false; }
}
export async function deleteKeys(keys: string[]) {
  if (keys.length) await s3().send(new DeleteObjectsCommand({ Bucket: Bucket(), Delete: { Objects: keys.map((Key) => ({ Key })) } }));
}
export const validVer = (v: string) => /^[0-9]{13}-[a-z0-9]{4,12}$/.test(v);

// ---------------------------------------------------------------- free-tier guard
/** Hard ceiling for the whole bucket (all users). Uploads that would cross it are refused,
 *  so a free storage tier (B2 / R2: 10 GB) is never exceeded. Default 9 GB leaves headroom for saves. */
export const storageLimit = () => Math.round((Number(process.env.STORAGE_LIMIT_GB) || 9) * 1024 ** 3);
let _usage: { bytes: number; at: number } | null = null;
export async function bucketUsage(fresh = false) {
  if (!fresh && _usage && Date.now() - _usage.at < 60_000) return _usage.bytes;
  let bytes = 0, ContinuationToken: string | undefined;
  do {
    const r = await s3().send(new ListObjectsV2Command({ Bucket: Bucket(), ContinuationToken }));
    for (const o of r.Contents ?? []) bytes += o.Size ?? 0;
    ContinuationToken = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (ContinuationToken);
  _usage = { bytes, at: Date.now() };
  return bytes;
}
export const noteUpload = (n: number) => { if (_usage) _usage.bytes += n; };

/** Lets the browser PUT/GET straight to the bucket from this site's origin. */
export async function setCors(origins: string[]) {
  await s3().send(new PutBucketCorsCommand({ Bucket: Bucket(), CORSConfiguration: { CORSRules: [{
    AllowedOrigins: origins, AllowedMethods: ["GET", "PUT", "HEAD"], AllowedHeaders: ["*"],
    ExposeHeaders: ["content-length", "etag"], MaxAgeSeconds: 3600,
  }] } }));
}
