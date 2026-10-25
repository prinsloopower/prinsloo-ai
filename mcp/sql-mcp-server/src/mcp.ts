import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod";
import { writeAudit } from "./audit.js";
import type { Boundary } from "./config.js";
import type { Catalog, Database, ReasonClass } from "./engine/database.js";
import type { PgParser } from "./engine/pg-parser.js";
import { op } from "./oplog.js";
import { visibleObjects } from "./query/check.js";
import { redactSql } from "./query/redact.js";
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
import { answerQuery, QUERY, queryDescription, validateQuery, type QueryAnswer } from "./tools/query.js";
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
  /** The Engine's parser for the Query check; without one the query tool is not offered (D-086). */
  parser?: () => Promise<PgParser>;
  rowLimit: number;
  redaction: boolean;
}

type CatalogRead = { catalog: Catalog } | { error: unknown };

/** The Tool a `tools/call` names, when it is one of ours. */
function toolCallOf(body: unknown): { name: string; args: Record<string, unknown> } | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
  const b = body as { method?: unknown; params?: { name?: unknown; arguments?: Record<string, unknown> } };
  if (b.method !== "tools/call" || (b.params?.name !== LIST_TABLES && b.params?.name !== QUERY)) return undefined;
  return { name: b.params.name, args: b.params.arguments ?? {} };
}

function inputsOf(tool: string, args: Record<string, unknown>): Record<string, unknown> {
  // A schema name is an identifier, so Redaction keeps it (security.md); the Audit logger bounds it.
  // A query's SQL is recorded as its Statement or submitted SQL instead (D-082).
  return tool === LIST_TABLES && "schema" in args ? { schema: args.schema } : {};
}

const validInputs = (tool: string, args: Record<string, unknown>) => (tool === QUERY ? validateQuery(args).ok : validateListTables(args).ok);

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
    // which a tool handler cannot set. So a Tool call with valid inputs reads the catalog here,
    // once, and the handler uses that read (D-077, D-078).
    /**
     * The SQL a `query` Tool call's Audit record keeps, redacted when Redaction is on (R-011):
     * the Statement it was sent as, or else the SQL as submitted, however the call was refused.
     */
    const auditedSql = async (name: string, args: Record<string, unknown>, answer: QueryAnswer) => {
      if (name !== QUERY || !tools.parser) return {};
      const redact = async (sql: string) => redactSql(sql, await tools.parser!(), tools.redaction);
      if (answer.statement) return { statement: { ...answer.statement, sql: await redact(answer.statement.sql) } };
      const submitted = answer.submittedSql ?? (typeof args.sql === "string" && args.sql ? args.sql : undefined);
      return submitted === undefined ? {} : { submittedSql: await redact(submitted) };
    };

    let read: CatalogRead | undefined;
    let readStarted: number | undefined;
    const call = toolCallOf(body);
    if (call && validInputs(call.name, call.args)) {
      const started = (readStarted = tools.now());
      read = await readCatalog(tools.database);
      if ("catalog" in read && bypassesGrants(read.catalog.flags)) {
        const id = crypto.randomUUID();
        const answer = answerRefusal("unsafe_account", UNSAFE_ACCOUNT, id);
        op("config_invalid", { variable: tools.connectionSetting, id });
        writeAudit({
          id, started, ended: tools.now(), deployment: tools.deployment, staff, requestText: call.args.request_text, tool: call.name,
          inputs: inputsOf(call.name, call.args), outcome: answer.outcome, ...(await auditedSql(call.name, call.args, answer)),
        });
        return page(answer.result.content[0]!.text, 503);
      }
    }

    /** One Tool call: input checks, the catalog read and account check, then the tool's own work, and its Audit record. */
    const toolCall = (name: string, run: (args: Record<string, unknown>, catalog: Catalog, id: string) => Promise<QueryAnswer>) =>
      async (args: Record<string, unknown>) => {
        // A catalog read made before dispatch is part of this Tool call's time.
        const started = readStarted ?? tools.now();
        const id = crypto.randomUUID();
        let answer: QueryAnswer;
        const invalid = name === QUERY ? validateQuery(args) : validateListTables(args);
        if (!invalid.ok) {
          answer = answerRefusal("invalid_input", invalid.sentence, id);
        } else {
          const r = read ?? (await readCatalog(tools.database));
          if ("error" in r) {
            answer = answerDatabaseError(tools.classify(r.error), id);
          } else if (bypassesGrants(r.catalog.flags)) {
            op("config_invalid", { variable: tools.connectionSetting, id });
            answer = answerRefusal("unsafe_account", UNSAFE_ACCOUNT, id);
          } else {
            answer = await run(args, r.catalog, id);
          }
        }
        writeAudit({
          id, started, ended: tools.now(), deployment: tools.deployment, staff, requestText: args.request_text, tool: name,
          inputs: inputsOf(name, args), outcome: answer.outcome, ...(await auditedSql(name, args, answer)),
        });
        return answer.result;
      };

    server.registerTool(
      LIST_TABLES,
      { description: LIST_TABLES_DESCRIPTION, inputSchema: { request_text: z.unknown().optional(), schema: z.unknown().optional() } },
      toolCall(LIST_TABLES, async (args, catalog): Promise<ToolAnswer> => {
        const valid = validateListTables(args);
        return answerListing(listing(catalog, tools.boundary, valid.ok ? valid.schema : undefined));
      }),
    );

    const parser = tools.parser;
    if (parser) {
      server.registerTool(
        QUERY,
        { description: queryDescription(tools.rowLimit), inputSchema: { request_text: z.unknown().optional(), sql: z.unknown().optional() } },
        toolCall(QUERY, async (args, catalog, id) =>
          answerQuery(args.sql as string, {
            parser: await parser(),
            database: tools.database,
            visible: visibleObjects(catalog, tools.boundary),
            rowLimit: tools.rowLimit,
            classify: tools.classify,
            id,
          }),
        ),
      );
    }
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
