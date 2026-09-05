const DEFAULT_ERPNEXT_URL = "https://st-erpv15.frappe.cloud";

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function readOptional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export type AppEnv = {
  erpnextUrl: string;
  mcpPublicUrl: string;
  oauthEnabled: boolean;
  oauthClientId: string | undefined;
  oauthClientSecret: string | undefined;
  apiKey: string | undefined;
  apiSecret: string | undefined;
};

export function loadEnv(): AppEnv {
  const erpnextUrl = trimSlash(
    readOptional("ERPNEXT_URL") ?? DEFAULT_ERPNEXT_URL
  );
  const oauthFlag = readOptional("ERPNEXT_OAUTH");
  const oauthEnabled = oauthFlag !== "0";
  const mcpPublicUrl = trimSlash(
    readOptional("MCP_PUBLIC_URL") ?? `http://localhost:${readOptional("PORT") ?? "3000"}`
  );

  return {
    erpnextUrl,
    mcpPublicUrl,
    oauthEnabled,
    oauthClientId: readOptional("FRAPPE_OAUTH_CLIENT_ID"),
    oauthClientSecret: readOptional("FRAPPE_OAUTH_CLIENT_SECRET"),
    apiKey: readOptional("ERPNEXT_API_KEY"),
    apiSecret: readOptional("ERPNEXT_API_SECRET"),
  };
}

export const env = loadEnv();
