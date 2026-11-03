# Architecture decisions — sql-mcp-server

## ADR-001 — One TypeScript codebase on web-standard APIs, routed with Hono
Traces: R-001, R-002, R-013
Decision: The Server is written in TypeScript against web-standard Request, Response, fetch and Web Crypto. Hono does the routing. A thin adapter per runtime supplies the entry point and the settings.
Alternatives rejected:
- A separate codebase per cloud. The enforcement code (R-003, R-004) would exist two or three times and drift.
- Python or Go. Neither runs natively on Cloudflare Workers, which would force Cloudflare onto containers and remove the zero-infrastructure path for R-013.
- Express. It is tied to Node's HTTP server, so it would not run on Workers.
Consequence: Every dependency must run on both Workers and Node, which rules out drivers or parsers built on native Node add-ons. The engine adapters and the query check carry most of that cost (ADR-005, ADR-008).

## ADR-002 — Cloudflare runs a Worker for PostgreSQL; Azure runs the same code as a container image for MS SQL Server
Traces: R-001, R-013, J-001
This builds on D-018, D-041, D-063 in the decisions register.
Decision: PostgreSQL Deployments are Cloudflare Workers. MS SQL Server Deployments run the container image on Azure Container Apps, a managed container service with no cluster to operate (D-063). A Deployment sits behind each platform's public HTTPS endpoint. Private Deployments are deferred (D-064). When they return, they would be a Worker behind Cloudflare Access, or a Container App with internal ingress. AWS is deferred, and the image is built so that ECS Fargate can run it later without changes.
Alternatives rejected:
- Azure Functions. Its invocation model and connection handling need a database proxy to avoid connection exhaustion, which is one more setup to fit into an hour.
- Kubernetes. It needs a cluster the Operator may not have, and it does not fit inside the one hour.
- Containers on Cloudflare as well. That would give up Workers' free HTTPS endpoint and Hyperdrive pooling, for uniformity nobody needs.
- AWS ECS Fargate this iteration. Deferred by the product owner (D-063).
Consequence: There are two build artifacts to test and release, a Worker bundle and an image, and each serves one Engine.
Amended 2026-10-18 by D-063 and D-064: AWS removed, each runtime tied to one Engine, and private Deployments deferred.

## ADR-003 — MCP over Streamable HTTP, stateless, using the official SDK's web-standard transport
Traces: R-004, R-009, J-004
Decision: The Server uses `@modelcontextprotocol/sdk` with `WebStandardStreamableHTTPServerTransport`, with no session ID. Every request stands alone and carries its Sign-in and Conversation token.
Alternatives rejected:
- Stateful MCP sessions, which are Durable Objects on Cloudflare and sticky sessions on containers. They need per-cloud state, and a session is not a Conversation anyway (Q-014). See ADR-007.
- The legacy SSE transport, which is deprecated in the MCP specification.
Consequence: There are no server-initiated messages or resumable streams. That is acceptable, because every tool answers within its own request. Responses are plain JSON rather than SSE (`enableJsonResponse`), for the same reason. The SDK and its schema validators make up most of the Worker bundle: 1,116 KiB raw and 218 KiB gzipped, against 255 KiB without them (skeleton.md).

## ADR-004 — The Server is its own OAuth 2.1 authorization server, delegating sign-in to the organisation's OpenID Connect provider; it keeps no store
Traces: R-009, R-017, J-002
This builds on D-002, D-015, D-017, D-024, D-044 in the decisions register.
Decision: This adopts D-002's OAuth. The Server publishes protected-resource metadata (RFC 9728) and authorization-server metadata, and it accepts Client ID Metadata Documents, which Claude and ChatGPT both prefer under the 2026-07-28 MCP specification. It also offers dynamic client registration in which the issued `client_id` is a signed blob, so nothing is stored. It runs PKCE (S256) only.

At `/authorize` it sends the Staff member to the Identity provider as a confidential OpenID Connect client. On callback it verifies the ID token and issues its own access token: encrypted, bound to the resource, carrying the Staff member's subject and name, and expiring at the ID token's expiry (D-024). Refresh tokens carry the provider's refresh token, encrypted. Any OpenID Connect provider that publishes discovery metadata is supported. Release testing covers Microsoft Entra ID (D-073). This answers Q-006 and is the Server's answer to Q-019.

Alternatives rejected:
- Acting only as a resource server that validates the provider's tokens directly. Entra ID and most enterprise providers offer neither dynamic registration nor Client ID Metadata Documents, so Claude and ChatGPT could not complete sign-in against them (Q-019).
- Cloudflare's `workers-oauth-provider`. It needs Workers KV, so Azure would need a second implementation.
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
- Relying on the Database account's grants alone, although they are the Allow-list (ADR-006). They cannot express the Boundary or keep a Created object to its Conversation, and a query refused by the Database would still have been sent, with its error to clean (D-005).

Consequence: Every Agent-written query costs one extra round trip for the plan. `libpg-query` adds about 1 MB of WebAssembly to the Worker bundle, which still fits the paid Worker size limit but not the free one, so the Deployment kit says so. On MS SQL Server the structural layer is weaker, so the plan check carries more weight. The list of supported constructs per Engine is written down in the system spec.

## ADR-006 — The Allow-list is read from the Database account's grants
Traces: R-003, R-017, J-003
This builds on D-004, D-012, D-074 in the decisions register.
Decision: On each Tool call, the Visibility resolver reads the Allow-list from the Database in one catalog Server statement. The Allow-list is the tables and columns the Database account may SELECT: `has_table_privilege` and `has_column_privilege` on PostgreSQL, and `HAS_PERMS_BY_NAME` and `sys.fn_my_permissions` on MS SQL Server. The resolver intersects it with the Boundary (none when unset, D-075). It leaves out system schemas and tables the Database account owns, and adds the Created objects named by the Conversation token (D-076). The same statement checks whether the account holds any grant that reaches every table at once, as D-077 lists for each Engine. If it does, the Tool call answers 503 and writes `config_invalid`, while Sign-in, `/healthz` and the metadata endpoints keep answering. The connector URL is plain `/mcp`.
Alternatives rejected:
- The Allow-list in the connector URL path, the earlier form of this ADR. It leaks into URLs and request logs, forces a reconnect on each change, Staff members can alter it, and it depends on each AI tool's admin settings (Q-015).
- A request header (Q-027). Claude stores headers write-only, ChatGPT's support is unknown, and Staff members can still alter it.
- A list held as a Server setting. It works, but it splits ownership between the Server's settings and the Database's own grants, and the Database would still allow reads the list forbids.
Consequence: The Database enforces the Allow-list itself, so a defect in the Visibility resolver cannot read what was not granted. Each Tool call costs one catalog Server statement. Every Staff member on a Deployment sees the same Allow-list. Different lists per group need Identity provider groups mapped to database roles (`SET ROLE` / `EXECUTE AS USER`), which is a later slice. `SELECT *` on a partly granted table fails in the Database, so the Agent names columns. Supersedes the URL-path design of 2026-10-11 (D-074).

## ADR-007 — A Conversation is identified by a signed Conversation token the Agent carries
Traces: R-016, J-006
This builds on D-025, D-031, D-039 in the decisions register.
Decision: Create table returns a Conversation token: an HMAC-signed value naming the Staff member and the Created objects so far. The tools that read or act on Created objects take it as an optional input, and each further create returns an extended token. A token is honoured only for the Staff member it names. A reopened Conversation still has the token in its history, so the Created objects stay visible there (D-025). A new Conversation starts without a token, so they are not visible there. This is the Server's answer to Q-014, so D-039's deferral is not triggered.
Alternatives rejected:
- The MCP session or connection as the Conversation. One connection can span several Conversations and drop in the middle of one (Q-014), and stateless MCP (ADR-003) has no session anyway.
- A conversation ID from the AI tool. Neither Claude nor ChatGPT sends one to remote servers.
- A server-side registry of Created objects. It needs a store (ADR-004), and it still could not tell Conversations apart.
Consequence: Visibility now depends on the Agent passing the token back. An Agent that drops it loses its Created objects in the middle of a Conversation, which is J-006's recreate exit. A Staff member who pastes a token into another Conversation makes those Created objects visible there. That is their own choice, and colleagues cannot use it. The Security material says both.

## ADR-008 — PostgreSQL on Supabase through `pg` and Hyperdrive; MS SQL Server through `mssql` from the Azure container
Traces: R-001, R-002
This builds on D-020, D-063 in the decisions register.
Decision: PostgreSQL is reached with `pg` from the Worker, through a Hyperdrive binding that points at the Supabase session pooler (port 5432). Hyperdrive pools connections and keeps them warm across invocations. MS SQL Server is reached with `mssql` (`tedious`) from the container image on Azure. Each runtime carries only its own Engine's driver (D-063).

Whether `tedious` runs on Workers no longer matters, because MS SQL Server is not served from Cloudflare (D-063 answers Q-001).
Alternatives rejected:
- `postgres` (postgres.js). It is equally capable, but `pg` is the driver Hyperdrive documents first and the one most Operators already know.
- Connecting to PostgreSQL directly from Workers without Hyperdrive. Every invocation would open a new TLS connection, which costs latency and exhausts connections on small databases.
- MS SQL Server on Workers through `tedious`. It is unproven, Hyperdrive does not support it, and D-063 takes it out of scope.

Consequence: The two engines behave differently enough that every Typed tool and the Query check carry tests for both. Supabase's pooler and its default roles bound what the Deployment kit can say about Database accounts for PostgreSQL.
Amended 2026-10-18 by D-063: PostgreSQL is Supabase-only, and MS SQL Server runs from Azure only.

## ADR-009 — Each cloud deploys with its own native tooling
Traces: R-001, R-013, J-001
Decision: Cloudflare uses Wrangler, and Azure uses a Bicep template. Each deploys a public Deployment (D-064), and each takes the Server settings as parameters. A CloudFormation template waits for AWS (D-063).
Alternatives rejected:
- Terraform across both clouds. It is one more tool to install and learn inside the hour, and Cloudflare Workers deploy more simply with Wrangler.
- Click-through console instructions. They cannot be tested, and they drift with every console redesign.
Consequence: There are two deployment definitions to keep in step. The deployment trial (PRD metric) is what catches drift.
Amended 2026-10-18 by D-063: CloudFormation deferred with AWS.

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
- One Deployment with many Databases. That needs a per-Database Boundary, tier and Database account inside one set of Server settings, which is more surface for a reviewer to check.
Consequence: More Deployments to run, and more connectors for each AI tool's workspace admin to add.

## ADR-013 — Audit records are JSON lines on standard output, kept by the Host log facility's own retention
Traces: R-010, R-011, J-008
This builds on D-006, D-008 in the decisions register.
Decision: The Audit logger writes one JSON object per Tool call to standard output, and on Workers through `console.log`. Workers Logs or Azure Monitor keeps it, depending on the runtime. The Wrangler config enables Workers Logs with full sampling.
Alternatives rejected:
- Writing Audit records to the Database. That writes into the customer's Database and can fail with the very grant problems it is meant to record.
- Logpush or other export. That moves records off the Host (D-006).
Consequence: Retention is whatever the Host log facility offers. On Cloudflare that is a fixed few days (about 7 on paid plans), with no option to keep records longer on the Host. That bears directly on Q-010, and the Security material must state it. On Azure the Operator sets the retention.
