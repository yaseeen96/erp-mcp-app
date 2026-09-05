#!/usr/bin/env node
/**
 * Probe an ERPNext / Frappe site for OAuth settings needed by this MCP app.
 *
 * Usage:
 *   node scripts/check-oauth.mjs
 *   node scripts/check-oauth.mjs https://st-erpv15.frappe.cloud
 *   ERPNEXT_URL=https://st-erpv15.frappe.cloud npm run check:oauth
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_URL = "https://st-erpv15.frappe.cloud";

function loadDotEnv() {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) {
    return;
  }
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function siteUrl() {
  const fromArg = process.argv[2]?.trim();
  const fromEnv = process.env.ERPNEXT_URL?.trim();
  return (fromArg || fromEnv || DEFAULT_URL).replace(/\/+$/, "");
}

async function fetchJson(url, init) {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
    redirect: "follow",
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: response.status, ok: response.ok, json, text };
}

function result(ok, label, detail) {
  return { ok, label, detail };
}

function print(check) {
  const mark = check.ok ? "OK  " : "NO  ";
  console.log(`${mark} ${check.label}`);
  if (check.detail) {
    console.log(`     ${check.detail}`);
  }
}

async function main() {
  loadDotEnv();
  const base = siteUrl();
  console.log(`Checking OAuth on ${base}\n`);

  const checks = [];

  const openid = await fetchJson(`${base}/.well-known/openid-configuration`);
  const openidBody = openid.json && typeof openid.json === "object" ? openid.json : undefined;
  checks.push(
    result(
      openid.ok && Boolean(openidBody?.authorization_endpoint && openidBody?.token_endpoint),
      "Frappe is an OAuth server (openid-configuration)",
      openid.ok
        ? `authorize=${openidBody?.authorization_endpoint}`
        : `HTTP ${openid.status}`
    )
  );

  const asMeta = await fetchJson(`${base}/.well-known/oauth-authorization-server`);
  checks.push(
    result(
      asMeta.ok,
      "Show Auth Server Metadata",
      asMeta.ok
        ? "Desk → OAuth Settings → this toggle is on"
        : `HTTP ${asMeta.status} — turn on Show Auth Server Metadata`
    )
  );

  const rsMeta = await fetchJson(`${base}/.well-known/oauth-protected-resource`);
  checks.push(
    result(
      rsMeta.ok,
      "Show Protected Resource Metadata",
      rsMeta.ok
        ? "Desk → OAuth Settings → this toggle is on"
        : `HTTP ${rsMeta.status} — turn on Show Protected Resource Metadata`
    )
  );

  const registration =
    openidBody?.registration_endpoint ||
    (asMeta.json && typeof asMeta.json === "object"
      ? asMeta.json.registration_endpoint
      : undefined);
  const hasRegistrationUrl = typeof registration === "string" && registration.length > 0;

  let dcrEnabled = false;
  if (hasRegistrationUrl) {
    const probe = await fetchJson(registration, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    // Enabled: 400 invalid metadata. Disabled: 404.
    dcrEnabled = probe.status !== 404;
  } else {
    const fallback = await fetchJson(
      `${base}/api/method/frappe.integrations.oauth2.register_client`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }
    );
    dcrEnabled = fallback.status !== 404;
    if (dcrEnabled) {
      checks.push(
        result(
          false,
          "registration_endpoint advertised in discovery",
          "DCR endpoint exists but is missing from openid-configuration"
        )
      );
    }
  }

  checks.push(
    result(
      dcrEnabled,
      "Enable Dynamic Client Registration",
      dcrEnabled
        ? "MCP clients can register themselves"
        : "Turn on Enable Dynamic Client Registration in OAuth Settings"
    )
  );

  const authorizeOk = Boolean(openidBody?.authorization_endpoint);
  const tokenOk = Boolean(openidBody?.token_endpoint);
  const introspectOk = Boolean(openidBody?.introspection_endpoint);
  checks.push(
    result(
      authorizeOk && tokenOk && introspectOk,
      "Authorize, token, and introspect endpoints",
      [
        openidBody?.authorization_endpoint,
        openidBody?.token_endpoint,
        openidBody?.introspection_endpoint,
      ]
        .filter(Boolean)
        .join(" | ") || "Missing from openid-configuration"
    )
  );

  for (const check of checks) {
    print(check);
  }

  const ready = checks.every((check) => check.ok);
  console.log("");
  if (ready) {
    console.log("Ready: this site can do per-user MCP OAuth (Login with Google on the Frappe page).");
    process.exit(0);
  }

  console.log("Not ready for MCP client OAuth yet.");
  console.log("Ask a System Manager to open Desk → OAuth Settings and turn on:");
  console.log("  1. Show Auth Server Metadata");
  console.log("  2. Show Protected Resource Metadata");
  console.log("  3. Enable Dynamic Client Registration");
  console.log("Leave Skip Authorization unchecked. Do not change Social Login Key (Google).");
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
});
