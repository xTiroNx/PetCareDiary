import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

process.env.NODE_ENV = "test";
process.env.BACKEND_PORT ??= "0";
process.env.FRONTEND_URL ??= "http://localhost:5173";
process.env.DATABASE_URL ??= "postgresql://user:password@localhost:5432/petcare";
process.env.BOT_TOKEN ??= "123456:test_bot_token";
process.env.BOT_USERNAME ??= "petcare_test_bot";
process.env.TELEGRAM_WEBHOOK_SECRET ??= "test_webhook_secret_123456789";
process.env.ADMIN_TELEGRAM_IDS = "2001";
process.env.ATTACHMENTS_LOCAL_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "petcare-attachments-smoke-"));
process.env.ATTACHMENTS_MAX_FILE_MB = "1";
process.env.ATTACHMENTS_MAX_PER_ENTRY = "2";

const [{ createApp }, { prisma }, { deleteAttachmentsForEntry }] = await Promise.all([
  import("../src/app.js"),
  import("../src/prisma/client.js"),
  import("../src/services/attachments.service.js")
]);

const now = new Date("2026-05-17T12:00:00.000Z");
const users = new Map([
  [2001n, {
    id: "user-admin",
    telegramId: 2001n,
    username: "admin_user",
    firstName: "Admin",
    lastName: "User",
    languageCode: "en",
    createdAt: now,
    updatedAt: now,
    trialStartedAt: now,
    trialEndsAt: new Date(now.getTime() + 86_400_000),
    accessUntil: null,
    lifetimeAccess: false
  }],
  [2002n, {
    id: "user-regular",
    telegramId: 2002n,
    username: "regular_user",
    firstName: "Regular",
    lastName: "User",
    languageCode: "en",
    createdAt: now,
    updatedAt: now,
    trialStartedAt: now,
    trialEndsAt: new Date(now.getTime() + 86_400_000),
    accessUntil: null,
    lifetimeAccess: false
  }]
]);

type AttachmentRecord = {
  id: string;
  userId: string;
  petId: string;
  entryType: string;
  entryId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  createdAt: Date;
};

const attachments: AttachmentRecord[] = [];

(prisma.user.findUnique as unknown as (args: unknown) => Promise<unknown>) = async (args: unknown) => {
  const telegramId = (args as { where?: { telegramId?: bigint } }).where?.telegramId;
  return telegramId ? users.get(telegramId) ?? null : null;
};

(prisma.pet.findFirst as unknown as (args: unknown) => Promise<unknown>) = async (args: unknown) => {
  const where = (args as { where?: { id?: string; userId?: string } }).where;
  if (where?.id === "pet-admin" && where.userId === "user-admin") return { id: "pet-admin", userId: "user-admin" };
  if (where?.id === "pet-regular" && where.userId === "user-regular") return { id: "pet-regular", userId: "user-regular" };
  return null;
};

(prisma.symptomEntry.findFirst as unknown as (args: unknown) => Promise<unknown>) = async (args: unknown) => {
  const where = (args as { where?: { id?: string; userId?: string; petId?: string } }).where;
  if (where?.id === "symptom-admin" && where.userId === "user-admin" && where.petId === "pet-admin") {
    return { id: "symptom-admin" };
  }
  return null;
};

(prisma.attachment.count as unknown as (args: unknown) => Promise<number>) = async (args: unknown) => {
  const where = (args as { where?: Partial<AttachmentRecord> }).where ?? {};
  return attachments.filter((attachment) => matchesWhere(attachment, where)).length;
};

(prisma.attachment.findMany as unknown as (args: unknown) => Promise<AttachmentRecord[]>) = async (args: unknown) => {
  const where = (args as { where?: Partial<AttachmentRecord> }).where ?? {};
  return attachments.filter((attachment) => matchesWhere(attachment, where));
};

(prisma.attachment.findFirst as unknown as (args: unknown) => Promise<AttachmentRecord | null>) = async (args: unknown) => {
  const where = (args as { where?: Partial<AttachmentRecord> }).where ?? {};
  return attachments.find((attachment) => matchesWhere(attachment, where)) ?? null;
};

(prisma.attachment.create as unknown as (args: unknown) => Promise<AttachmentRecord>) = async (args: unknown) => {
  const data = (args as { data: Omit<AttachmentRecord, "id" | "createdAt"> }).data;
  const attachment = { ...data, id: `attachment-${attachments.length + 1}`, createdAt: now };
  attachments.push(attachment);
  return attachment;
};

(prisma.attachment.delete as unknown as (args: unknown) => Promise<AttachmentRecord>) = async (args: unknown) => {
  const id = (args as { where?: { id?: string } }).where?.id;
  const index = attachments.findIndex((attachment) => attachment.id === id);
  if (index < 0) throw new Error("Attachment was not found in smoke store.");
  return attachments.splice(index, 1)[0];
};

(prisma.attachment.deleteMany as unknown as (args: unknown) => Promise<{ count: number }>) = async (args: unknown) => {
  const where = (args as { where?: Partial<AttachmentRecord> }).where ?? {};
  const before = attachments.length;
  for (let index = attachments.length - 1; index >= 0; index -= 1) {
    if (matchesWhere(attachments[index], where)) attachments.splice(index, 1);
  }
  return { count: before - attachments.length };
};

function matchesWhere(attachment: AttachmentRecord, where: Partial<AttachmentRecord>) {
  return Object.entries(where).every(([key, value]) => attachment[key as keyof AttachmentRecord] === value);
}

const app = createApp();
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve, reject) => {
  server.once("listening", resolve);
  server.once("error", reject);
});

type JsonResponse = {
  status: number;
  body: unknown;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function signedInitData(telegramId: number) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `attachments-smoke-${telegramId}`,
    user: JSON.stringify({ id: telegramId, first_name: "Attachments", language_code: "en" })
  });
  const dataCheck = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(process.env.BOT_TOKEN!).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(dataCheck).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

function baseUrl() {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not expose a TCP address.");
  return `http://127.0.0.1:${address.port}`;
}

function attachmentForm(entryId = "symptom-admin") {
  const form = new FormData();
  form.set("petId", "pet-admin");
  form.set("entryType", "SYMPTOM");
  form.set("entryId", entryId);
  form.set("file", new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }), "symptom.png");
  return form;
}

async function jsonRequest(pathname: string, telegramId: number): Promise<JsonResponse> {
  const response = await fetch(`${baseUrl()}${pathname}`, {
    headers: { Authorization: `tma ${signedInitData(telegramId)}` }
  });
  return { status: response.status, body: await response.json() };
}

try {
  const nonAdminUpload = await fetch(`${baseUrl()}/api/admin/attachments`, {
    method: "POST",
    headers: { Authorization: `tma ${signedInitData(2002)}` },
    body: attachmentForm()
  });
  assert(nonAdminUpload.status === 403, `Expected regular user to be rejected, got ${nonAdminUpload.status}`);

  const missingEntryUpload = await fetch(`${baseUrl()}/api/admin/attachments`, {
    method: "POST",
    headers: { Authorization: `tma ${signedInitData(2001)}` },
    body: attachmentForm("missing-entry")
  });
  assert(missingEntryUpload.status === 404, `Expected missing entry to be rejected, got ${missingEntryUpload.status}`);

  const upload = await fetch(`${baseUrl()}/api/admin/attachments`, {
    method: "POST",
    headers: { Authorization: `tma ${signedInitData(2001)}` },
    body: attachmentForm()
  });
  assert(upload.status === 201, `Expected upload to succeed, got ${upload.status}`);
  const created = await upload.json() as { id?: string; fileName?: string; mimeType?: string; sizeBytes?: number };
  assert(created.id === "attachment-1", "Expected serialized attachment id.");
  assert(created.fileName === "symptom.png", "Expected original filename to be preserved.");
  assert(created.mimeType === "image/png", "Expected image/png mime type.");
  assert(created.sizeBytes === 4, "Expected uploaded file size.");

  const list = await jsonRequest("/api/admin/attachments?petId=pet-admin&entryType=SYMPTOM&entryId=symptom-admin", 2001);
  assert(list.status === 200, `Expected list to succeed, got ${list.status}`);
  assert(Array.isArray(list.body), "Expected attachment list response to be an array.");
  assert(list.body.length === 1, `Expected one attachment, got ${list.body.length}`);

  const file = await fetch(`${baseUrl()}/api/admin/attachments/attachment-1/file`, {
    headers: { Authorization: `tma ${signedInitData(2001)}` }
  });
  assert(file.status === 200, `Expected file download to succeed, got ${file.status}`);
  assert(file.headers.get("content-type")?.includes("image/png"), "Expected downloaded content type to be image/png.");
  assert((await file.arrayBuffer()).byteLength === 4, "Expected downloaded file bytes.");

  const remove = await fetch(`${baseUrl()}/api/admin/attachments/attachment-1`, {
    method: "DELETE",
    headers: { Authorization: `tma ${signedInitData(2001)}` }
  });
  assert(remove.status === 204, `Expected delete to succeed, got ${remove.status}`);

  const listAfterDelete = await jsonRequest("/api/admin/attachments?petId=pet-admin&entryType=SYMPTOM&entryId=symptom-admin", 2001);
  assert(listAfterDelete.status === 200, `Expected list after delete to succeed, got ${listAfterDelete.status}`);
  assert(Array.isArray(listAfterDelete.body), "Expected attachment list after delete response to be an array.");
  assert(listAfterDelete.body.length === 0, "Expected attachment list to be empty after delete.");

  const cleanupUpload = await fetch(`${baseUrl()}/api/admin/attachments`, {
    method: "POST",
    headers: { Authorization: `tma ${signedInitData(2001)}` },
    body: attachmentForm()
  });
  assert(cleanupUpload.status === 201, `Expected cleanup upload to succeed, got ${cleanupUpload.status}`);
  assert(attachments.length === 1, "Expected one attachment before entry cleanup.");
  await deleteAttachmentsForEntry({ userId: "user-admin", entryType: "SYMPTOM", entryId: "symptom-admin" });
  assert(attachments.length === 0, "Expected entry cleanup to remove attachment metadata.");

  console.log("Attachments smoke checks passed.");
} finally {
  server.close();
  await fs.rm(process.env.ATTACHMENTS_LOCAL_DIR!, { recursive: true, force: true });
}
