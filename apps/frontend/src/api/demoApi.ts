type DemoStore = {
  user: Record<string, unknown>;
  pet: Record<string, unknown> | null;
  pets?: Record<string, unknown>[];
  adminUsers?: Record<string, unknown>[];
  reportExports?: Record<string, number>;
  feeding: Record<string, unknown>[];
  symptoms: Record<string, unknown>[];
  medicines: Record<string, unknown>[];
  weights: Record<string, unknown>[];
  notes: Record<string, unknown>[];
  reminders: Record<string, unknown>[];
  water: Record<string, unknown>[];
  vaccinations: Record<string, unknown>[];
  attachments: Record<string, unknown>[];
};

const key = "petcare-demo-store";
const demoAttachmentFiles = new Map<string, Blob>();
const demoPetAvatarFiles = new Map<string, Blob>();

function uid() {
  return crypto.randomUUID();
}

function readStore(): DemoStore {
  const existing = localStorage.getItem(key);
  if (existing) {
    const parsed = JSON.parse(existing) as DemoStore;
    parsed.feeding ??= [];
    parsed.symptoms ??= [];
    parsed.medicines ??= [];
    parsed.weights ??= [];
    parsed.notes ??= [];
    parsed.reminders ??= [];
    parsed.water ??= [];
    parsed.vaccinations ??= [];
    parsed.attachments ??= [];
    parsed.water = parsed.water.map((item) => item.amountMl === undefined && item.volumeMl !== undefined ? { ...item, amountMl: item.volumeMl } : item);
    parsed.vaccinations = parsed.vaccinations.map((item) => item.date === undefined && item.procedureDate !== undefined ? { ...item, date: item.procedureDate } : item);
    parsed.adminUsers ??= [];
    parsed.reportExports ??= {};
    parsed.pets ??= parsed.pet ? [parsed.pet] : [];
    parsed.pet = parsed.pets[0] ?? null;
    return parsed;
  }

  const now = new Date();
  const store: DemoStore = {
    user: {
      id: "demo-user",
      telegramId: "777000001",
      firstName: "Dev",
      trialEndsAt: new Date(now.getTime() + 3 * 86400000).toISOString(),
      accessUntil: null,
      lifetimeAccess: false,
      isAdmin: true
    },
    pet: null,
    pets: [],
    adminUsers: [
      {
        id: "demo-user-target",
        telegramId: "100200300",
        firstName: "Test user",
        username: "pet_parent",
        trialEndsAt: new Date(now.getTime() + 86400000).toISOString(),
        accessUntil: null,
        lifetimeAccess: false,
        createdAt: now.toISOString(),
        accessStatus: "trial",
        accessEndsAt: new Date(now.getTime() + 86400000).toISOString(),
        pet: { id: "demo-pet-target", name: "Buddy", type: "DOG" }
      }
    ],
    reportExports: {},
    feeding: [],
    symptoms: [],
    medicines: [],
    weights: [],
    notes: [],
    reminders: [],
    water: [],
    vaccinations: [],
    attachments: []
  };
  writeStore(store);
  return store;
}

function writeStore(store: DemoStore) {
  localStorage.setItem(key, JSON.stringify(store));
}

function demoPngBlob() {
  const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: "image/png" });
}

function jsonBody(options: RequestInit) {
  return options.body ? JSON.parse(String(options.body)) as Record<string, unknown> : {};
}

function collectionFor(path: string): keyof Pick<DemoStore, "feeding" | "symptoms" | "medicines" | "weights" | "notes" | "reminders" | "water" | "vaccinations"> | null {
  if (path.startsWith("/api/feeding")) return "feeding";
  if (path.startsWith("/api/water/analytics")) return null;
  if (path.startsWith("/api/water")) return "water";
  if (path.startsWith("/api/vaccinations")) return "vaccinations";
  if (path.startsWith("/api/symptoms/analytics")) return null;
  if (path.startsWith("/api/symptoms")) return "symptoms";
  if (path.startsWith("/api/medicines")) return "medicines";
  if (path.startsWith("/api/weights")) return "weights";
  if (path.startsWith("/api/notes")) return "notes";
  if (path.startsWith("/api/reminders")) return "reminders";
  return null;
}

function dateFieldFor(collection: keyof Pick<DemoStore, "feeding" | "symptoms" | "medicines" | "weights" | "notes" | "reminders" | "water" | "vaccinations">) {
  return collection === "weights" || collection === "vaccinations" ? "date" : collection === "reminders" ? "time" : "dateTime";
}

function filterByQuery(path: string, collection: keyof Pick<DemoStore, "feeding" | "symptoms" | "medicines" | "weights" | "notes" | "reminders" | "water" | "vaccinations">, items: Record<string, unknown>[]) {
  const url = new URL(path, "http://demo.local");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const field = dateFieldFor(collection);

  return items.filter((item) => {
    const rawDate = item[field];
    if (!rawDate) return true;
    const time = new Date(String(rawDate)).getTime();
    if (from && time < new Date(from).getTime()) return false;
    if (to && time > new Date(to).getTime()) return false;
    return true;
  });
}

export async function demoApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const store = readStore();
  const method = options.method ?? "GET";

  if (path === "/api/auth/telegram") {
    return {
      user: store.user,
      pet: store.pet,
      pets: store.pets ?? (store.pet ? [store.pet] : []),
      isAdmin: true,
      accessStatus: "admin",
      accessEndsAt: null
    } as T;
  }

  if (path.startsWith("/api/admin/users") && method === "GET") {
    const url = new URL(path, "http://demo.local");
    const telegramId = url.searchParams.get("telegramId");
    const currentAdmin: Record<string, unknown> = {
      ...store.user,
      createdAt: new Date().toISOString(),
      accessStatus: "admin",
      accessEndsAt: null,
      pet: store.pet
    };
    const users = [currentAdmin, ...(store.adminUsers ?? [])];
    return { items: telegramId ? users.filter((user) => String(user.telegramId) === telegramId) : users, nextOffset: null } as T;
  }

  if (path.startsWith("/api/admin/attachments") || path.startsWith("/api/attachments")) {
    const url = new URL(path, "http://demo.local");
    const segments = url.pathname.split("/").filter(Boolean);
    const attachmentBaseIndex = segments[1] === "admin" ? 2 : 1;
    const attachmentId = segments[attachmentBaseIndex + 1];

    if (method === "GET" && segments[attachmentBaseIndex + 2] === "file") {
      const attachment = store.attachments.find((item) => item.id === attachmentId);
      if (!attachment) throw new Error("Attachment not found.");
      return (demoAttachmentFiles.get(String(attachmentId)) ?? new Blob(["demo attachment"], { type: String(attachment.mimeType || "application/octet-stream") })) as T;
    }

    if (method === "DELETE") {
      store.attachments = store.attachments.filter((item) => item.id !== attachmentId);
      demoAttachmentFiles.delete(String(attachmentId));
      writeStore(store);
      return undefined as T;
    }

    if (method === "POST") {
      const form = options.body instanceof FormData ? options.body : null;
      const file = form?.get("file");
      if (!form || !(file instanceof Blob)) throw new Error("Attachment file is required.");
      const id = uid();
      const attachment = {
        id,
        petId: String(form.get("petId") ?? ""),
        entryType: String(form.get("entryType") ?? ""),
        entryId: String(form.get("entryId") ?? ""),
        fileName: "name" in file && typeof file.name === "string" ? file.name : "attachment",
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        createdAt: new Date().toISOString()
      };
      store.attachments.unshift(attachment);
      demoAttachmentFiles.set(id, file);
      writeStore(store);
      return attachment as T;
    }

    return store.attachments.filter((item) => {
      return item.petId === url.searchParams.get("petId")
        && item.entryType === url.searchParams.get("entryType")
        && item.entryId === url.searchParams.get("entryId");
    }) as T;
  }

  if (path.startsWith("/api/admin/users/") && path.endsWith("/access") && method === "PATCH") {
    const id = path.split("/")[4];
    const body = jsonBody(options);
    const target = [store.user, ...(store.adminUsers ?? [])].find((user) => user.id === id);
    if (!target) throw new Error("User not found.");
    const now = new Date();
    if (body.mode === "MONTHLY") {
      const base = target.accessUntil && new Date(String(target.accessUntil)) > now ? new Date(String(target.accessUntil)) : now;
      target.accessUntil = new Date(base.getTime() + Number(body.days ?? 30) * 86400000).toISOString();
      target.accessStatus = "active_monthly";
      target.accessEndsAt = target.accessUntil;
    }
    if (body.mode === "LIFETIME") {
      target.lifetimeAccess = true;
      target.accessStatus = "lifetime";
      target.accessEndsAt = null;
    }
    if (body.mode === "REVOKE_PAID") {
      target.lifetimeAccess = false;
      target.accessUntil = null;
      target.accessStatus = new Date(String(target.trialEndsAt)) > now ? "trial" : "expired";
      target.accessEndsAt = target.accessStatus === "trial" ? target.trialEndsAt : null;
    }
    if (body.mode === "EXPIRE_ALL") {
      target.lifetimeAccess = false;
      target.accessUntil = null;
      target.trialEndsAt = now.toISOString();
      target.accessStatus = "expired";
      target.accessEndsAt = null;
    }
    writeStore(store);
    return target as T;
  }

  if (path === "/api/pets" && method === "POST") {
    const pet = { id: uid(), ...jsonBody(options), hasAvatar: false, avatarUpdatedAt: null, createdAt: new Date().toISOString() };
    store.pets = [...(store.pets ?? []), pet];
    store.pet = pet;
    writeStore(store);
    return pet as T;
  }

  if (path === "/api/pets/onboarding-progress") {
    const hasDiaryEntry = [store.feeding, store.symptoms, store.medicines, store.weights, store.notes, store.water, store.vaccinations]
      .some((items) => items.length > 0);
    return { hasPet: Boolean(store.pet), hasDiaryEntry, hasReminder: store.reminders.length > 0 } as T;
  }

  if (path.startsWith("/api/pets/") && path.includes("/avatar")) {
    const url = new URL(path, "http://demo.local");
    const segments = url.pathname.split("/").filter(Boolean);
    const petId = segments[2];
    const targetPet = (store.pets ?? []).find((item) => item.id === petId) ?? (store.pet?.id === petId ? store.pet : null);
    if (!targetPet) throw new Error("Pet not found.");

    if (method === "GET" && segments[4] === "file") {
      return (demoPetAvatarFiles.get(petId) ?? demoPngBlob()) as T;
    }

    if (method === "POST") {
      const form = options.body instanceof FormData ? options.body : null;
      const file = form?.get("file");
      if (!form || !(file instanceof Blob)) throw new Error("Avatar file is required.");
      demoPetAvatarFiles.set(petId, file);
      Object.assign(targetPet, { hasAvatar: true, avatarUpdatedAt: new Date().toISOString() });
      if (store.pet?.id === petId) store.pet = targetPet;
      store.pets = (store.pets ?? []).map((item) => item.id === petId ? targetPet : item);
      writeStore(store);
      return targetPet as T;
    }

    if (method === "DELETE") {
      demoPetAvatarFiles.delete(petId);
      Object.assign(targetPet, { hasAvatar: false, avatarUpdatedAt: null });
      if (store.pet?.id === petId) store.pet = targetPet;
      store.pets = (store.pets ?? []).map((item) => item.id === petId ? targetPet : item);
      writeStore(store);
      return targetPet as T;
    }
  }

  if (path === "/api/pets") return (store.pets ?? [store.pet].filter(Boolean)) as T;

  const collection = collectionFor(path);
  if (collection && method === "POST") {
    const item = { id: uid(), ...jsonBody(options), createdAt: new Date().toISOString() };
    store[collection].unshift(item);
    writeStore(store);
    return item as T;
  }

  if (collection && method === "DELETE") {
    const id = path.split("?")[0].split("/").filter(Boolean).at(-1);
    store[collection] = store[collection].filter((item) => item.id !== id);
    writeStore(store);
    return undefined as T;
  }

  if (path.includes("/taken") && method === "PATCH") {
    const id = path.split("/")[3];
    const item = store.medicines.find((entry) => entry.id === id);
    if (item) Object.assign(item, jsonBody(options));
    writeStore(store);
    return item as T;
  }

  if (collection && method === "PATCH") {
    const id = path.split("?")[0].split("/").filter(Boolean).at(-1);
    const item = store[collection].find((entry) => entry.id === id);
    if (item) Object.assign(item, jsonBody(options));
    writeStore(store);
    return item as T;
  }

  if (collection && method === "GET") return filterByQuery(path, collection, store[collection]) as T;

  if (path.startsWith("/api/symptoms/analytics")) {
    const since = Date.now() - 7 * 86400000;
    const counts = store.symptoms.reduce<Record<string, number>>((acc, item) => {
      if (new Date(String(item.dateTime)).getTime() >= since) {
        const type = String(item.symptomType);
        acc[type] = (acc[type] ?? 0) + 1;
      }
      return acc;
    }, {});
    return Object.entries(counts).map(([symptomType, count]) => ({ symptomType, count })) as T;
  }

  if (path.startsWith("/api/water/analytics")) {
    const url = new URL(path, "http://demo.local");
    const days = Number(url.searchParams.get("days") ?? 7);
    const since = Date.now() - days * 86400000;
    const items = (store.water ?? []).filter((item) => new Date(String(item.dateTime)).getTime() >= since);
    const totalMl = items.reduce((sum, item) => sum + Number(item.amountMl ?? item.volumeMl ?? 0), 0);
    return { totalMl, averageMl: Math.round(totalMl / Math.max(1, days)), entriesCount: items.length, days, byDay: [] } as T;
  }

  if (path.startsWith("/api/reports/exports/status")) {
    const today = new Date().toISOString().slice(0, 10);
    const usedToday = store.reportExports?.[today] ?? 0;
    return { usedToday, limit: 3, remaining: Math.max(0, 3 - usedToday) } as T;
  }

  if (path.startsWith("/api/reports/summary.pdf")) {
    const today = new Date().toISOString().slice(0, 10);
    const usedToday = store.reportExports?.[today] ?? 0;
    if (usedToday >= 3) {
      const error = new Error("Daily report export limit reached.") as Error & { code?: string; status?: number };
      error.code = "REPORT_EXPORT_LIMIT_REACHED";
      error.status = 429;
      throw error;
    }
    store.reportExports = { ...(store.reportExports ?? {}), [today]: usedToday + 1 };
    writeStore(store);
    const html = `<!doctype html><html><body><h1>PetCare Diary Report</h1><p>Demo PDF export file</p></body></html>`;
    return new Blob([html], { type: "text/html;charset=utf-8" }) as T;
  }

  if (path.startsWith("/api/reports/summary")) {
    const counts = {
      feeding: store.feeding.length,
      symptoms: store.symptoms.length,
      medicines: store.medicines.length,
      weights: store.weights.length,
      notes: store.notes.length,
      water: store.water?.length ?? 0,
      vaccinations: store.vaccinations?.length ?? 0
    };
    return {
      counts,
      html: `<section><h2>Demo report</h2><p>Feedings: ${counts.feeding}</p><p>Symptoms: ${counts.symptoms}</p><p>Medicines: ${counts.medicines}</p><p>Weight records: ${counts.weights}</p><p>Other notes: ${counts.notes}</p></section>`
    } as T;
  }

  if (path === "/api/payments/create-invoice") {
    const body = jsonBody(options);
    const amounts: Record<string, number> = { MONTHLY: 149, SIX_MONTHS: 699, YEARLY: 1199, ADMIN_TEST_DAY: 1 };
    return { invoiceLink: "https://t.me/$demo-invoice", amountStars: amounts[String(body.productType)] ?? 149 } as T;
  }

  if (path === "/api/ai/assistant") {
    return {
      answer: "Demo AI summary: recent records are grouped for easier review. This is not a diagnosis.",
      disclaimer: "AI helper structures information and does not replace a veterinarian."
    } as T;
  }

  if (path === "/api/feedback" && method === "POST") {
    return { id: uid(), ok: true } as T;
  }

  if (path === "/api/analytics/event") {
    return { ok: true } as T;
  }

  if (path.startsWith("/api/admin/analytics/summary")) {
    return {
      period: new URL(path, "http://demo.local").searchParams.get("period") ?? "30d",
      from: new Date(Date.now() - 30 * 86400000).toISOString(),
      to: new Date().toISOString(),
      totals: { users: 50, usersWithPets: 20, usersWithEntries: 8, activePaidUsers: 0, paymentsCount: 0, paymentsStars: 0 },
      funnel: [
        { key: "app_opened", label: "Opened app", count: 50, conversionFromPrevious: null },
        { key: "pet_created", label: "Created pet", count: 20, conversionFromPrevious: 40 },
        { key: "first_entry_created", label: "Created first entry", count: 8, conversionFromPrevious: 40 },
        { key: "paywall_opened", label: "Opened paywall", count: 3, conversionFromPrevious: 37.5 },
        { key: "invoice_opened", label: "Opened invoice", count: 1, conversionFromPrevious: 33.3 },
        { key: "payment_success", label: "Paid", count: 0, conversionFromPrevious: 0 }
      ],
      eventsByDay: [{ date: new Date().toISOString().slice(0, 10), app_opened: 10, pet_created: 4, first_entry_created: 2, paywall_opened: 1, payment_success: 0 }],
      topEvents: [{ event: "app_opened", count: 50 }, { event: "pet_created", count: 20 }],
      breakdowns: {
        languages: [{ languageCode: "ru", users: 30, appOpened: 30, petCreated: 12, firstEntryCreated: 5, paywallOpened: 2, invoiceOpened: 0, paymentSuccess: 0, petConversion: 40, firstEntryConversion: 16.7, paymentConversion: 0 }],
        platforms: [{ platform: "ios", users: 20, petCreated: 8, firstEntryCreated: 3, paymentSuccess: 0, petConversion: 40 }],
        sources: [
          { source: "aff_en", startParam: "aff_en", users: 20, petCreated: 1, firstEntryCreated: 1, paywallOpened: 0, invoiceOpened: 0, paymentSuccess: 0, petConversion: 5, paymentConversion: 0 },
          { source: "aff_ru", startParam: "aff_ru", users: 10, petCreated: 6, firstEntryCreated: 3, paywallOpened: 1, invoiceOpened: 0, paymentSuccess: 0, petConversion: 60, paymentConversion: 0 }
        ]
      }
    } as T;
  }

  if (path.startsWith("/api/admin/analytics/events")) {
    return {
      events: [
        { createdAt: new Date().toISOString(), event: "app_opened", userId: "demo-user", telegramId: "777000001", languageCode: "ru", platform: "ios", startParam: "aff_ru", source: "aff_ru", metadata: { path: "/" } }
      ]
    } as T;
  }

  throw new Error(`Demo API route is not implemented: ${method} ${path}`);
}
