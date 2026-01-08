import { getToken } from "@/lib/auth";

function normalizeBaseUrl(raw: string): string {
  let v = (raw || "").trim();
  if (!v) return "http://localhost:8000";
  // If user set it like "medbot-backend....up.railway.app", auto-prefix https://
  if (!v.startsWith("http://") && !v.startsWith("https://")) {
    v = `https://${v}`;
  }
  // Remove trailing slash to avoid double slashes in requests
  if (v.endsWith("/")) v = v.slice(0, -1);
  return v;
}

const BASE = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL || "");

export class ApiError extends Error {
  status: number;
  detail?: string;
  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

function formatFastApiValidation(detail: any): string | null {
  // FastAPI 422 format: { detail: [{ loc: [...], msg: "...", type: "..." }, ...] }
  if (!Array.isArray(detail)) return null;
  const first = detail[0];
  if (!first) return null;
  const loc = Array.isArray(first.loc) ? first.loc.join(".") : "";
  const msg = typeof first.msg === "string" ? first.msg : "Invalid input";
  return loc ? `${msg} (${loc})` : msg;
}

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
    const contentType = res.headers.get("content-type") || "";
    // Prefer JSON error payloads (FastAPI uses {"detail": "..."}).
    if (contentType.includes("application/json")) {
      try {
        const data: any = await res.json();
        const detail =
          typeof data?.detail === "string"
            ? data.detail
            : Array.isArray(data?.detail)
              ? formatFastApiValidation(data.detail) || undefined
            : typeof data?.message === "string"
              ? data.message
              : undefined;
        throw new ApiError(detail || `Request failed (${res.status})`, res.status, detail);
      } catch {
        // Fall through to text parsing
      }
    }

    const text = await res.text().catch(() => "");
    // If server returned an HTML page (e.g. 404), don't dump it into the UI.
    if (text.trim().startsWith("<!DOCTYPE html") || contentType.includes("text/html")) {
      throw new ApiError(`Request failed (${res.status})`, res.status);
    }
    const msg = text.length > 200 ? `${text.slice(0, 200)}…` : text;
    throw new ApiError(msg || `Request failed (${res.status})`, res.status);
  }
  return (await res.json()) as T;
}


