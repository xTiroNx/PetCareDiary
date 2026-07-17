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
process.env.FILE_STORAGE_DRIVER = "local";
process.env.ATTACHMENTS_LOCAL_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "petcare-attachments-smoke-"));
process.env.ATTACHMENTS_MAX_FILE_MB = "1";
process.env.ATTACHMENTS_MAX_PER_ENTRY = "10";

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
  if (where?.id === "symptom-regular" && where.userId === "user-regular" && where.petId === "pet-regular") {
    return { id: "symptom-regular" };
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

const previewCases = [
  { mimeType: "image/jpeg", fileName: "symptom.jpg", bytes: new Uint8Array([255, 216, 255, 224, 1]) },
  { mimeType: "image/png", fileName: "symptom.png", bytes: new Uint8Array([137, 80, 78, 71]) },
  { mimeType: "image/webp", fileName: "symptom.webp", bytes: new Uint8Array([82, 73, 70, 70, 1, 87, 69, 66, 80]) }
] as const;
const pdfCase = { mimeType: "application/pdf", fileName: "symptom.pdf", bytes: new TextEncoder().encode("%PDF-1.4\n") };

function attachmentForm(entryId = "symptom-admin", file = previewCases[1]) {
  const form = new FormData();
  form.set("petId", "pet-admin");
  form.set("entryType", "SYMPTOM");
  form.set("entryId", entryId);
  form.set("file", new Blob([file.bytes], { type: file.mimeType }), file.fileName);
  return form;
}

function regularAttachmentForm() {
  const form = new FormData();
  form.set("petId", "pet-regular");
  form.set("entryType", "SYMPTOM");
  form.set("entryId", "symptom-regular");
  form.set("file", new Blob([previewCases[1].bytes], { type: previewCases[1].mimeType }), previewCases[1].fileName);
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

  const expiredUserUpload = await fetch(`${baseUrl()}/api/attachments`, {
    method: "POST",
    headers: { Authorization: `tma ${signedInitData(2002)}` },
    body: regularAttachmentForm()
  });
  assert(expiredUserUpload.status === 201, `Expected expired user photo upload to remain free, got ${expiredUserUpload.status}`);
  const expiredUserAttachment = await expiredUserUpload.json() as { id?: string };
  assert(typeof expiredUserAttachment.id === "string", "Expected expired user attachment id.");
  const expiredUserDelete = await fetch(`${baseUrl()}/api/attachments/${expiredUserAttachment.id}`, {
    method: "DELETE",
    headers: { Authorization: `tma ${signedInitData(2002)}` }
  });
  assert(expiredUserDelete.status === 204, `Expected expired user photo delete to remain free, got ${expiredUserDelete.status}`);

  const missingEntryUpload = await fetch(`${baseUrl()}/api/admin/attachments`, {
    method: "POST",
    headers: { Authorization: `tma ${signedInitData(2001)}` },
    body: attachmentForm("missing-entry")
  });
  assert(missingEntryUpload.status === 404, `Expected missing entry to be rejected, got ${missingEntryUpload.status}`);

  const pdfUpload = await fetch(`${baseUrl()}/api/admin/attachments`, {
    method: "POST",
    headers: { Authorization: `tma ${signedInitData(2001)}` },
    body: attachmentForm("symptom-admin", pdfCase)
  });
  assert(pdfUpload.status === 400, `Expected PDF upload to be rejected, got ${pdfUpload.status}`);
  const pdfError = await pdfUpload.json() as { error?: { code?: string; message?: string } };
  assert(pdfError.error?.code === "ATTACHMENT_FILE_UNSUPPORTED", `Expected PDF unsupported code, got ${pdfError.error?.code}`);
  assert(pdfError.error?.message?.includes("JPG, PNG, or WebP"), "Expected PDF error message to mention image-only uploads.");

  const directUploadUnavailable = await fetch(`${baseUrl()}/api/admin/attachments/presign`, {
    method: "POST",
    headers: {
      Authorization: `tma ${signedInitData(2001)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      petId: "pet-admin",
      entryType: "SYMPTOM",
      entryId: "symptom-admin",
      fileName: previewCases[0].fileName,
      mimeType: previewCases[0].mimeType,
      sizeBytes: previewCases[0].bytes.byteLength
    })
  });
  assert(directUploadUnavailable.status === 503, `Expected local direct upload to be unavailable, got ${directUploadUnavailable.status}`);
  const directUploadError = await directUploadUnavailable.json() as { error?: { code?: string } };
  assert(directUploadError.error?.code === "ATTACHMENT_DIRECT_UPLOAD_UNAVAILABLE", `Expected direct upload unavailable code, got ${directUploadError.error?.code}`);

  const createdAttachments: Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number }> = [];
  for (const previewCase of previewCases) {
    const upload = await fetch(`${baseUrl()}/api/admin/attachments`, {
      method: "POST",
      headers: { Authorization: `tma ${signedInitData(2001)}` },
      body: attachmentForm("symptom-admin", previewCase)
    });
    assert(upload.status === 201, `Expected ${previewCase.mimeType} upload to succeed, got ${upload.status}`);
    const created = await upload.json() as { id?: string; fileName?: string; mimeType?: string; sizeBytes?: number };
    assert(typeof created.id === "string", "Expected serialized attachment id.");
    assert(created.fileName === previewCase.fileName, `Expected ${previewCase.fileName} filename to be preserved.`);
    assert(created.mimeType === previewCase.mimeType, `Expected ${previewCase.mimeType} mime type.`);
    assert(created.sizeBytes === previewCase.bytes.byteLength, `Expected ${previewCase.mimeType} uploaded file size.`);
    createdAttachments.push(created as { id: string; fileName: string; mimeType: string; sizeBytes: number });
  }

  const list = await jsonRequest("/api/admin/attachments?petId=pet-admin&entryType=SYMPTOM&entryId=symptom-admin", 2001);
  assert(list.status === 200, `Expected list to succeed, got ${list.status}`);
  assert(Array.isArray(list.body), "Expected attachment list response to be an array.");
  assert(list.body.length === previewCases.length, `Expected ${previewCases.length} attachments, got ${list.body.length}`);

  const nonAdminFile = await fetch(`${baseUrl()}/api/admin/attachments/${createdAttachments[0].id}/file`, {
    headers: { Authorization: `tma ${signedInitData(2002)}` }
  });
  assert(nonAdminFile.status === 403, `Expected regular user file download to be rejected, got ${nonAdminFile.status}`);

  for (const [index, previewCase] of previewCases.entries()) {
    const created = createdAttachments[index];
    const file = await fetch(`${baseUrl()}/api/admin/attachments/${created.id}/file`, {
      headers: { Authorization: `tma ${signedInitData(2001)}` }
    });
    assert(file.status === 200, `Expected ${previewCase.mimeType} file download to succeed, got ${file.status}`);
    assert(file.headers.get("content-type") === previewCase.mimeType, `Expected Content-Type ${previewCase.mimeType}, got ${file.headers.get("content-type")}`);
    assert(file.headers.get("content-length") === String(previewCase.bytes.byteLength), `Expected Content-Length for ${previewCase.mimeType}.`);
    assert(file.headers.get("cache-control") === "private, no-store", "Expected private no-store cache policy.");
    assert(file.headers.get("content-disposition")?.startsWith("inline;"), "Expected inline content disposition.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    assert(bytes.byteLength === previewCase.bytes.byteLength, `Expected ${previewCase.mimeType} downloaded byte length.`);
    assert(bytes.every((byte, byteIndex) => byte === previewCase.bytes[byteIndex]), `Expected ${previewCase.mimeType} downloaded bytes to match upload.`);
  }

  for (const created of createdAttachments) {
    const remove = await fetch(`${baseUrl()}/api/admin/attachments/${created.id}`, {
      method: "DELETE",
      headers: { Authorization: `tma ${signedInitData(2001)}` }
    });
    assert(remove.status === 204, `Expected delete to succeed, got ${remove.status}`);
  }

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
