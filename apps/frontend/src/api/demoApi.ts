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
};

const key = "petcare-demo-store";

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
    reminders: []
  };
  writeStore(store);
  return store;
}

function writeStore(store: DemoStore) {
  localStorage.setItem(key, JSON.stringify(store));
}

function jsonBody(options: RequestInit) {
  return options.body ? JSON.parse(String(options.body)) as Record<string, unknown> : {};
}

function collectionFor(path: string): keyof Pick<DemoStore, "feeding" | "symptoms" | "medicines" | "weights" | "notes" | "reminders"> | null {
  if (path.startsWith("/api/feeding")) return "feeding";
  if (path.startsWith("/api/symptoms/analytics")) return null;
  if (path.startsWith("/api/symptoms")) return "symptoms";
  if (path.startsWith("/api/medicines")) return "medicines";
  if (path.startsWith("/api/weights")) return "weights";
  if (path.startsWith("/api/notes")) return "notes";
  if (path.startsWith("/api/reminders")) return "reminders";
  return null;
}

function dateFieldFor(collection: keyof Pick<DemoStore, "feeding" | "symptoms" | "medicines" | "weights" | "notes" | "reminders">) {
  return collection === "weights" ? "date" : collection === "reminders" ? "time" : "dateTime";
}

function filterByQuery(path: string, collection: keyof Pick<DemoStore, "feeding" | "symptoms" | "medicines" | "weights" | "notes" | "reminders">, items: Record<string, unknown>[]) {
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
    return (telegramId ? users.filter((user) => String(user.telegramId) === telegramId) : users) as T;
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
    const pet = { id: uid(), ...jsonBody(options), createdAt: new Date().toISOString() };
    store.pets = [...(store.pets ?? []), pet];
    store.pet = pet;
    writeStore(store);
    return pet as T;
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
      notes: store.notes.length
    };
    return {
      counts,
      html: `<section><h2>Demo report</h2><p>Feedings: ${counts.feeding}</p><p>Symptoms: ${counts.symptoms}</p><p>Medicines: ${counts.medicines}</p><p>Weight records: ${counts.weights}</p><p>Other notes: ${counts.notes}</p></section>`
    } as T;
  }

  if (path === "/api/payments/create-invoice") {
    return { invoiceLink: "https://t.me/$demo-invoice", amountStars: 199 } as T;
  }

  throw new Error(`Demo API route is not implemented: ${method} ${path}`);
}
