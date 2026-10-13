import { Hono } from "hono";

/** What the app needs from the runtime adapter (ADR-001). */
export interface Deps {
  /** Runs a health-check Server statement against the Database. */
  ping(): Promise<void>;
  /** Identity provider issuer URL; unset means Sign-in is not configured (D-017). */
  idpIssuer?: string;
}

export const NOT_AUTHENTICATED =
  "The MCP connection has not been authenticated. Sign in to use this server.";

/** Protected-resource metadata lives under the well-known prefix plus the resource's path (RFC 9728). */
const PRM_PREFIX = "/.well-known/oauth-protected-resource";

export function createApp(deps: Deps) {
  const app = new Hono();

  app.get("/healthz", async (c) => {
    try {
      await deps.ping();
      return c.json({ status: "ok", database: "ok" });
    } catch {
      // The driver's message can carry object or host names; report only the outcome (D-005).
      return c.json({ status: "degraded", database: "unreachable" }, 503);
    }
  });

  app.get(`${PRM_PREFIX}/*`, (c) => {
    const url = new URL(c.req.url);
    const resourcePath = url.pathname.slice(PRM_PREFIX.length) || "/mcp";
    return c.json({
      resource: `${url.origin}${resourcePath}`,
      authorization_servers: deps.idpIssuer ? [url.origin] : [],
      bearer_methods_supported: ["header"],
    });
  });

  // Every MCP call is blocked until Sign-in exists (D-017); a call with no Sign-in
  // is not a Tool call and leaves no Audit record (D-044).
  app.all("/mcp/*", (c) => blockUnauthenticated(c.req.url));
  app.all("/mcp", (c) => blockUnauthenticated(c.req.url));

  return app;
}

function blockUnauthenticated(requestUrl: string): Response {
  const url = new URL(requestUrl);
  const metadata = `${url.origin}${PRM_PREFIX}${url.pathname}`;
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
        "www-authenticate": `Bearer resource_metadata="${metadata}"`,
      },
    },
  );
}
