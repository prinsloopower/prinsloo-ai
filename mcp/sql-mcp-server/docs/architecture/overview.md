# Architecture overview — sql-mcp-server

## Shape
One TypeScript codebase built twice. Cloudflare runs it as a Worker for PostgreSQL on Supabase. Azure runs the same code as a container image for MS SQL Server (ADR-001, ADR-002, D-063). Behind a thin runtime adapter, everything is written against web-standard Request, Response and crypto APIs, so the parts that enforce R-003, R-004, R-009 and R-010 are identical on every cloud.

A Deployment is one process with no state store of its own (ADR-004, ADR-006, ADR-007). The Deployment keeps no record of who signed in, which client registered, or which Created objects exist. Each of these travels with the request as a signed or encrypted value. What is visible is read from the Database's own grants (ADR-006). As a result, a Deployment needs only three things: its Server settings, one signing secret and a network path to the Database.

```
AI tool --HTTPS--> Runtime adapter --> Sign-in broker --> MCP endpoint --> Visibility resolver
                   (Worker | Node)     (OAuth AS,         (tool registry)    |
                                        delegates sign-in)        |           v
                                                                 +--> Query check --+
                                                                 +--> Typed tools --+
                                                                 |                  v
                                                                 |          Engine adapter --> Database
                                                                 +--> Audit logger --> Host log facility
```

## Stack
- Language and runtime: TypeScript on Cloudflare Workers, and on Node 24 in a container on Azure Container Apps (ADR-001, ADR-002).
- HTTP routing: Hono, which runs unchanged on both runtimes (ADR-001).
- MCP protocol: `@modelcontextprotocol/sdk` with its web-standard Streamable HTTP transport, in stateless mode (ADR-003).
- Sign-in: the Server is its own OAuth 2.1 authorization server, and it delegates the actual sign-in to the organisation's OpenID Connect provider (ADR-004). Built on `jose` and `oauth4webapi`.
- PostgreSQL access: `pg` from the Worker, through Hyperdrive to Supabase (ADR-008, D-063).
- MS SQL Server access: `mssql`/`tedious` from the container on Azure (ADR-008, D-063).
- Query check: the engine's own parser and planner, behind a conservative structural check (ADR-005).
- Tests: Vitest, with integration tests against PostgreSQL and MS SQL Server running in Docker (ADR-010).
- Deployment tooling: each cloud's own tooling. That is Wrangler on Cloudflare and Bicep on Azure (ADR-009).

## Boundaries
- **Trusted:** Server settings and the deployment secret, which are set by the Operator; the Identity provider's ID tokens, once verified against its published keys; the Database's catalog.
- **Untrusted:** everything the AI tool sends, including the Conversation token (ADR-007), the Request text and every tool input. The Allow-list comes from the Database's grants, never from the AI tool (ADR-006).
- **Off the Host:** nothing. Audit records go only to the runtime's attached log facility (D-006, D-008).

## Integrations

| System | Trusted to | When unavailable | Configured per environment by |
|---|---|---|---|
| Identity provider (any OpenID Connect provider with discovery) | authenticate Staff members; issue the ID token whose expiry bounds Sign-in (D-024) | Sign-in fails with a message naming the provider; calls already signed in keep working until their token expires. Slow is treated as unavailable: every call to its discovery, keys and token endpoints has a time limit, set in the system spec | the Operator: issuer URL, client ID, client secret (a secret) |
| Client metadata URL (a Client ID Metadata Document, ADR-004) | nothing; the URL and the document are chosen by the client, so they are untrusted input | Registration fails and the AI tool is told why; nothing is cached. The fetch is HTTPS only, to public addresses only, with no redirects, a size cap and a time limit, so a hostile URL cannot reach the Host's network or hold a sign-in open. The limits are set in the system spec | nothing per environment; the rules are the same everywhere |
| Database (PostgreSQL / MS SQL Server) | enforce its own grants (D-004); report the objects a plan reads (ADR-005) | Tool calls end in a Database error; `/healthz` reports the Database down; nothing is retried automatically. Connecting has a time limit, set in the system spec; slow queries are D-003's concern | the Operator: connection string (a secret), or the Hyperdrive binding on Cloudflare |
| Hyperdrive (Cloudflare only) | pool and route connections to PostgreSQL | same as Database unavailable | Wrangler config: binding name and Hyperdrive ID |
| Host log facility (Workers Logs, Azure Monitor) | keep Audit records on the Host | the runtime's own buffering; if the facility drops a line, nothing in the Server can tell, and the Security material says so | runtime defaults; on Cloudflare, `observability.enabled` in the Wrangler config |
| AI tool (Claude, ChatGPT, D-043) | nothing; every input is untrusted | not the Server's concern | each AI tool's workspace admin: the connector URL, plain `/mcp` |
