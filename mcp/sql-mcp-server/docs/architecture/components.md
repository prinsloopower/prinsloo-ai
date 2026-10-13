# Components — sql-mcp-server

## Runtime adapter
Traces: R-001, R-013, J-001
Turns the platform's entry point into a web-standard Request and reads Server settings from the platform's environment. There are two of them: a Worker `fetch` handler, and a Node HTTP server for the container image (ADR-001). This is the only code that differs between clouds.
Talks to: the Sign-in broker and the MCP endpoint; `/healthz` goes straight to the Engine adapter.

## Sign-in broker
Traces: R-009, R-017, J-002
This builds on D-017, D-024, D-044 in the decisions register.
Acts as the OAuth 2.1 authorization server that Claude and ChatGPT discover. It publishes protected-resource and authorization-server metadata, accepts Client ID Metadata Documents and stateless dynamic registration, and runs PKCE. For the sign-in itself it sends the Staff member to the organisation's Identity provider (ADR-004).

The access tokens it issues are self-contained and encrypted, and they expire no later than the Identity provider's ID token. Until the Identity provider settings exist, it answers every call with 401 and the not-authenticated message (D-017). It also blocks every call that has no valid token, and writes no Audit record for it (D-044).
Talks to: the Identity provider, and the MCP endpoint, to which it passes the verified Staff member.

## MCP endpoint
Traces: R-004, R-006, R-007, R-015, J-004, J-005
Runs the MCP protocol in stateless mode (ADR-003). It registers only the Typed tools the Permission tier allows, so a lower tier has no higher-tier tool at all (R-007). It also registers the Agent-written query tool. It requires a Request text input on every tool (ADR-011), and it gives each Tool call exactly one Audit record.
Talks to: the Visibility resolver, the Query check, the Typed tools and the Audit logger.

## Visibility resolver
Traces: R-003, R-016, R-017, J-003, J-006
This builds on D-009, D-012 in the decisions register.
For each Tool call, it computes the Visible objects. That is the Boundary, intersected with the Allow-list decoded from the request URL (ADR-006), plus the Created objects in the verified Conversation token (ADR-007). It reads the Database catalog through Server statements, and the catalog view lasts for one Tool call only. Every list of names the Agent sees, including tool descriptions, comes from this resolver, and from nowhere else.
Talks to: the Engine adapter, for catalog Server statements.

## Query check
Traces: R-004, R-006
This builds on D-013, D-035, D-038 in the decisions register.
Accepts an Agent-written query only if it passes all three of these layers in turn (ADR-005):
1. A structural pass over the engine's own parse tree. The query must be one SELECT, built only from supported constructs, naming only Visible objects and calling only allow-listed built-in functions.
2. The engine's plan check. The plan is produced without execution, and every relation it reads must be a Visible object.
3. Execution inside a read-only transaction.

Anything it cannot analyse ends in a Refusal that tells the Agent the query was not accepted (D-013).
Talks to: the Engine adapter.

## Typed tools
Traces: R-005, R-007, R-008, R-016, J-005, J-006, J-009
This builds on D-030, D-031 in the decisions register.
Each tool builds a parameterised Statement from typed inputs that name only Visible objects. The tools are insert, update and delete by key, plus create table at the full tier. Create table refuses a target outside the Boundary (D-031), and its response returns an updated Conversation token and the Allow-list notice.
Talks to: the Visibility resolver and the Engine adapter.

## Engine adapter
Traces: R-002, R-003, R-008, R-015
This builds on D-004, D-005 in the decisions register.
Runs one interface over two drivers, one for PostgreSQL and one for MS SQL Server. It executes Statements and fetches at most Row limit + 1 rows, so it can mark a result as a Cut-short result without rewriting the SQL. It runs plan and catalog Server statements. It also turns every Database error into a reason class plus a message from which Hidden object names have been removed (D-005).
Talks to: the Database.

## Audit logger
Traces: R-010, R-011, J-008
This builds on D-007, D-026, D-028 in the decisions register.
Writes one structured JSON line per Tool call to the runtime's standard output, which the Host log facility collects (D-006, D-008). It applies Redaction to logged SQL and to Typed tool inputs. Request text is never redacted (R-011), and no result row is ever written.
Talks to: the Host log facility only.

## Deployment kit
Traces: R-001, R-013, J-001
This builds on D-018, D-041 in the decisions register.
Contains a Wrangler config, a CloudFormation template and a Bicep template, each with a public and a private variant, plus the docs that the one-hour deployment trial follows (ADR-009). A setting that is not set falls back to the defaults in D-007, D-012 and D-019.
Talks to: nothing at run time.

## Security material
Traces: R-014, R-017, J-007
This builds on D-014, D-036, D-040, D-043 in the decisions register.
The reviewer-facing documents in the repository. Each slice adds the section for what it delivers. The material states plainly what the Server does not enforce: the client lock on the connector URL, Request text being logged as received, results reaching the AI provider, and the Host log facility's own retention.
Talks to: nothing at run time.

## Release test harness
Traces: R-012, J-004, J-007
This builds on D-037, D-042, D-045 in the decisions register.
Contains the benchmark question set with expected answers over a sample Database for each Engine, plus the visibility, tier-matrix, sign-in and audit test runs that the PRD's metrics read from. It runs against a deployed Deployment, not against the source tree.
Talks to: a Deployment, as an MCP client.
