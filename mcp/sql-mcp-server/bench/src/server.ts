import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { type Server, type ServerResult, StopInvocation } from "./harness.js";

type Connection = { server: Server & { close(): Promise<void> }; expiresAt: number };

/**
 * The Server over a Sign-in that is renewed before its access token expires. The new connection replaces
 * the old one only once it is up. A failed renewal leaves the run on the current connection while its token
 * lasts, and is tried again on the next call; once the token has expired unrenewed, the invocation stops (D-098).
 */
export async function renewingServer(opts: { connect: () => Promise<Connection>; now: () => number; renewBeforeMs: number }): Promise<Server & { close(): Promise<void> }> {
  let current = await opts.connect();
  return {
    name: current.server.name,
    version: current.server.version,
    tools: current.server.tools,
    call: async (name, input) => {
      if (opts.now() > current.expiresAt - opts.renewBeforeMs) {
        try {
          const next = await opts.connect();
          const old = current;
          current = next;
          await old.server.close().catch(() => {});
        } catch (e) {
          if (opts.now() >= current.expiresAt) throw new StopInvocation(`the Sign-in could not be renewed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return current.server.call(name, input);
    },
    close: () => current.server.close(),
  };
}

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
