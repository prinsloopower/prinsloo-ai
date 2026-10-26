## Q-001 — Must both engines work on all three clouds?
Raised by: discovery | Blocks: architecture
Running on Cloudflare may limit which databases the server can reach directly, especially MS SQL Server. Concerns R-001 and R-002.
Answered (conditionally) by the product owner, interview answer 29: see D-020. Architecture still establishes feasibility.
Answered by the product owner at the slices gate: see D-063. No; PostgreSQL is served from Cloudflare and MS SQL Server from Azure.

## Q-002 — Is the agent's own account of the question acceptable as the logged natural-language request?
Raised by: discovery | Blocks: architecture
The server sees tool calls, not what the person typed. Concerns R-010.
Answered at architecture: see D-048 (ADR-011).

## Q-003 — What counts as a typical question and a correct answer, and who supplies the representative set?
Raised by: discovery | Blocks: prd
Concerns R-012.
Answered at prd: see D-037.

## Q-004 — Who writes the semantic model, and does the project help keep it in step with the allow-list?
Raised by: discovery | Blocks: prd (re-routed from domain by the router, 2026-10-10: no domain term depends on the answer; it is a scope question alongside Q-005)
Concerns R-003 and R-006.
Answered at prd: see D-034.

## Q-005 — Do semantic models ship with the project, or does each operator write their own?
Raised by: discovery | Blocks: prd
Concerns R-006 and R-013.
Answered at prd: see D-034.

## Q-006 — Which identity providers must sign-in support at first release?
Raised by: discovery | Blocks: architecture
Concerns R-009.
Answered at architecture: see D-048 (ADR-004).

## Q-007 — Is there any figure for the cost of the analyst queue?
Raised by: discovery | Blocks: prd
Concerns R-012.

## Q-008 — Which schema changes are in scope for the DDL tools?
Raised by: discovery | Blocks: prd
Concerns R-005 and R-007.
Answered at prd: see D-030.

## Q-009 — Is one deployment connected to one database, or several?
Raised by: discovery | Blocks: architecture
Concerns R-002 and R-007.
Answered at architecture: see D-048 (ADR-012).

## Q-010 — Must audit records be retained on the host for a set period?
Raised by: discovery | Blocks: system-spec
Shipping is answered: records stay on the host (answer 13). Retention is not. Concerns R-010.
Answered by the product owner at system-spec: see D-052.

## Q-011 — Is there a framework security reviewers will check against?
Raised by: discovery | Blocks: system-spec
Concerns R-014.
Answered by the product owner at system-spec: see D-055.

## Q-012 — Which AI client and model is answer correctness measured with?
Raised by: discovery | Blocks: prd
Answer quality depends on the client's model and the semantic model, not only the server. Concerns R-012.
Answered at prd: see D-037.

## Q-013 — May the agent create an object outside the server's visibility boundary?
Raised by: discovery | Blocks: prd
If so, it is visible for the conversation (R-016) but no allow-list could ever make it visible later. Concerns R-003 and R-016.
Answered at prd: see D-031.

## Q-014 — How does the server tell one conversation from the next?
Raised by: discovery | Blocks: architecture
A connection may span many chats or drop mid-chat. Concerns R-016.
Answered at architecture: see D-048 (ADR-007).

## Q-015 — Do the target AI tools have admin-managed configuration that can carry an allow-list to a remote server?
Raised by: journeys | Blocks: architecture
D-011 places the allow-list in admin-managed client configuration. If Claude, ChatGPT or Copilot (interview answer 2) offer no channel for an admin to pass it to a remote MCP server, J-003 cannot complete for that tool. Concerns R-003, R-017, J-003.
Lapsed under D-074 (2026-10-20): the Allow-list no longer travels with the AI tool, so no managed configuration needs to carry it.

## Q-016 — Does the person asking approve a write, delete or schema change before it runs?
Raised by: journeys | Blocks: prd
Nothing in the discovery document says. Without it, a misunderstood instruction changes data with no chance to stop it (J-005 exits). Concerns R-005, J-005, J-006.
Answered at prd: see D-032.

## Q-017 — Does the project give the organisation admin a way to see the names inside the boundary?
Raised by: journeys | Blocks: prd
The agent cannot show hidden objects, so to write an allow-list (J-003) the admin needs another view of the schema — their own database tools, or something the project provides. Concerns R-003, R-017, J-003.
Answered at prd: see D-033.

## Q-018 — Is query data passing to the AI tool's provider in scope for this product to address?
Raised by: journeys | Blocks: prd
Results the server returns go to whichever AI provider the client uses, outside the organisation. A reviewer may reject on that alone (J-007). Is it a stated non-goal, a disclosure in the reviewer material, or something the product mitigates? Concerns R-014, J-007.
Answered at prd: see D-036.

## Q-019 — Can the target AI tools complete sign-in against the organisation's identity provider?
Raised by: journeys | Blocks: architecture
MCP clients (Claude, ChatGPT, Copilot) commonly expect what some enterprise identity providers do not offer, such as dynamic client registration. If a client cannot complete sign-in, J-002 and J-004 stop for that tool. Concerns R-009, J-002, J-004.
Answered for Entra ID by S-001's live verification (.sdlc/verification/S-001.md): yes. Claude and ChatGPT both complete Sign-in through the Server's broker by Client ID Metadata Document, and renewal works. Google is untested until Q-023.
## Q-020 — Do views (and other schema items such as functions) count as Objects?
Raised by: domain | Blocks: prd
Upstream speaks only of tables and columns. Reporting databases often expose data through views; whether the Boundary and Allow-list can name them, and whether the Query check treats them as Objects, changes what Staff members can ask. Concerns R-003, R-004.
Answered at prd: see D-035.

## Q-021 — Which Database does the project test Deployment use once Tool calls run?
Raised by: system-spec | Blocks: slice (PRD sequencing step 2)
The skeleton borrows another product's Supabase project (D-049). The Sign-in slice is the first to send a Tool call's Statement, and the benchmark needs a sample Database per Engine (D-037). Before then, the project needs a PostgreSQL of its own: a new Supabase project, another host, or Docker on a reachable machine.
Answered by the product owner after the system-spec gate: see D-060.

## Q-022 — Which Azure subscription and Azure SQL Database do the MS SQL Server slices test against?
Raised by: slices | Blocks: slice-spec for S-006
D-065 says the product owner provides them. Until they exist, nothing can deploy to Azure or measure MS SQL Server. The answer is the subscription, the resource group, the Azure SQL Database (server, database and tier), and confirmation that a `sqlmcp_test` schema can be created there.

## Q-023 — Who creates the Google OAuth client for the Sign-in test run, and when?
Raised by: slice-spec (S-001) | Blocks: S-001 verification (T-011)
ADR-004 tests Entra ID and Google at release. The product owner has an Entra account. No Google OAuth client exists yet. It needs to be a web application client with redirect URI `https://sql-mcp-server.prinsloopower.workers.dev/oauth/callback`.
Answered by the product owner at S-001's verification: see D-073. Nobody does: Google is dropped from the release's sign-in requirements.

## Q-024 — Should the workerd test allow for a cold first boot?
Raised by: build (S-001) | Blocks: nothing; affects first-run results
In a fresh clone, `test/mcp.test.ts`'s workerd test failed once, because workerd's first boot took about 12 s against Vitest's default 5 s per test. It then passed twice. The test belongs to the architecture phase's skeleton, so S-001 left it alone. A per-test timeout of 30 s would remove the flake.

## Q-025 — Does a renewed Refresh token keep the original 30-day limit?
Raised by: code-review (S-001) | Blocks: nothing; affects how long a stolen Refresh token can be renewed
The data model says the Refresh token is not rotated on use, and D-051 says it lasts at most 30 days. The S-001 spec has a renewal carry a rotated provider refresh token in a new Refresh token, but does not say what that token's `exp` is. The build gives it a fresh 30 days. With Entra ID, which rotates on every refresh, that makes the chain unbounded, and earlier Refresh tokens stay valid in parallel. The alternative is for the new token to inherit the presented token's `exp`.
Answered by the product owner: see D-071. It inherits.

## Q-026 — security.md's redirect URI rule needs the loopback-port exception
Raised by: verify (S-001) | Blocks: nothing; to apply at the next system-spec revision
security.md says `/authorize` accepts only "a `redirect_uri` exactly equal to one the Client registration lists". D-072 adds RFC 8252's exception: a plain-http loopback URI may carry any port. The rule should say so, so that S-006's Node adapter and later reviews do not take the exact-match wording as current. The system spec was left unedited for now, because editing it re-gates the slices, and that clears the declared slice from the pipeline state. The same revision should also bring the slice list's S-001 line and ADR-004 in line with D-073, which drops Google from the tested providers.
Resolved in the D-074 amendment (2026-10-20): security.md now carries the loopback-port exception (D-072), and the slice list and ADR-004 name Entra ID only (D-073).

## Q-027 — Should the Allow-list travel in a request header after all?
Raised by: verify (S-001) | Blocks: slice-spec for S-002
ADR-006 put the Allow-list in the connector URL path because "neither Claude's nor ChatGPT's organisation connector settings accept custom headers". Claude's connector settings now offer up to four request headers, sent with every request and stored securely. A header would keep the Allow-list out of URLs and out of the platform's request logs (D-056). It also might not change the OAuth resource identifier when the list changes, which would avoid reconnecting. Before S-002 is specified, check whether ChatGPT offers the same and whether the Organisation admin can lock the header so Staff members cannot edit it (D-011, D-040), then keep or revise ADR-006.
Lapsed under D-074 (2026-10-20): the Allow-list is read from the Database account's grants, not sent by the AI tool in a URL or a header.

## Q-028 — How does the pipeline open a second iteration?
Raised by: router (iteration 2) | Blocks: nothing; affects metrics
`sdlc_lint.py next` reports `iteration-complete`, but no command increments `state.iteration`, which only `init` sets. Iteration 2's amendment and slices are therefore logged as iteration 1 in `metrics.jsonl`, and `improve`'s recurrence count, which counts reflection headings across iterations, cannot tell the two apart from the metrics. This is for the improve step: add `sdlc_lint.py iteration` (or have `size` open one after `iteration-complete`).

## Q-029 — How are Created objects owned and found on MS SQL Server?
Raised by: amendment critique (D-076) | Blocks: slice-spec for S-012 on MS SQL Server
D-076 relies on the Database account owning what it creates, as on PostgreSQL. On MS SQL Server a new table's owner is normally its schema's owner (`principal_id` NULL), not its creator. An account with only CREATE TABLE and ALTER on a schema could not SELECT its own Created object, and an account that owns the schema owns every table in it. S-012 needs a design for SQL Server: a schema the Database account owns, inside the Boundary, kept for Created objects; how "owned by the account" is computed there; and how the Database administrator takes one over (`ALTER AUTHORIZATION` and a schema transfer).

## Q-030 — System-spec and domain wording owed by S-002
Raised by: slice-spec (S-002) | Blocks: nothing; apply at the next revision of the domain model and system spec
- Domain model, Typed tool: allow a Typed tool that produces no Statements, only Server statements (`list_tables`, D-078).
- data-model.md, Audit record: add the Refusal class `unsafe_account` (D-078).
- environments.md, `HYPERDRIVE`: the config is created with caching disabled (D-079).
- security.md or data-model.md: the error-class mapping and fixed sentences, and which refusals are Tool calls (D-080).
- ADR-006, security.md and data-model.md: the account check's membership, `CREATEROLE` and `session_user` cases; ownership through any membership; `user-defined` column types; and Boundary exclusions ignoring letter case (D-081).
These are left out of the gated documents for now because editing them re-gates the slice list, and that clears the declared slice (S-002) from the pipeline state (Q-028, reflections).

## Q-031 — Does the D-077 account check cover roles the account can switch to?
Raised by: code-review (S-002) | Blocks: slice-spec for S-003 (Agent-written SQL runs as this account)
D-077 checks `rolsuper` and `rolbypassrls` of the account itself. Those attributes are not inherited, so an account that is a member of a superuser or BYPASSRLS role (for example `GRANT postgres TO sqlmcp_reader`) passes, and it can `SET ROLE` to that role. An account with `CREATEROLE` can grant itself `pg_read_all_data` before PostgreSQL 16. The check also reads `current_user`, so a superuser that connects with a `role` startup option passes while `session_user` can `RESET ROLE`. Options: refuse membership (`pg_has_role(…, 'MEMBER')`) of any role with `rolsuper` or `rolbypassrls`, refuse `rolcreaterole`, check `session_user` as well, or rely on S-003's query check refusing `SET`/`RESET ROLE` and say so in the Security material.
Answered by the product owner: see D-081. Refuse every route.

## Q-032 — Should the supported constructs include AT TIME ZONE and array constructors?
Raised by: slice-spec (S-003) | Blocks: nothing; affects R-012 and the benchmark (S-004)
security.md lists no `timezone` function, which `AT TIME ZONE` compiles to, and no `ARRAY[…]` or `ARRAY(subquery)`. Typical questions over `timestamptz` data ("orders per day in Johannesburg time") need the first. The S-003 Query check refuses both, as security.md says to do for anything not listed. Adding them is a security.md edit plus Query check tests, and editing security.md mid-slice re-gates the slice list (Q-030). S-004's benchmark will show whether their absence costs correct answers.
Answered by the product owner, 2026-10-25: add both now. See D-084.

## Q-033 — System-spec and data-model wording owed by S-003
Raised by: slice-spec (S-003) | Blocks: nothing; apply at the next revision of the system spec
- security.md, Query check: the Agent's query runs with `search_path` pinned to `pg_catalog`, and tables must be schema-qualified. `reg*` casts and schema-qualified functions, operators and types outside `pg_catalog` are refused. Plan-stage failures are Refusals with one shared sentence (D-082).
- data-model.md, Audit record: `submitted_sql` is kept for every Agent-written query that was not sent, refused or ended before sending, not for refusals only (D-089). Logged SQL kept by its length reads `<unparsed: N chars>`.
- data-model.md, Audit record: `inputs` is `{}` for `query`, because the SQL is in `statements` or `submitted_sql`. A Statement's `rows` is the count returned to the Agent (D-082).
- domain-model.md, Database error: it also covers a fault in the Server's own work during a Tool call, when nothing was sent (D-090).
- security.md, Redaction rule: the normaliser's `$n` placeholders are written as `?` (D-082).
- security.md, Query check: columns must be qualified, `NATURAL`/`USING` joins are refused, casts name only an allow-list of built-in types, and a column whose type reaches a `reg*` type or a composite, at any depth, cannot be read (D-085). Partitions, inheritance children and row-level security policy tables are read under the named table's grant (D-082).
- security.md, "every user-defined function is refused (D-038)": add that row-level security policy functions (D-083) and casts on user-defined column types (D-085) run as their owners wrote them.
- ADR-005 and security.md: the PostgreSQL parser package is `@libpg-query/parser` 17.x, because the plain `libpg-query` package has no `normalize`. Its WebAssembly is about 2.0 MB, not 1 MB.
These are left out of the gated documents for the reason Q-030 gives.
Product owner, 2026-10-25: batch with Q-030 at the next system-spec revision. D-084's security.md edit is made now; the rest of this list waits.

## Q-034 — Should Agent-written queries read enum, domain and other user-defined-type columns?
Raised by: slice-spec (S-003) | Blocks: nothing; affects R-006 and R-012
D-082 refuses any column whose type is not built in, because a cast or implicit cast defined on such a type can run a user function (`SECURITY DEFINER` included) that the Query check cannot see. Supabase schemas often use enums for status columns, and extension types such as `citext` sit outside `pg_catalog`, so those columns can be listed but not queried. The alternative is a Server statement that admits a type only when `pg_cast` holds no cast to or from it, its base type or its element type through a function outside `pg_catalog`. Opclass support functions of composite fields would also need care. S-004's benchmark will show how often the refusal costs an answer.
Answered by the product owner, 2026-10-25: trust conversions like policies. See D-085.

## Q-035 — How does S-007 parse T-SQL's AT TIME ZONE?
Raised by: amendment critique (D-084) | Blocks: slice-spec for S-007
security.md now lists `AT TIME ZONE` for MS SQL Server (D-084). ADR-005 and the Redaction rule use `node-sql-parser`'s T-SQL AST, and version 5.4.0 cannot parse it: it reads `AT` as an alias and stops at `TIME`. Unless that changes, S-007's structural layer refuses a construct security.md supports, and its Redaction logs such SQL as `<unparsed>`. Options: a newer or patched parser; a narrow pre-parse rewrite whose correctness the plan check (SHOWPLAN) backs; or dropping `AT TIME ZONE` from the MS SQL Server column. T-SQL also takes Windows time-zone names (`'South Africa Standard Time'`), not IANA names, which S-004's and S-008's benchmark questions must allow for.

## Q-036 — What is a fault in the Server's own work called, and how is it recorded?
Raised by: code-review (S-003, review 3) | Blocks: nothing; affects the domain model, data-model.md and S-010
The domain model gives a Tool call three outcomes: it runs, it ends in a Refusal, or it ends in a Database error, defined as the Database rejecting a Statement the Server sent. Since S-003's second rework, a fault inside the Server's own work during a Tool call has a fourth kind of ending, though nothing was sent. The example is the PostgreSQL parser failing to load. It is recorded as a Database error of class `other` (D-089):
- the Agent is told "The database could not complete this.";
- the Audit record says `database_error`;
- a `server_fault` line is written, and operations.md alerts on it.

An Operator tracing the record (J-008) may look at the Database first. The options are:
- accept this, and add the case to the Database error definition;
- add a fourth outcome, such as Server fault, with its own sentence, Audit `kind` and data-model entry;
- class it as a Refusal.
Answered by the product owner, 2026-10-25: "accepted", the first option. See D-090. The domain model's wording waits for its next revision, with Q-030 and Q-033.
