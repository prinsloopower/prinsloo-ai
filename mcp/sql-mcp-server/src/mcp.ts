import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

export const SERVER_INFO = { name: "sql-mcp-server", version: "0.0.1" };

/**
 * Answers one MCP request with the SDK's web-standard transport, statelessly (ADR-003):
 * a fresh server and transport per request, no session ID, JSON responses rather than SSE.
 * No Tools are registered yet; each slice that adds one registers it here.
 */
export async function handleMcp(request: Request): Promise<Response> {
  const server = new McpServer(SERVER_INFO);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}
