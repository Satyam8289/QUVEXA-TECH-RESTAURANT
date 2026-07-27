/* Cloudflare R2 (S3-compatible) image storage. Restaurant logos and any
   other uploaded images are pushed here instead of being stored inline as
   base64 in Postgres — keeps the database small and images served straight
   from Cloudflare's edge instead of our own VPS.

   Falls back gracefully to inline base64 storage (see routes.js) whenever
   the R2_* env vars aren't set — so local dev with no R2 account configured
   still works exactly as before. */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "node:crypto";

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL } = process.env;

export const r2Configured = !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME && R2_PUBLIC_URL);

const client = r2Configured
  ? new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    })
  : null;

const EXT_BY_MIME = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp", "image/gif": "gif" };

/* Accepts a data URL (e.g. "data:image/png;base64,....") and uploads the
   decoded bytes to R2 under `folder/`, returning the public URL. */
export async function uploadDataUrlToR2(dataUrl, folder) {
  if (!r2Configured) throw Object.assign(new Error("R2 isn't configured"), { code: "R2_NOT_CONFIGURED" });
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) throw Object.assign(new Error("Expected a base64 image data URL"), { status: 400 });
  const [, mime, b64] = match;
  const ext = EXT_BY_MIME[mime.toLowerCase()] || "jpg";
  const buffer = Buffer.from(b64, "base64");
  const key = `${folder}/${crypto.randomUUID()}.${ext}`;

  await client.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mime,
    CacheControl: "public, max-age=31536000, immutable",
  }));

  return `${R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
}
