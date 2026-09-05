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

export const FRAPPE_BEARER_SETUP_HINT =
  "Frappe signed you in, but API calls with this token still run as Guest. In Desk → OAuth Client → ST Attendance MCP, set Scopes to exactly `all openid` on one line (a space, not two lines). Save, then Authenticate again in Inspector.";

function looksLikeJwt(token: string): boolean {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 8);
}

function extractErrorMessage(body: unknown, fallback: string): string {
  const root = asRecord(body);
  const fromMessages = parseServerMessages(root?._server_messages);
  if (fromMessages) {
    return fromMessages;
  }
  const exception = root?.exception;
  if (typeof exception === "string" && exception.trim()) {
    if (exception.includes("AuthenticationError")) {
      return FRAPPE_BEARER_SETUP_HINT;
    }
    const lastLine = exception.trim().split("\n").at(-1);
    return lastLine ?? exception;
  }
  if (typeof root?.message === "string" && root.message.trim()) {
    return root.message;
  }
  return fallback;
}

export function resolveFrappeAuth(ctx: AttendanceCtx): AuthHeader {
  const accessToken = ctx.auth?.accessToken?.trim();
  if (accessToken) {
    if (looksLikeJwt(accessToken)) {
      throw new FrappeAuthError(
        "Inspector sent an OpenID id_token. Frappe APIs need the opaque access_token. Authenticate again and allow access."
      );
    }
    return { Authorization: `Bearer ${accessToken}` };
  }
  if (env.apiKey && env.apiSecret) {
    return { Authorization: `token ${env.apiKey}:${env.apiSecret}` };
  }
  throw new FrappeAuthError(
    "Sign in with your Frappe account on the ERPNext login page (Google, or email and password), or set ERPNEXT_API_KEY and ERPNEXT_API_SECRET for local development."
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

function toFormBody(args: JsonRecord | undefined): URLSearchParams {
  const params = new URLSearchParams();
  if (!args) {
    return params;
  }
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined) {
      continue;
    }
    if (value === null) {
      params.set(key, "");
      continue;
    }
    if (typeof value === "object") {
      params.set(key, JSON.stringify(value));
      continue;
    }
    params.set(key, String(value));
  }
  return params;
}

function canUseGet(args: JsonRecord | undefined): boolean {
  if (!args) {
    return true;
  }
  for (const value of Object.values(args)) {
    if (value !== null && typeof value === "object") {
      return false;
    }
  }
  return toFormBody(args).toString().length < 1800;
}

function toMultipart(args: JsonRecord | undefined): FormData {
  const form = new FormData();
  for (const [key, value] of toFormBody(args).entries()) {
    form.append(key, value);
  }
  return form;
}

export async function callFrappeMethod<T = unknown>(
  method: string,
  args: JsonRecord | undefined,
  ctx: AttendanceCtx
): Promise<T> {
  const auth = resolveFrappeAuth(ctx);
  const params = toFormBody(args);
  const query = params.toString();
  // GET with no JSON/form body is the documented Frappe OAuth path.
  // Multipart POST is Frappe's special case: verify_request ignores the body.
  const response = canUseGet(args)
    ? await fetch(`${env.erpnextUrl}/api/method/${method}${query ? `?${query}` : ""}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...auth,
        },
        signal: ctx.signal,
      })
    : await fetch(`${env.erpnextUrl}/api/method/${method}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          ...auth,
        },
        body: toMultipart(args),
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
