import type { CallToolResult } from "mcp-use";

export function ok<T>(summary: string, data: T, meta?: Record<string, unknown>) {
  const result: CallToolResult & { structuredContent: T } = {
    content: [{ type: "text", text: summary }],
    structuredContent: data,
  };
  if (meta) {
    result._meta = meta;
  }
  return result;
}

export function fail(message: string): CallToolResult & { isError: true } {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}
