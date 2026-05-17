import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";

export type StoredFile = {
  stream: NodeJS.ReadableStream;
  sizeBytes: number | null;
};

export type StoredFileMetadata = {
  sizeBytes: number | null;
};

let r2Client: S3Client | null = null;

function localStorageBaseDir() {
  return path.resolve(env.ATTACHMENTS_LOCAL_DIR);
}

function assertStorageKey(storageKey: string) {
  if (!storageKey || path.isAbsolute(storageKey) || storageKey.split(/[\\/]+/).includes("..")) {
    throw new HttpError(400, "FILE_STORAGE_KEY_INVALID", "File storage key is invalid.");
  }
}

function localFilePath(storageKey: string) {
  assertStorageKey(storageKey);
  const base = localStorageBaseDir();
  const fullPath = path.resolve(base, storageKey);
  if (!fullPath.startsWith(`${base}${path.sep}`)) {
    throw new HttpError(400, "FILE_STORAGE_KEY_INVALID", "File storage key is invalid.");
  }
  return fullPath;
}

function r2Endpoint() {
  return env.R2_ENDPOINT ?? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

function getR2Client() {
  if (r2Client) return r2Client;
  if (!env.R2_BUCKET || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new HttpError(500, "FILE_STORAGE_R2_NOT_CONFIGURED", "R2 file storage is not configured.");
  }
  r2Client = new S3Client({
    region: env.R2_REGION,
    endpoint: r2Endpoint(),
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY
    }
  });
  return r2Client;
}

function isNotFoundError(error: unknown) {
  const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode;
  if (status === 404) return true;
  if (!(error instanceof Error)) return false;
  return ["NoSuchKey", "NotFound", "NotFoundException"].includes(error.name);
}

function toNodeStream(body: unknown) {
  if (body && typeof (body as NodeJS.ReadableStream).pipe === "function") {
    return body as NodeJS.ReadableStream;
  }
  const maybeWebStream = body as { transformToWebStream?: () => NodeReadableStream };
  if (maybeWebStream?.transformToWebStream) {
    return Readable.fromWeb(maybeWebStream.transformToWebStream());
  }
  throw new HttpError(500, "FILE_STORAGE_STREAM_INVALID", "Stored file stream is invalid.");
}

export function isR2FileStorage() {
  return env.FILE_STORAGE_DRIVER === "r2";
}

export async function writeStoredFile(storageKey: string, buffer: Buffer, contentType?: string) {
  assertStorageKey(storageKey);
  if (isR2FileStorage()) {
    await getR2Client().send(new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: storageKey,
      Body: buffer,
      ContentType: contentType
    }));
    return;
  }

  const fullPath = localFilePath(storageKey);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, buffer, { flag: "wx" });
}

export async function readStoredFile(storageKey: string): Promise<StoredFile | null> {
  assertStorageKey(storageKey);
  if (isR2FileStorage()) {
    try {
      const response = await getR2Client().send(new GetObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: storageKey
      }));
      if (!response.Body) return null;
      return {
        stream: toNodeStream(response.Body),
        sizeBytes: typeof response.ContentLength === "number" ? response.ContentLength : null
      };
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  const fullPath = localFilePath(storageKey);
  const stats = await fs.stat(fullPath).catch(() => null);
  if (!stats?.isFile()) return null;
  return { stream: createReadStream(fullPath), sizeBytes: stats.size };
}

export async function statStoredFile(storageKey: string): Promise<StoredFileMetadata | null> {
  assertStorageKey(storageKey);
  if (isR2FileStorage()) {
    try {
      const response = await getR2Client().send(new HeadObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: storageKey
      }));
      return { sizeBytes: typeof response.ContentLength === "number" ? response.ContentLength : null };
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  const fullPath = localFilePath(storageKey);
  const stats = await fs.stat(fullPath).catch(() => null);
  if (!stats?.isFile()) return null;
  return { sizeBytes: stats.size };
}

export async function createStoredFileUploadUrl(input: {
  storageKey: string;
  contentType: string;
  expiresInSeconds?: number;
}) {
  assertStorageKey(input.storageKey);
  if (!isR2FileStorage()) {
    throw new HttpError(503, "FILE_STORAGE_DIRECT_UPLOAD_UNAVAILABLE", "Direct file upload is available only with R2 storage.");
  }
  return getSignedUrl(
    getR2Client(),
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: input.storageKey,
      ContentType: input.contentType
    }),
    { expiresIn: input.expiresInSeconds ?? env.FILE_STORAGE_SIGNED_URL_TTL_SECONDS }
  );
}

export async function createStoredFileDownloadUrl(input: {
  storageKey: string;
  contentType?: string;
  fileName?: string | null;
  contentDisposition?: string;
  expiresInSeconds?: number;
}) {
  assertStorageKey(input.storageKey);
  if (!isR2FileStorage()) {
    throw new HttpError(503, "FILE_STORAGE_DIRECT_DOWNLOAD_UNAVAILABLE", "Direct file download is available only with R2 storage.");
  }
  return getSignedUrl(
    getR2Client(),
    new GetObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: input.storageKey,
      ResponseContentType: input.contentType,
      ResponseContentDisposition: input.contentDisposition
    }),
    { expiresIn: input.expiresInSeconds ?? env.FILE_STORAGE_SIGNED_URL_TTL_SECONDS }
  );
}

export async function deleteStoredFile(storageKey: string) {
  assertStorageKey(storageKey);
  if (isR2FileStorage()) {
    await getR2Client().send(new DeleteObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: storageKey
    }));
    return;
  }

  try {
    await fs.unlink(localFilePath(storageKey));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
