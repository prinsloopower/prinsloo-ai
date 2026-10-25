import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod";
import { unparsedSql, writeAudit, type StatementRecord } from "./audit.js";
import type { Boundary } from "./config.js";
import type { Catalog, Database, QueryEngine, ReasonClass } from "./engine/database.js";
import { op } from "./oplog.js";
import { page, type Staff } from "./signin/broker.js";
import { answerDatabaseError, answerRefusal, type ToolAnswer } from "./tools/answer.js";
import { answerListing, LIST_TABLES, LIST_TABLES_DESCRIPTION, listing, validateListTables } from "./tools/list-tables.js";
import { answerQuery, QUERY, queryDescription, validateQuery } from "./tools/query.js";
import { bypassesGrants, visibleObjects } from "./visibility.js";

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
  /** The Engine's half of the Query check and of Redaction; without it the query tool is not offered (D-086). */
  queryEngine?: () => Promise<QueryEngine>;
  rowLimit: number;
  redaction: boolean;
}

type CatalogRead = { catalog: Catalog } | { error: unknown };

/** One Tool, as the MCP endpoint offers, checks, runs and audits it. */
interface ToolSpec {
  description: string;
  inputSchema: Record<string, z.ZodType>;
  /**
   * Checks the inputs, which needs no Database: a Refusal's sentence, or the work to do once the
   * catalog is read. It runs before dispatch, so a valid call reads the catalog once, and again in
   * the handler on the SDK's arguments.
   */
  prepare(args: Record<string, unknown>): { ok: false; sentence: string } | { ok: true; run(catalog: Catalog, id: string): Promise<ToolAnswer> };
  /** The inputs the Audit record keeps, other than `request_text` (data-model.md). */
  inputs(args: Record<string, unknown>): Record<string, unknown>;
  /**
   * The SQL the Audit record keeps for this call, redacted when Redaction is on (R-011). Redaction
   * happens here, not in the Audit logger, because it needs the Engine's parser (D-088).
   */
  auditSql?(args: Record<string, unknown>, answer: ToolAnswer, faulted: boolean, id: string): Promise<{ statements?: StatementRecord[]; submittedSql?: string }>;
}

/** The Tools a Deployment offers. */
function toolSpecs(tools: ToolContext): Map<string, ToolSpec> {
  const specs = new Map<string, ToolSpec>([
    [
      LIST_TABLES,
      {
        description: LIST_TABLES_DESCRIPTION,
        inputSchema: { request_text: z.unknown().optional(), schema: z.unknown().optional() },
        prepare(args) {
          const valid = validateListTables(args);
          return valid.ok ? { ok: true, run: async (catalog) => answerListing(listing(catalog, tools.boundary, valid.schema)) } : valid;
        },
        // A schema name is an identifier, so Redaction keeps it (security.md); the Audit logger bounds it.
        inputs: (args) => ("schema" in args ? { schema: args.schema } : {}),
      },
    ],
  ]);
  const queryEngine = tools.queryEngine;
  if (queryEngine) {
    specs.set(QUERY, {
      description: queryDescription(tools.rowLimit),
      inputSchema: { request_text: z.unknown().optional(), sql: z.unknown().optional() },
      prepare(args) {
        const valid = validateQuery(args);
        if (!valid.ok) return valid;
        return {
          ok: true,
          run: async (catalog, id) =>
            answerQuery(valid.sql, {
              queryEngine: await queryEngine(),
              database: tools.database,
              visible: visibleObjects(catalog, tools.boundary),
              rowLimit: tools.rowLimit,
              classify: tools.classify,
              id,
            }),
        };
      },
      // A query's SQL is recorded as its Statement or submitted SQL instead (D-082).
      inputs: () => ({}),
      // The Statement it was sent as, or else the SQL as submitted, however the call was refused (D-086).
      async auditSql(args, answer, faulted, id) {
        const submitted = answer.submittedSql ?? (typeof args.sql === "string" && args.sql ? args.sql : undefined);
        // Whatever goes wrong while redacting, the Tool call still leaves its Audit record (R-010):
        // the SQL is then kept by its length only.
        const redact = async (sql: string) => {
          // After a fault in the Server's own work, the query engine is not loaded again within the same Tool call.
          if (faulted) return tools.redaction ? unparsedSql(sql) : sql;
          try {
            return (await queryEngine()).redact(sql, tools.redaction);
          } catch {
            // A fault in Redaction itself: the Operator is told, the SQL is kept by its length (D-089).
            op("server_fault", { path: "/mcp", tool: QUERY, id, step: "redaction" });
            return tools.redaction ? unparsedSql(sql) : sql;
          }
        };
        if (answer.statements?.length) {
          return { statements: await Promise.all(answer.statements.map(async (s) => ({ ...s, sql: await redact(s.sql) }))) };
        }
        return submitted === undefined ? {} : { submittedSql: await redact(submitted) };
      },
    });
  }
  return specs;
}

/** The Tool a `tools/call` names, when it is one this Deployment offers. */
function toolCallOf(body: unknown, specs: Map<string, ToolSpec>): { name: string; spec: ToolSpec; args: Record<string, unknown> } | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
  const b = body as { method?: unknown; params?: { name?: unknown; arguments?: Record<string, unknown> } };
  const spec = typeof b.params?.name === "string" ? specs.get(b.params.name) : undefined;
  return b.method === "tools/call" && spec ? { name: b.params!.name as string, spec, args: b.params!.arguments ?? {} } : undefined;
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
    const specs = toolSpecs(tools);
    const audit = async (name: string, spec: ToolSpec, args: Record<string, unknown>, id: string, started: number, answer: ToolAnswer, faulted = false) =>
      writeAudit({
        id, started, ended: tools.now(), deployment: tools.deployment, staff, requestText: args.request_text, tool: name,
        inputs: spec.inputs(args), outcome: answer.outcome, ...(spec.auditSql ? await spec.auditSql(args, answer, faulted, id) : {}),
      });

    // The account check needs the catalog, and an unsafe account must answer with an HTTP 503,
    // which a tool handler cannot set. So a Tool call with valid inputs reads the catalog here,
    // once, and the handler uses that read (D-077, D-078).
    let read: CatalogRead | undefined;
    let readStarted: number | undefined;
    const call = toolCallOf(body, specs);
    if (call && call.spec.prepare(call.args).ok) {
      const started = (readStarted = tools.now());
      read = await readCatalog(tools.database);
      if ("catalog" in read && bypassesGrants(read.catalog.flags)) {
        const id = crypto.randomUUID();
        const answer = answerRefusal("unsafe_account", UNSAFE_ACCOUNT, id);
        op("config_invalid", { variable: tools.connectionSetting, id });
        await audit(call.name, call.spec, call.args, id, started, answer);
        return page(answer.result.content[0]!.text, 503);
      }
    }

    for (const [name, spec] of specs) {
      server.registerTool(name, { description: spec.description, inputSchema: spec.inputSchema }, async (args: Record<string, unknown>) => {
        // A catalog read made before dispatch is part of this Tool call's time.
        const started = readStarted ?? tools.now();
        const id = crypto.randomUUID();
        let answer: ToolAnswer;
        let faulted = false;
        const prepared = spec.prepare(args);
        if (!prepared.ok) {
          answer = answerRefusal("invalid_input", prepared.sentence, id);
        } else {
          const r = read ?? (await readCatalog(tools.database));
          if ("error" in r) {
            answer = answerDatabaseError(tools.classify(r.error), id);
          } else if (bypassesGrants(r.catalog.flags)) {
            op("config_invalid", { variable: tools.connectionSetting, id });
            answer = answerRefusal("unsafe_account", UNSAFE_ACCOUNT, id);
          } else {
            try {
              answer = await prepared.run(r.catalog, id);
            } catch {
              // A fault in the Server's own work, such as the parser failing to load, still ends the
              // Tool call with an Audit record. The line names no detail, which can carry paths (D-088).
              op("server_fault", { path: "/mcp", tool: name, id });
              faulted = true;
              answer = answerDatabaseError("other", id);
            }
          }
        }
        await audit(name, spec, args, id, started, answer, faulted);
        return answer.result;
      });
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
