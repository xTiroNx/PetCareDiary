import { getInitData } from "../utils/telegram";
import { demoApi } from "./demoApi";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const DEMO_MODE = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === "true";

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (DEMO_MODE) return demoApi<T>(path, options);

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": getInitData(),
      ...options.headers
    }
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const error = new Error(payload?.error?.message ?? "Request failed") as Error & { code?: string; status?: number };
    error.code = payload?.error?.code;
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function apiBlob(path: string, options: RequestInit = {}): Promise<Blob> {
  if (DEMO_MODE) return demoApi<Blob>(path, options);

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "X-Telegram-Init-Data": getInitData(),
      ...options.headers
    }
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const error = new Error(payload?.error?.message ?? "Request failed") as Error & { code?: string; status?: number };
    error.code = payload?.error?.code;
    error.status = response.status;
    throw error;
  }

  return response.blob();
}

export function jsonBody(value: unknown) {
  return JSON.stringify(value);
}
