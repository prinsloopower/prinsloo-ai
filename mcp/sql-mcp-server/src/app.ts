import { Hono, type Context } from "hono";
import { readConfig, type RuntimeVariables } from "./config.js";
import type { Database } from "./engine/database.js";
import type { QueryEngine } from "./engine/database.js";
import { classifyPostgresError } from "./engine/postgres.js";
import { handleMcp } from "./mcp.js";
import { op } from "./oplog.js";
import { page, SignInBroker, type Staff } from "./signin/broker.js";
import { IdentityProvider } from "./signin/identity-provider.js";
import { Tokens } from "./signin/tokens.js";
import type { Fetch } from "./signin/util.js";
import { bypassesGrants } from "./visibility.js";

/** What the app needs from the runtime adapter (ADR-001). */
export interface Deps {
  /** Runs a health-check Server statement against the Database. */
  ping(): Promise<void>;
  /** The runtime's variables and secrets (environments.md). */
  env?: RuntimeVariables;
  fetch?: Fetch;
  now?: () => number;
  /** The Database the Tools read; without one, no Tools are offered. */
  database?: Database;
  /** Loads the Engine's half of the Query check and of Redaction, once per isolate or process (ADR-005). */
  queries?: () => Promise<QueryEngine>;
  /** The setting naming the Database account in config_invalid lines (D-077). */
  connectionSetting?: string;
  /** Answers a signed-in MCP request; the SDK handler unless a test swaps it. */
  mcpHandler?: (request: Request, staff: Staff) => Promise<Response>;
}

export const NOT_AUTHENTICATED =
  "The MCP connection has not been authenticated. Sign in to use this server.";

/** Protected-resource metadata lives under the well-known prefix plus the resource's path (RFC 9728). */
const PRM_PREFIX = "/.well-known/oauth-protected-resource";

export function createApp(deps: Deps) {
  const app = new Hono();
  // An uncaught fault answers 500 and leaves one operational line naming the path, never the
  // error's message or stack, which can carry tokens or Object names (security.md, D-068).
  app.onError((_err, c) => {
    op("server_fault", { path: new URL(c.req.url).pathname });
    return page("The Server could not complete this request", 500);
  });
  const result = readConfig(deps.env ?? {});
  if (!result.ok) op("config_invalid", { variable: result.variable });

  app.get("/healthz", async (c) => {
    if (!result.ok) return c.json({ status: "degraded", config: "invalid", variable: result.variable }, 503);
    try {
      if (deps.database) {
        // The health-check Server statement is the D-077 account check itself.
        if (bypassesGrants(await deps.database.accountFlags())) return c.json({ status: "degraded", database: "unsafe" }, 503);
      } else {
        await deps.ping();
      }
      return c.json({ status: "ok", database: "ok" });
    } catch {
      // The driver's message can carry object or host names; report only the outcome (D-005).
      return c.json({ status: "degraded", database: "unreachable" }, 503);
    }
  });

  if (!result.ok) {
    const misconfigured = () => page(`Deployment misconfigured: ${result.variable}`, 503);
    for (const path of ["/mcp", "/mcp/*", "/authorize", "/oauth/callback", "/token", "/register", "/.well-known/*"]) {
      app.all(path, misconfigured);
    }
    return app;
  }

  const config = result.config;
  const fetchFn: Fetch = deps.fetch ?? ((input, init) => fetch(input, init));
  const now = deps.now ?? Date.now;
  // Loaded on the first query, then kept for the isolate or process (ADR-005).
  let queries: Promise<QueryEngine> | undefined;
  const loadQueries = deps.queries;
  let tokens: Promise<Tokens> | undefined;
  const broker = new SignInBroker({
    config,
    tokens: () => (tokens ??= Tokens.create(config.secret, config.previousSecret)),
    provider: config.identityProvider ? new IdentityProvider(config.identityProvider, fetchFn, now) : undefined,
    fetch: fetchFn,
    now,
  });

  app.get(`${PRM_PREFIX}/*`, (c) => {
    const origin = broker.origin(c.req.url);
    const resourcePath = new URL(c.req.url).pathname.slice(PRM_PREFIX.length) || "/mcp";
    return c.json({
      resource: `${origin}${resourcePath}`,
      authorization_servers: broker.configured ? [origin] : [],
      bearer_methods_supported: ["header"],
    });
  });

  broker.mount(app);

  // Every MCP call is blocked until Sign-in is configured (D-017) and then until the caller has signed in;
  // a call with no Sign-in is not a Tool call and leaves no Audit record (D-044).
  const mcp = async (c: Context) => {
    const metadata = `${broker.origin(c.req.url)}${PRM_PREFIX}${new URL(c.req.url).pathname}`;
    if (!broker.configured) return blockUnauthenticated(metadata, false);
    const signedIn = await broker.verify(c.req.raw);
    if ("error" in signedIn) return blockUnauthenticated(metadata, signedIn.error === "invalid");
    if (deps.mcpHandler) return deps.mcpHandler(c.req.raw, signedIn.staff);
    const tools = deps.database
      ? {
          database: deps.database,
          boundary: config.boundary,
          deployment: broker.origin(c.req.url),
          connectionSetting: deps.connectionSetting ?? "HYPERDRIVE",
          classify: classifyPostgresError,
          now,
          ...(loadQueries ? { queries: () => (queries ??= loadQueries()) } : {}),
          rowLimit: config.rowLimit,
          redaction: config.redaction,
        }
      : undefined;
    return handleMcp(c.req.raw, signedIn.staff, tools);
  };
  app.all("/mcp/*", mcp);
  app.all("/mcp", mcp);

  return app;
}

function blockUnauthenticated(metadata: string, tokenRefused: boolean): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32001, message: NOT_AUTHENTICATED },
    }),
    {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": `Bearer ${tokenRefused ? 'error="invalid_token", ' : ""}resource_metadata="${metadata}"`,
      },
    },
  );
}
