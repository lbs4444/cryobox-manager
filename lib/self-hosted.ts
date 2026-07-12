import type { InventoryState } from "./types";

type User = { id: string; email: string };

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) {
    const error = new Error(body.error || "请求失败") as Error & { status?: number; body?: T };
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

export async function getSelfHostedSession() {
  return jsonRequest<{ user: User | null }>("/api/auth/session", { cache: "no-store" });
}

export async function selfHostedLogin(email: string, password: string) {
  return jsonRequest<{ user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export async function selfHostedRegister(email: string, password: string) {
  return jsonRequest<{ user: User }>("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password }) });
}

export async function selfHostedLogout() {
  await jsonRequest<{ ok: true }>("/api/auth/logout", { method: "POST" });
}

export async function loadSelfHostedState() {
  return jsonRequest<{ state: InventoryState; version: number; user: User }>("/api/inventory", { cache: "no-store" });
}

export async function saveSelfHostedState(state: InventoryState, version: number) {
  return jsonRequest<{ version: number }>("/api/inventory", { method: "PUT", body: JSON.stringify({ state, version }) });
}

