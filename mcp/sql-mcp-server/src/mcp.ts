import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Staff } from "./signin/broker.js";

export const SERVER_INFO = { name: "sql-mcp-server", version: "0.0.1" };

/**
 * Answers one MCP request with the SDK's web-standard transport, statelessly (ADR-003):
 * a fresh server and transport per request, no session ID, JSON responses rather than SSE.
 * The signed-in Staff member reaches tool handlers as `extra.authInfo.extra.staff` (R-009).
 * No Tools are registered yet; each slice that adds one registers it here.
 */
export async function handleMcp(request: Request, staff?: Staff): Promise<Response> {
  const server = new McpServer(SERVER_INFO);
  // Until a slice registers the first Tool, answer tools/list with an empty list rather than
  // "method not found", so an AI tool shows the connector as connected. Replace on first registerTool.
  server.server.registerCapabilities({ tools: {} });
  server.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [] }));
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  // The access token itself is not passed on: nothing after the Sign-in broker needs it.
  return transport.handleRequest(request, staff ? { authInfo: { token: "", clientId: "", scopes: [], extra: { staff } } } : undefined);
}
