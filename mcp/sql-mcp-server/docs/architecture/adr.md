# Architecture decisions — sql-mcp-server

## ADR-001 — One TypeScript codebase on web-standard APIs, routed with Hono
Traces: R-001, R-002, R-013
Decision: The Server is written in TypeScript against web-standard Request, Response, fetch and Web Crypto. Hono does the routing. A thin adapter per runtime supplies the entry point and the settings.
Alternatives rejected:
- A separate codebase per cloud. The enforcement code (R-003, R-004) would exist two or three times and drift.
- Python or Go. Neither runs natively on Cloudflare Workers, which would force Cloudflare onto containers and remove the zero-infrastructure path for R-013.
- Express. It is tied to Node's HTTP server, so it would not run on Workers.
Consequence: Every dependency must run on both Workers and Node, which rules out drivers or parsers built on native Node add-ons. The engine adapters and the query check carry most of that cost (ADR-005, ADR-008).

## ADR-002 — Cloudflare runs a Worker; AWS and Azure run the same code as one container image
Traces: R-001, R-013, J-001
This builds on D-018, D-041 in the decisions register.
Decision: Cloudflare Deployments are Workers. AWS Deployments run the container image on ECS Fargate, and Azure Deployments run it on Azure Container Apps. Both of those are managed container services with no cluster to operate. A public Deployment sits behind each platform's HTTPS endpoint. A private one uses an internal load balancer or ingress inside the organisation's network. On Cloudflare that means a Worker behind Cloudflare Access.
Alternatives rejected:
- AWS Lambda and Azure Functions. Their invocation model and connection handling differ on each cloud, and they need a database proxy to avoid connection exhaustion. That is two more setups to fit into an hour.
- Kubernetes. It needs a cluster the Operator may not have, and it does not fit inside the one hour.
- Containers on Cloudflare as well. That would give up Workers' free HTTPS endpoint and Hyperdrive pooling, for uniformity nobody needs.
Consequence: There are two build artifacts to test and release, a Worker bundle and an image. Private Deployments on Cloudflare depend on Cloudflare Access, and nothing has tested them yet (skeleton.md).

## ADR-003 — MCP over Streamable HTTP, stateless, using the official SDK's web-standard transport
Traces: R-004, R-009, J-004
Decision: The Server uses `@modelcontextprotocol/sdk` with `WebStandardStreamableHTTPServerTransport`, with no session ID. Every request stands alone and carries its Sign-in, Allow-list and Conversation token.
Alternatives rejected:
- Stateful MCP sessions, which are Durable Objects on Cloudflare and sticky sessions on containers. They need per-cloud state, and a session is not a Conversation anyway (Q-014). See ADR-007.
- The legacy SSE transport, which is deprecated in the MCP specification.
Consequence: There are no server-initiated messages or resumable streams. That is acceptable, because every tool answers within its own request.

## ADR-004 — The Server is its own OAuth 2.1 authorization server, delegating sign-in to the organisation's OpenID Connect provider; it keeps no store
Traces: R-009, R-017, J-002
This builds on D-002, D-015, D-017, D-024, D-044 in the decisions register.
Decision: This adopts D-002's OAuth. The Server publishes protected-resource metadata (RFC 9728) and authorization-server metadata, and it accepts Client ID Metadata Documents, which Claude and ChatGPT both prefer under the 2026-07-28 MCP specification. It also offers dynamic client registration in which the issued `client_id` is a signed blob, so nothing is stored. It runs PKCE (S256) only.

At `/authorize` it sends the Staff member to the Identity provider as a confidential OpenID Connect client. On callback it verifies the ID token and issues its own access token: encrypted, bound to the resource, carrying the Staff member's subject and name, and expiring at the ID token's expiry (D-024). Refresh tokens carry the provider's refresh token, encrypted. Any OpenID Connect provider that publishes discovery metadata is supported. Release testing covers Microsoft Entra ID and Google. This answers Q-006 and is the Server's answer to Q-019.

Alternatives rejected:
- Acting only as a resource server that validates the provider's tokens directly. Entra ID and most enterprise providers offer neither dynamic registration nor Client ID Metadata Documents, so Claude and ChatGPT could not complete sign-in against them (Q-019).
- Cloudflare's `workers-oauth-provider`. It needs Workers KV, so AWS and Azure would need a second implementation.
- Storing grants in the Database. That writes into the customer's Database, which the Database account may not be allowed to do, and which a Security reviewer would question.

Consequence: The Server carries hand-written OAuth endpoints, the most security-sensitive code in the product. It needs its own test suite and its own section of the Security material. There is no revocation short of expiry, which matches D-024. If the one deployment secret rotates, every Staff member has to sign in again.

## ADR-005 — The Query check trusts the engine: the engine's own parser and plan decide what an Agent-written query reads
Traces: R-003, R-004, R-006
This builds on D-013, D-035, D-038 in the decisions register.
Decision: The check has three layers.
1. **Structure.**
   - On PostgreSQL, the query is parsed with `libpg-query`, which is PostgreSQL's own parser compiled to WebAssembly. The query must be exactly one SELECT, with no data-modifying CTE, no locking clause, no `INTO`, only allow-listed built-in functions (D-038) and no system-catalog schemas.
   - On MS SQL Server, `node-sql-parser` (T-SQL dialect) acts as a coarse pre-filter, and anything it cannot parse is refused (D-013).
2. **Plan.** The engine plans the query without running it: `EXPLAIN (VERBOSE, FORMAT JSON)` on PostgreSQL, and `SET SHOWPLAN_XML ON` on MS SQL Server. Every relation and column the plan reads must be a Visible object, and on MS SQL Server the plan must hold exactly one SELECT statement and no user-defined function call.
3. **Execution.** The query runs inside a read-only transaction on PostgreSQL. On MS SQL Server, where no such mode exists, it runs inside a transaction that is always rolled back.

Alternatives rejected:
- A single JavaScript parser for both engines, with no plan check. Wherever the parser and the engine disagree, a hidden read gets through, and attackers look for exactly those disagreements.
- Rewriting the query into a sandboxed form, such as wrapping it in a subquery with LIMIT. That changes semantics such as ORDER BY, and it is still parser-dependent.
- Relying on the Database account's grants alone. Those grants cannot express the per-call Allow-list (R-003).

Consequence: Every Agent-written query costs one extra round trip for the plan. `libpg-query` adds about 1 MB of WebAssembly to the Worker bundle, which still fits the paid Worker size limit but not the free one, so the Deployment kit says so. On MS SQL Server the structural layer is weaker, so the plan check carries more weight. The list of supported constructs per Engine is written down in the system spec.

## ADR-006 — The Allow-list travels in the connector URL path that the Organisation admin configures
Traces: R-003, R-017, J-003
This builds on D-009, D-011, D-012 in the decisions register.
Decision: The admin builds a URL of the form `https://<host>/mcp/a/<encoded>`. `<encoded>` is the Allow-list (tables, each with optional columns), as compact JSON, deflate-compressed and base64url-encoded. The project ships a small command-line helper that produces it. The admin enters this URL as the organisation's custom connector in Claude or ChatGPT. Staff members connect to that connector but cannot edit its URL.

The Server decodes the Allow-list on every request and treats it as untrusted narrowing input (D-009). A connector URL without the `/a/<encoded>` segment therefore exposes only Created objects, by D-012. This is the Server's answer to Q-015, still to be proven live (skeleton.md).

Alternatives rejected:
- A custom request header. Neither Claude's nor ChatGPT's organisation connector settings accept custom headers, only the server URL and OAuth client settings.
- A URL query string. OAuth resource identifiers should not carry a query (RFC 8707), and the URL is the resource identifier here.
- An Allow-list held on the Server. That reverses D-011.

Consequence: The Allow-list is visible to anyone who can see the connector URL. It names Objects, but it grants nothing beyond what the Boundary already allows. Its size is bounded by URL length limits, roughly a few hundred tables and columns, and the helper warns when a list gets close. Changing the Allow-list changes the URL, so the admin replaces the connector, and Staff members may have to reconnect.

## ADR-007 — A Conversation is identified by a signed Conversation token the Agent carries
Traces: R-016, J-006
This builds on D-025, D-031, D-039 in the decisions register.
Decision: Create table returns a Conversation token: an HMAC-signed value naming the Staff member and the Created objects so far. The tools that read or act on Created objects take it as an optional input, and each further create returns an extended token. A token is honoured only for the Staff member it names. A reopened Conversation still has the token in its history, so the Created objects stay visible there (D-025). A new Conversation starts without a token, so they are not visible there. This is the Server's answer to Q-014, so D-039's deferral is not triggered.
Alternatives rejected:
- The MCP session or connection as the Conversation. One connection can span several Conversations and drop in the middle of one (Q-014), and stateless MCP (ADR-003) has no session anyway.
- A conversation ID from the AI tool. Neither Claude nor ChatGPT sends one to remote servers.
- A server-side registry of Created objects. It needs a store (ADR-004), and it still could not tell Conversations apart.
Consequence: Visibility now depends on the Agent passing the token back. An Agent that drops it loses its Created objects in the middle of a Conversation, which is J-006's recreate exit. A Staff member who pastes a token into another Conversation makes those Created objects visible there. That is their own choice, and colleagues cannot use it. The Security material says both.

## ADR-008 — PostgreSQL through `pg` (with Hyperdrive on Cloudflare); MS SQL Server through `mssql` on containers only for now
Traces: R-001, R-002
This builds on D-020 in the decisions register.
Decision: PostgreSQL is reached with `pg`. On Workers the connection goes through a Hyperdrive binding, which pools connections and keeps them warm across invocations. In containers, `pg` keeps its own pool. MS SQL Server is reached with `mssql` (`tedious`) from the container image.

Whether `tedious` runs on Workers is unproven. Its TLS-inside-TDS handshake needs Node `tls` over a custom stream, which Workers' Node compatibility may not provide, and Hyperdrive does not support MS SQL Server. This is the open part of Q-001. One spike settles it in the slice that adds the other cloud and Engine pairings (PRD sequencing step 5), and if it fails, D-020 drops the pairing.
Alternatives rejected:
- `postgres` (postgres.js). It is equally capable, but `pg` is the driver Hyperdrive documents first and the one most Operators already know.
- Connecting to PostgreSQL directly from Workers without Hyperdrive. Every invocation would open a new TLS connection, which costs latency and exhausts connections on small databases.
Consequence: The two engines behave differently enough that every Typed tool and the Query check carry tests for both. For now, Cloudflare Deployments support PostgreSQL only.

## ADR-009 — Each cloud deploys with its own native tooling
Traces: R-001, R-013, J-001
Decision: Cloudflare uses Wrangler, AWS uses a CloudFormation template, and Azure uses a Bicep template. Each comes in a public and a private variant, and each takes the Server settings as parameters.
Alternatives rejected:
- Terraform across all three clouds. It is one more tool to install and learn inside the hour, and Cloudflare Workers deploy more simply with Wrangler.
- Click-through console instructions. They cannot be tested, and they drift with every console redesign.
Consequence: There are three deployment definitions to keep in step. The deployment trial (PRD metric) is what catches drift.

## ADR-010 — Vitest, with real engines in Docker for integration tests
Traces: R-002, R-003, R-004
Decision: Unit tests run under Vitest in Node. Integration tests run against PostgreSQL 17 and MS SQL Server 2022 containers, started with Docker Compose. The release test harness runs against a deployed Deployment.
Alternatives rejected:
- Mocking the drivers. The Query check's plan layer is only meaningful against a real engine.
- `@cloudflare/vitest-pool-workers` for everything. It cannot run the MS SQL Server path, and the Worker-specific code is a thin adapter.
Consequence: Developers need Docker to run the integration suite. The Worker adapter itself is covered by the skeleton's smoke test and the deployed harness, not by unit tests.

## ADR-011 — Every tool takes a required `request_text` input, logged as the Request text
Traces: R-010, R-011, J-008
This builds on D-021 in the decisions register.
Decision: Every tool's schema includes `request_text`, described to the Agent as the Staff member's question in its own words. The Server logs it as received and never redacts it. This is the Server's answer to Q-002: the Agent's account is accepted, and the Security material says it cannot be verified.
Alternatives rejected:
- No Request text at all. That fails R-010.
- Asking the AI tool for the Staff member's original message. No MCP mechanism exists to do that.
Consequence: An Agent can write anything in `request_text`, or leave it vague. J-008's inconclusive-trail exit stays real.

## ADR-012 — One Deployment serves exactly one Database
Traces: R-002, R-007, J-001
Decision: Each Deployment has one connection, one Database account, one Boundary and one Permission tier. An organisation with several Databases runs several Deployments, each its own connector. This answers Q-009.
Alternatives rejected:
- One Deployment with many Databases. That needs a per-Database Boundary and tier inside one set of Server settings, and an Allow-list format that names the Database, which is more surface for a reviewer to check.
Consequence: More Deployments to run, and more connectors for the Organisation admin to manage.

## ADR-013 — Audit records are JSON lines on standard output, kept by the Host log facility's own retention
Traces: R-010, R-011, J-008
This builds on D-006, D-008 in the decisions register.
Decision: The Audit logger writes one JSON object per Tool call to standard output, and on Workers through `console.log`. Workers Logs, CloudWatch Logs or Azure Monitor keep it, depending on the runtime. The Wrangler config enables Workers Logs with full sampling.
Alternatives rejected:
- Writing Audit records to the Database. That writes into the customer's Database and can fail with the very grant problems it is meant to record.
- Logpush or other export. That moves records off the Host (D-006).
Consequence: Retention is whatever the Host log facility offers. On Cloudflare that is a fixed few days (about 7 on paid plans), with no option to keep records longer on the Host. That bears directly on Q-010, and the Security material must state it. On AWS and Azure the Operator sets the retention.
