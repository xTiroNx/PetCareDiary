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
process.env.ATTACHMENTS_LOCAL_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "petcare-avatar-smoke-"));
process.env.ATTACHMENTS_MAX_FILE_MB = "1";

const [{ createApp }, { prisma }] = await Promise.all([
  import("../src/app.js"),
  import("../src/prisma/client.js")
]);

const now = new Date("2026-05-17T12:00:00.000Z");
const users = new Map([
  [3001n, {
    id: "user-owner",
    telegramId: 3001n,
    username: "owner",
    firstName: "Owner",
    lastName: "User",
    languageCode: "en",
    createdAt: now,
    updatedAt: now,
    trialStartedAt: now,
    trialEndsAt: new Date(now.getTime() + 86_400_000),
    accessUntil: null,
    lifetimeAccess: false
  }],
  [3002n, {
    id: "user-other",
    telegramId: 3002n,
    username: "other",
    firstName: "Other",
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

type PetRecord = {
  id: string;
  userId: string;
  name: string;
  type: "CAT" | "DOG" | "OTHER";
  weightKg: null;
  ageYears: null;
  healthNotes: null;
  avatarStorageKey: string | null;
  avatarMimeType: string | null;
  avatarFileName: string | null;
  avatarSizeBytes: number | null;
  avatarUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const pets: PetRecord[] = [
  {
    id: "pet-owner",
    userId: "user-owner",
    name: "Milo",
    type: "CAT",
    weightKg: null,
    ageYears: null,
    healthNotes: null,
    avatarStorageKey: null,
    avatarMimeType: null,
    avatarFileName: null,
    avatarSizeBytes: null,
    avatarUpdatedAt: null,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "pet-other",
    userId: "user-other",
    name: "Luna",
    type: "DOG",
    weightKg: null,
    ageYears: null,
    healthNotes: null,
    avatarStorageKey: null,
    avatarMimeType: null,
    avatarFileName: null,
    avatarSizeBytes: null,
    avatarUpdatedAt: null,
    createdAt: now,
    updatedAt: now
  }
];

(prisma.user.findUnique as unknown as (args: unknown) => Promise<unknown>) = async (args: unknown) => {
  const telegramId = (args as { where?: { telegramId?: bigint } }).where?.telegramId;
  return telegramId ? users.get(telegramId) ?? null : null;
};

(prisma.pet.findMany as unknown as (args: unknown) => Promise<PetRecord[]>) = async (args: unknown) => {
  const userId = (args as { where?: { userId?: string } }).where?.userId;
  return pets.filter((pet) => pet.userId === userId);
};

(prisma.pet.findFirst as unknown as (args: unknown) => Promise<PetRecord | null>) = async (args: unknown) => {
  const where = (args as { where?: { id?: string; userId?: string } }).where;
  return pets.find((pet) => pet.id === where?.id && pet.userId === where.userId) ?? null;
};

(prisma.pet.update as unknown as (args: unknown) => Promise<PetRecord>) = async (args: unknown) => {
  const { where, data } = args as { where?: { id?: string }; data?: Partial<PetRecord> };
  const pet = pets.find((item) => item.id === where?.id);
  if (!pet) throw new Error("Pet was not found in smoke store.");
  Object.assign(pet, data, { updatedAt: now });
  return pet;
};

(prisma.pet.delete as unknown as (args: unknown) => Promise<PetRecord>) = async (args: unknown) => {
  const id = (args as { where?: { id?: string } }).where?.id;
  const index = pets.findIndex((pet) => pet.id === id);
  if (index < 0) throw new Error("Pet was not found in smoke store.");
  return pets.splice(index, 1)[0];
};

const app = createApp();
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve, reject) => {
  server.once("listening", resolve);
  server.once("error", reject);
});

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function signedInitData(telegramId: number) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `pet-avatar-smoke-${telegramId}`,
    user: JSON.stringify({ id: telegramId, first_name: "Avatar", language_code: "en" })
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

function avatarForm(file: { mimeType: string; fileName: string; bytes: Uint8Array }) {
  const form = new FormData();
  form.set("file", new Blob([file.bytes], { type: file.mimeType }), file.fileName);
  return form;
}

function avatarPath(storageKey: string) {
  return path.resolve(process.env.ATTACHMENTS_LOCAL_DIR!, storageKey);
}

async function fileExists(storageKey: string | null) {
  if (!storageKey) return false;
  try {
    await fs.access(avatarPath(storageKey));
    return true;
  } catch {
    return false;
  }
}

async function uploadAvatar(petId: string, telegramId: number, file: { mimeType: string; fileName: string; bytes: Uint8Array }) {
  return fetch(`${baseUrl()}/api/pets/${petId}/avatar`, {
    method: "POST",
    headers: { Authorization: `tma ${signedInitData(telegramId)}` },
    body: avatarForm(file)
  });
}

try {
  const jpeg = { mimeType: "image/jpeg", fileName: "avatar.jpg", bytes: new Uint8Array([255, 216, 255, 224, 1]) };
  const webp = { mimeType: "image/webp", fileName: "avatar.webp", bytes: new Uint8Array([82, 73, 70, 70, 1, 87, 69, 66, 80]) };

  const upload = await uploadAvatar("pet-owner", 3001, jpeg);
  assert(upload.status === 201, `Expected avatar upload to succeed, got ${upload.status}`);
  const uploaded = await upload.json() as { hasAvatar?: boolean; avatarUpdatedAt?: string; avatarStorageKey?: string };
  assert(uploaded.hasAvatar === true, "Expected hasAvatar=true after upload.");
  assert(typeof uploaded.avatarUpdatedAt === "string", "Expected avatarUpdatedAt after upload.");
  assert(!("avatarStorageKey" in uploaded), "Expected storage key to stay private.");
  const firstStorageKey = pets[0].avatarStorageKey;
  assert(await fileExists(firstStorageKey), "Expected uploaded avatar file to exist.");

  const list = await fetch(`${baseUrl()}/api/pets`, {
    headers: { Authorization: `tma ${signedInitData(3001)}` }
  });
  assert(list.status === 200, `Expected pet list to succeed, got ${list.status}`);
  const listedPets = await list.json() as Array<{ hasAvatar?: boolean; avatarUpdatedAt?: string; avatarStorageKey?: string }>;
  assert(listedPets[0]?.hasAvatar === true, "Expected pet list to expose hasAvatar.");
  assert(typeof listedPets[0]?.avatarUpdatedAt === "string", "Expected pet list to expose avatarUpdatedAt.");
  assert(!("avatarStorageKey" in listedPets[0]), "Expected pet list to hide avatarStorageKey.");

  const file = await fetch(`${baseUrl()}/api/pets/pet-owner/avatar/file`, {
    headers: { Authorization: `tma ${signedInitData(3001)}` }
  });
  assert(file.status === 200, `Expected avatar file download to succeed, got ${file.status}`);
  assert(file.headers.get("content-type") === jpeg.mimeType, "Expected avatar Content-Type.");
  assert(file.headers.get("content-length") === String(jpeg.bytes.byteLength), "Expected avatar Content-Length.");
  assert(file.headers.get("cache-control") === "private, no-store", "Expected private no-store cache policy.");
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  assert(fileBytes.every((byte, index) => byte === jpeg.bytes[index]), "Expected avatar bytes to match upload.");

  const foreignGet = await fetch(`${baseUrl()}/api/pets/pet-other/avatar/file`, {
    headers: { Authorization: `tma ${signedInitData(3001)}` }
  });
  assert(foreignGet.status === 404, `Expected foreign pet avatar file to be rejected, got ${foreignGet.status}`);

  const replace = await uploadAvatar("pet-owner", 3001, webp);
  assert(replace.status === 201, `Expected avatar replace to succeed, got ${replace.status}`);
  const secondStorageKey = pets[0].avatarStorageKey;
  assert(secondStorageKey && secondStorageKey !== firstStorageKey, "Expected replacement to use a new storage key.");
  assert(!(await fileExists(firstStorageKey)), "Expected old avatar file to be removed after replacement.");
  assert(await fileExists(secondStorageKey), "Expected replacement avatar file to exist.");

  const unsupported = await uploadAvatar("pet-owner", 3001, {
    mimeType: "text/plain",
    fileName: "avatar.txt",
    bytes: new TextEncoder().encode("not an image")
  });
  assert(unsupported.status === 400, `Expected unsupported avatar file to be rejected, got ${unsupported.status}`);

  const oversized = await uploadAvatar("pet-owner", 3001, {
    mimeType: "image/png",
    fileName: "huge.png",
    bytes: new Uint8Array(1024 * 1024 + 1)
  });
  assert(oversized.status === 413, `Expected oversized avatar file to be rejected, got ${oversized.status}`);

  const foreignUpload = await uploadAvatar("pet-other", 3001, jpeg);
  assert(foreignUpload.status === 404, `Expected foreign pet avatar upload to be rejected, got ${foreignUpload.status}`);

  const remove = await fetch(`${baseUrl()}/api/pets/pet-owner/avatar`, {
    method: "DELETE",
    headers: { Authorization: `tma ${signedInitData(3001)}` }
  });
  assert(remove.status === 204, `Expected avatar delete to succeed, got ${remove.status}`);
  assert(!(await fileExists(secondStorageKey)), "Expected avatar file to be removed after DELETE.");
  assert(pets[0].avatarStorageKey === null, "Expected avatar storage key to be cleared.");

  const uploadBeforePetDelete = await uploadAvatar("pet-owner", 3001, jpeg);
  assert(uploadBeforePetDelete.status === 201, `Expected avatar upload before pet delete to succeed, got ${uploadBeforePetDelete.status}`);
  const deleteStorageKey = pets[0].avatarStorageKey;
  const deletePet = await fetch(`${baseUrl()}/api/pets/pet-owner`, {
    method: "DELETE",
    headers: { Authorization: `tma ${signedInitData(3001)}` }
  });
  assert(deletePet.status === 204, `Expected pet delete to succeed, got ${deletePet.status}`);
  assert(!(await fileExists(deleteStorageKey)), "Expected avatar file to be removed after pet delete.");

  console.log("Pet avatar smoke checks passed.");
} finally {
  server.close();
  await fs.rm(process.env.ATTACHMENTS_LOCAL_DIR!, { recursive: true, force: true });
}
