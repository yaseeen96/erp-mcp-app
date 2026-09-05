import {
  OAuthError,
  OAuthErrorCode,
  oauthCustomProvider,
  type OAuthAuthInfo,
  type OAuthMetadata,
} from "mcp-use/oauth";
import { env } from "./env.js";
import type { FrappeUser, JsonRecord } from "./types.js";

const DEFAULT_TOKEN_TTL_SECONDS = 3600;

function endpoint(path: string): string {
  return `${env.erpnextUrl}${path}`;
}

function asRecord(value: unknown): JsonRecord | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  return undefined;
}

function unwrapMessage(body: unknown): JsonRecord {
  const root = asRecord(body);
  const message = root?.message;
  return asRecord(message) ?? root ?? {};
}

function stringField(record: JsonRecord, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function numberField(record: JsonRecord, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return undefined;
}

function isActive(record: JsonRecord): boolean {
  const value = record.active;
  return value === true || value === 1 || value === "1" || value === "true";
}

function scopesFrom(record: JsonRecord): string[] {
  const scope = record.scope ?? record.scopes;
  if (typeof scope === "string") {
    return scope.split(/\s+/).filter(Boolean);
  }
  if (Array.isArray(scope)) {
    return scope.filter((item): item is string => typeof item === "string");
  }
  return ["openid", "all"];
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

async function introspectToken(token: string, signal?: AbortSignal): Promise<JsonRecord> {
  const response = await fetch(endpoint("/api/method/frappe.integrations.oauth2.introspect_token"), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ token, token_type_hint: "access_token" }),
    signal,
  });
  const body = unwrapMessage(await readJson(response));
  if (!response.ok) {
    throw new OAuthError(OAuthErrorCode.InvalidToken, "Frappe rejected the access token.");
  }
  return body;
}

async function readOpenIdProfile(token: string, signal?: AbortSignal): Promise<JsonRecord> {
  const response = await fetch(endpoint("/api/method/frappe.integrations.oauth2.openid_profile"), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    signal,
  });
  if (!response.ok) {
    return {};
  }
  return unwrapMessage(await readJson(response));
}

export const frappeOAuthMetadata = {
  // Inspector discovers AS metadata from this issuer. Frappe's
  // /.well-known/openid-configuration 301s to an API method, and
  // Inspector's OAuth BFF rejects redirects. Serve metadata here instead.
  issuer: env.mcpPublicUrl,
  authorization_endpoint: endpoint("/api/method/frappe.integrations.oauth2.authorize"),
  token_endpoint: endpoint("/api/method/frappe.integrations.oauth2.get_token"),
  revocation_endpoint: endpoint("/api/method/frappe.integrations.oauth2.revoke_token"),
  introspection_endpoint: endpoint("/api/method/frappe.integrations.oauth2.introspect_token"),
  ...(env.oauthClientId
    ? { registration_endpoint: `${env.mcpPublicUrl}/oauth/register` }
    : {}),
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  scopes_supported: ["openid", "all"],
} satisfies OAuthMetadata;

export function createFrappeOAuthProvider() {
  return oauthCustomProvider<FrappeUser>({
    oauthMetadata: frappeOAuthMetadata,
    resourceName: "ST Attendance",
    scopesSupported: ["openid", "all"],
    createTokenVerifier(resource) {
      return {
        async verifyAccessToken(token) {
          const introspection = await introspectToken(token);
          if (!isActive(introspection)) {
            throw new OAuthError(
              OAuthErrorCode.InvalidToken,
              "Frappe access token is inactive or expired."
            );
          }

          const profile = await readOpenIdProfile(token);
          const now = Math.floor(Date.now() / 1000);
          const expiresAt =
            numberField(introspection, "exp", "expires_at") ??
            now + (numberField(introspection, "expires_in") ?? DEFAULT_TOKEN_TTL_SECONDS);

          if (expiresAt <= now) {
            throw new OAuthError(OAuthErrorCode.InvalidToken, "Frappe access token has expired.");
          }

          const userId =
            stringField(profile, "email", "sub", "name") ??
            stringField(introspection, "username", "user", "user_id", "sub", "email");
          if (!userId) {
            throw new OAuthError(
              OAuthErrorCode.InvalidToken,
              "Frappe token is missing a user identity."
            );
          }

          return {
            token,
            clientId:
              stringField(introspection, "client_id", "clientId") ?? "frappe-oauth-client",
            scopes: scopesFrom(introspection),
            expiresAt,
            resource,
            extra: {
              payload: {
                ...introspection,
                ...profile,
                sub: userId,
                email: stringField(profile, "email") ?? stringField(introspection, "email"),
                name:
                  stringField(profile, "name", "full_name", "given_name") ??
                  stringField(introspection, "name"),
              },
            },
          };
        },
      };
    },
    mapAuthInfo(authInfo: OAuthAuthInfo) {
      const payload = (authInfo.extra?.payload ?? {}) as JsonRecord;
      const id = stringField(payload, "sub", "email", "username");
      if (!id) {
        throw new Error("Verified Frappe token is missing sub");
      }
      return {
        user: {
          id,
          email: stringField(payload, "email"),
          fullName: stringField(payload, "name", "full_name"),
        },
        payload,
        permissions: [],
      };
    },
  });
}
