import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Server, ServerResult } from "./harness.js";

/**
 * The deployed Server as the harness reaches it: its own MCP client over Streamable HTTP, signed in
 * with `accessToken` (D-091). Reads the name and version from `initialize` and the tools from `tools/list`.
 */
export async function connectServer(deploymentUrl: string, accessToken: string, fetch: typeof globalThis.fetch): Promise<Server & { close(): Promise<void> }> {
  const transport = new StreamableHTTPClientTransport(new URL("/mcp", deploymentUrl), {
    fetch,
    requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
  });
  const client = new Client({ name: "sql-mcp-server-benchmark", version: "0.0.1" });
  await client.connect(transport);
  const info = client.getServerVersion();
  const tools = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined);
    tools.push(...page.tools.map((t) => ({ name: t.name, ...(t.description !== undefined ? { description: t.description } : {}), inputSchema: t.inputSchema })));
    cursor = page.nextCursor;
  } while (cursor);
  return {
    name: info?.name ?? "",
    version: info?.version ?? "",
    tools,
    call: async (name, input) => (await client.callTool({ name, arguments: input as Record<string, unknown> })) as ServerResult,
    close: () => client.close(),
  };
}
