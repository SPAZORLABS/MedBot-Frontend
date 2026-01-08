import { getToken } from "@/lib/auth";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export async function apiFetch<T>(
  path: string,
  opts: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const headers = new Headers(opts.headers || {});
  const token = typeof window !== "undefined" ? getToken() : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let body = opts.body;
  if (opts.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(opts.json);
  }

  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers,
    body
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}


