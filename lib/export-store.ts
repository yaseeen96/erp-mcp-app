import type { MCPServer } from "mcp-use";
import { env } from "./env.js";

type StoredExport = {
  name: string;
  mimeType: string;
  bytes: Buffer;
  expiresAt: number;
};

const TTL_MS = 10 * 60 * 1000;
const files = new Map<string, StoredExport>();

function prune() {
  const now = Date.now();
  for (const [id, file] of files) {
    if (file.expiresAt <= now) {
      files.delete(id);
    }
  }
}

export function storeExportFile(file: { name: string; mimeType: string; base64: string }) {
  prune();
  const id = crypto.randomUUID();
  files.set(id, {
    name: file.name,
    mimeType: file.mimeType,
    bytes: Buffer.from(file.base64, "base64"),
    expiresAt: Date.now() + TTL_MS,
  });
  return {
    ...file,
    url: `${env.mcpPublicUrl}/exports/${id}`,
  };
}

export function mountExportDownloads<TUser>(server: MCPServer<TUser>): void {
  server.get("/exports/:id", (c) => {
    prune();
    const file = files.get(c.req.param("id"));
    if (!file) {
      return c.text("This download expired. Ask Chat to export again.", 404);
    }
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename="${file.name.replaceAll('"', "")}"`,
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  });
}
