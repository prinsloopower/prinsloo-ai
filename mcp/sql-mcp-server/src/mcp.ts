import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod";
import { writeAudit } from "./audit.js";
import type { Boundary } from "./config.js";
import type { Catalog, Database, ReasonClass } from "./engine/database.js";
import { op } from "./oplog.js";
import { page, type Staff } from "./signin/broker.js";
import {
  answerDatabaseError,
  answerListing,
  answerRefusal,
  LIST_TABLES,
  LIST_TABLES_DESCRIPTION,
  listing,
  validateListTables,
  type ToolAnswer,
} from "./tools/list-tables.js";
import { bypassesGrants } from "./visibility.js";

export const SERVER_INFO = { name: "sql-mcp-server", version: "0.0.1" };

const UNSAFE_ACCOUNT = "Deployment misconfigured: Database account bypasses grants";

/** What the Tools need for one request (components.md, MCP endpoint). */
export interface ToolContext {
  database: Database;
  boundary?: Boundary;
  /** The Deployment's origin, as Audit records name it. */
  deployment: string;
  /** The setting that names the Database account: HYPERDRIVE on Workers, DATABASE_URL on Azure (D-077). */
  connectionSetting: string;
  classify: (error: unknown) => ReasonClass;
  now: () => number;
}

type CatalogRead = { catalog: Catalog } | { error: unknown };

function isListTablesCall(body: unknown): body is { params: { arguments?: Record<string, unknown> } } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const b = body as { method?: unknown; params?: { name?: unknown } };
  return b.method === "tools/call" && b.params?.name === LIST_TABLES;
}

function inputsOf(args: Record<string, unknown>): Record<string, unknown> {
  // A schema name is an identifier, so Redaction keeps it (security.md); the Audit logger bounds it.
  return "schema" in args ? { schema: args.schema } : {};
}

async function readCatalog(database: Database): Promise<CatalogRead> {
  try {
    return { catalog: await database.catalog() };
  } catch (error) {
    return { error };
  }
}

/**
 * Answers one MCP request with the SDK's web-standard transport, statelessly (ADR-003):
 * a fresh server and transport per request, no session ID, JSON responses rather than SSE.
 * The signed-in Staff member reaches tool handlers as `extra.authInfo.extra.staff` (R-009).
 * Without a Database there are no Tools, and `tools/list` answers an empty list.
 */
export async function handleMcp(request: Request, staff?: Staff, tools?: ToolContext): Promise<Response> {
  const server = new McpServer(SERVER_INFO);
  const body: unknown = await request
    .clone()
    .json()
    .catch(() => undefined);

  if (!tools || !staff) {
    server.server.registerCapabilities({ tools: {} });
    server.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [] }));
  } else {
    // The account check needs the catalog, and an unsafe account must answer with an HTTP 503,
    // which a tool handler cannot set. So a list_tables call with valid inputs reads the catalog
    // here, once, and the handler uses that read (D-077, D-078).
    let read: CatalogRead | undefined;
    let readStarted: number | undefined;
    if (isListTablesCall(body)) {
      const args = body.params.arguments ?? {};
      if (validateListTables(args).ok) {
        const started = (readStarted = tools.now());
        read = await readCatalog(tools.database);
        if ("catalog" in read && bypassesGrants(read.catalog.flags)) {
          const id = crypto.randomUUID();
          const answer = answerRefusal("unsafe_account", UNSAFE_ACCOUNT, id);
          op("config_invalid", { variable: tools.connectionSetting, id });
          writeAudit({ id, started, ended: tools.now(), deployment: tools.deployment, staff, requestText: args.request_text, tool: LIST_TABLES, inputs: inputsOf(args), outcome: answer.outcome });
          return page(answer.result.content[0]!.text, 503);
        }
      }
    }

    server.registerTool(
      LIST_TABLES,
      { description: LIST_TABLES_DESCRIPTION, inputSchema: { request_text: z.unknown().optional(), schema: z.unknown().optional() } },
      async (args: Record<string, unknown>) => {
        // A catalog read made before dispatch is part of this Tool call's time.
        const started = readStarted ?? tools.now();
        const id = crypto.randomUUID();
        let answer: ToolAnswer;
        const valid = validateListTables(args);
        if (!valid.ok) {
          answer = answerRefusal("invalid_input", valid.sentence, id);
        } else {
          const r = read ?? (await readCatalog(tools.database));
          if ("error" in r) {
            answer = answerDatabaseError(tools.classify(r.error), id);
          } else if (bypassesGrants(r.catalog.flags)) {
            op("config_invalid", { variable: tools.connectionSetting, id });
            answer = answerRefusal("unsafe_account", UNSAFE_ACCOUNT, id);
          } else {
            answer = answerListing(listing(r.catalog, tools.boundary, valid.schema));
          }
        }
        writeAudit({ id, started, ended: tools.now(), deployment: tools.deployment, staff, requestText: args.request_text, tool: LIST_TABLES, inputs: inputsOf(args), outcome: answer.outcome });
        return answer.result;
      },
    );
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  // The access token itself is not passed on: nothing after the Sign-in broker needs it.
  return transport.handleRequest(request, {
    ...(body === undefined ? {} : { parsedBody: body }),
    ...(staff ? { authInfo: { token: "", clientId: "", scopes: [], extra: { staff } } } : {}),
  });
}
