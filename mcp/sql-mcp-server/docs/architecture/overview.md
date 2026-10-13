# Architecture overview — sql-mcp-server

## Shape
One TypeScript codebase built twice. Cloudflare runs it as a Worker. AWS and Azure run the same code as a container image (ADR-001, ADR-002). Behind a thin runtime adapter, everything is written against web-standard Request, Response and crypto APIs, so the parts that enforce R-003, R-004, R-009 and R-010 are identical on every cloud.

A Deployment is one process with no state store of its own (ADR-004, ADR-006, ADR-007). The Deployment keeps no record of who signed in, which client registered, which Allow-list applies or which Created objects exist. Each of these travels with the request as a signed or encrypted value, or is carried in the URL the Organisation admin configured. As a result, a Deployment needs only three things: its Server settings, one signing secret and a network path to the Database.

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
- Language and runtime: TypeScript on Cloudflare Workers, and on Node 24 in a container (ADR-001).
- HTTP routing: Hono, which runs unchanged on both runtimes (ADR-001).
- MCP protocol: `@modelcontextprotocol/sdk` with its web-standard Streamable HTTP transport, in stateless mode (ADR-003).
- Sign-in: the Server is its own OAuth 2.1 authorization server, and it delegates the actual sign-in to the organisation's OpenID Connect provider (ADR-004). Built on `jose` and `oauth4webapi`.
- PostgreSQL access: `pg`, reached through Hyperdrive on Cloudflare and directly from containers (ADR-008).
- MS SQL Server access: `mssql`/`tedious`, from containers only, until Q-001 is settled (ADR-008, D-020).
- Query check: the engine's own parser and planner, behind a conservative structural check (ADR-005).
- Tests: Vitest, with integration tests against PostgreSQL and MS SQL Server running in Docker (ADR-010).
- Deployment tooling: each cloud's own tooling. That is Wrangler on Cloudflare, CloudFormation on AWS and Bicep on Azure (ADR-009).

## Boundaries
- **Trusted:** Server settings and the deployment secret, which are set by the Operator; the Identity provider's ID tokens, once verified against its published keys; the Database's catalog.
- **Untrusted:** everything the AI tool sends, including the Allow-list in the URL (D-009), the Conversation token (ADR-007), the Request text and every tool input.
- **Off the Host:** nothing. Audit records go only to the runtime's attached log facility (D-006, D-008).

## Integrations

| System | Trusted to | When unavailable | Configured per environment by |
|---|---|---|---|
| Identity provider (any OpenID Connect provider with discovery) | authenticate Staff members; issue the ID token whose expiry bounds Sign-in (D-024) | Sign-in fails with a message naming the provider; calls already signed in keep working until their token expires | the Operator: issuer URL, client ID, client secret (a secret) |
| Database (PostgreSQL / MS SQL Server) | enforce its own grants (D-004); report the objects a plan reads (ADR-005) | Tool calls end in a Database error; `/healthz` reports the Database down; nothing is retried automatically | the Operator: connection string (a secret), or the Hyperdrive binding on Cloudflare |
| Hyperdrive (Cloudflare only) | pool and route connections to PostgreSQL | same as Database unavailable | Wrangler config: binding name and Hyperdrive ID |
| Host log facility (Workers Logs, CloudWatch Logs, Azure Monitor) | keep Audit records on the Host | the runtime's own buffering; if the facility drops a line, nothing in the Server can tell, and the Security material says so | runtime defaults; on Cloudflare, `observability.enabled` in the Wrangler config |
| AI tool (Claude, ChatGPT, D-043) | nothing; every input is untrusted | not the Server's concern | the Organisation admin: the connector URL carrying the Allow-list (ADR-006) |
