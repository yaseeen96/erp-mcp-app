import { env } from "./env.js";
import type { AttendanceCtx, JsonRecord } from "./types.js";

export class FrappeRequestError extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "FrappeRequestError";
    this.status = status;
  }
}

export class FrappeAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrappeAuthError";
  }
}

type AuthHeader = {
  Authorization: string;
};

function asRecord(value: unknown): JsonRecord | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  return undefined;
}

function parseServerMessages(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw.trim()) {
    return undefined;
  }
  try {
    const items = JSON.parse(raw) as unknown;
    if (!Array.isArray(items)) {
      return raw;
    }
    const parts = items
      .map((item) => {
        if (typeof item !== "string") {
          return undefined;
        }
        try {
          const parsed = JSON.parse(item) as JsonRecord;
          return typeof parsed.message === "string" ? parsed.message : item;
        } catch {
          return item;
        }
      })
      .filter((item): item is string => Boolean(item));
    return parts.length ? parts.join(" ") : undefined;
  } catch {
    return raw;
  }
}

function extractErrorMessage(body: unknown, fallback: string): string {
  const root = asRecord(body);
  const fromMessages = parseServerMessages(root?._server_messages);
  if (fromMessages) {
    return fromMessages;
  }
  const exception = root?.exception;
  if (typeof exception === "string" && exception.trim()) {
    const lastLine = exception.trim().split("\n").at(-1);
    return lastLine ?? exception;
  }
  if (typeof root?.message === "string" && root.message.trim()) {
    return root.message;
  }
  return fallback;
}

export function resolveFrappeAuth(ctx: AttendanceCtx): AuthHeader {
  const accessToken = ctx.auth?.accessToken;
  if (accessToken) {
    return { Authorization: `Bearer ${accessToken}` };
  }
  if (env.apiKey && env.apiSecret) {
    return { Authorization: `token ${env.apiKey}:${env.apiSecret}` };
  }
  throw new FrappeAuthError(
    "Sign in with your Frappe account (Login with Google on the ERPNext login page), or set ERPNEXT_API_KEY and ERPNEXT_API_SECRET for local development."
  );
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

export async function callFrappeMethod<T = unknown>(
  method: string,
  args: JsonRecord | undefined,
  ctx: AttendanceCtx
): Promise<T> {
  const auth = resolveFrappeAuth(ctx);
  const response = await fetch(`${env.erpnextUrl}/api/method/${method}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...auth,
    },
    body: JSON.stringify(args ?? {}),
    signal: ctx.signal,
  });
  const body = await readBody(response);
  if (!response.ok) {
    throw new FrappeRequestError(
      extractErrorMessage(body, `ERPNext request failed (${response.status})`),
      response.status
    );
  }
  const root = asRecord(body);
  if (root && ("exc" in root || "exc_type" in root) && root.message === undefined) {
    throw new FrappeRequestError(extractErrorMessage(body, "ERPNext request failed"));
  }
  return (root && "message" in root ? root.message : body) as T;
}

export function siteUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${env.erpnextUrl}${suffix}`;
}
