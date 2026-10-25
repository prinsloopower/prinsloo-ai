# Review — S-003

Reviewed: commits d53ede9, 1410f27 and 9505fea (`git diff 19c6faa..9505fea`) against the slice spec. The two axes ran in separate fresh contexts, neither seeing the other's findings, and are merged here with attribution. Two findings were raised on both axes and are merged into one each, noted where they appear.
Tests: `npm test` → 32 files, 191 passed, 0 failed, against Docker PostgreSQL 17 on 55432. `npm run typecheck` → clean. Both axes ran both commands.

Each axis verified:
- **Spec and scope:**
  - the Delivers path end to end;
  - every task T-001 to T-011 and T-014, with every named test present;
  - no Hidden-object leak path in the walker's qualifier resolution;
  - R-004's single read-only SELECT;
  - D-038 as narrowed by D-083 and D-085;
  - the catalog readability walk;
  - nothing outside the slice's tasks.
  T-012 and T-013 are manual and still open.
- **Standards and naming:** no rejected domain-model alias in new code, tests or docs; no credentials; no result values in Audit records.

## gap — A broken-pipe socket error during planning is treated as a plan Refusal
Where: src/engine/postgres.ts:283
Axis: standards and naming
`sqlstate()` is a second copy of the error-code reading in `classifyPostgresError` (postgres.ts:292), without its network-code handling. Its test, `/^[0-9A-Z]{5}$/`, also matches Node's `EPIPE`. So a broken pipe during `EXPLAIN` comes back as `plan_refused`: the Agent is told to check its names, and the Audit record says `query_check`, where D-080 and D-086 make it a `connection` Database error. The plan step should ask `classifyPostgresError(error) === "connection"`.

## gap — A failure after the query ran is recorded as never sent
Where: src/engine/postgres.ts:210
Axis: standards and naming; also raised on spec and scope (as a nit)
The last-resort `catch` returns `sent: false`. That includes a failure of the `TYPE_NAMES_SQL` Server statement, which runs after the cursor's `FETCH` succeeded. `answerQuery` then records `submitted_sql` and no Statement. That contradicts the spec ("A Database error during execution still records the Statement"), D-086, R-010 and the `QueryOutcome` doc comment. An Operator tracing the call reads "refused before sending" for SQL that ran.

## gap — PostgreSQL specifics sit in Engine-neutral places, and the shared parse sentence names PostgreSQL
Where: src/tools/query.ts:21
Axis: standards and naming
D-082 fixes the parse sentence as "…it is not valid <Engine name>.", but `QUERY_REFUSALS` hardcodes "PostgreSQL". `tools/query.ts`, `ToolContext.parser` (src/mcp.ts:41) and `Deps.parser` (src/app.ts:25) are typed to `PgParser` and the PostgreSQL `checkQuery`. `src/query/check.ts` and `src/query/redact.ts` walk libpg_query trees, but live outside `src/engine/`. Until this diff, Engine specifics stayed behind the Engine adapter (components.md). S-007 will either fork `tools/query.ts` or edit the shared sentence, and D-082 says both Engines share it.

## gap — `checkQuery` is named for the whole Query check but runs only its size and structure steps
Where: src/query/check.ts:547
Axis: standards and naming
In the domain model, the Query check includes the plan layer, which lives in `PostgresDatabase.query`. `checkQuery` returns `ok: true` after steps 1 and 2, and only a doc comment says so. S-007's adapter, or a later Typed tool trusting the name, could skip the plan backstop. A name like `checkStructure` would say what it does.

## gap — The MCP endpoint branches on the tool name in many places, and validates inputs three times
Where: src/mcp.ts:123
Axis: standards and naming
These all branch on the tool name:
- `toolCallOf` (line 49);
- `validInputs` (62);
- the `toolCall` body (129);
- `inputsOf`;
- `auditedSql` (96).

The list_tables runner then validates a third time (155), and `toolCall`'s `run` and `answer` are typed `QueryAnswer` even for list_tables. Each Typed tool in S-010 to S-012 adds another branch to each of these. A per-tool `{ validate, inputs, run }` record would stop that.

## gap — The Audit logger takes one Statement, though the format and Typed tools need a list
Where: src/audit.ts:26
Axis: standards and naming
`AuditEntry.statement?` is singular. The same `{ sql, rows, ms }` shape is declared again at src/tools/query.ts:69, and the line-cap loop (audit.ts:58–87) handles exactly two SQL strings. The record format is `statements: [...]`, and a Typed tool produces one or more Statements (domain model). The first Typed tool slice will reshape the entry and the cap loop, and may miss the second declaration.

## gap — Reason names in code differ from the logged `reason_class` values, which are untyped
Where: src/tools/query.ts:19
Axis: standards and naming
- **Names:** `RefusalReason` uses `hidden`, `plan` and `plan_unaccounted`. The record logs `hidden_object` and `query_check`.
- **Outcome kinds:** `plan_refused` and `error` stand where the Audit outcome says `refusal` and `database_error`.
- **Types:** `reasonClass` is a bare `string`, unlike the Database error `ReasonClass` union.

D-082 fixes the class values for both Engines, and S-007 will copy this table. Nothing would catch a misspelt `reason_class`. A `RefusalClass` union would.

## gap — A second, narrower `SYSTEM_SCHEMA`
Where: src/query/check.ts:105
Axis: standards and naming
src/visibility.ts:14 already defines `SYSTEM_SCHEMA`, including MS SQL Server's `sys` and `INFORMATION_SCHEMA`. check.ts declares its own narrower copy under the same name. When S-007 adds MS SQL Server schemas, the listing and the Query check can disagree about which schemas are system schemas.

## gap — `domain_constraints_run_as_written` asserts that the constraint does not run
Where: test/query/types.int.test.ts:85
Axis: standards and naming; also raised on spec and scope (as a nit)
The test, its comment and D-086 all show that PostgreSQL does not apply a domain's `CHECK` to the Agent's literal. The test name, the spec's Verified by line (spec.md:249) and its Proven by line (spec.md:192) all say the opposite, and no Q-### asks for the spec to be corrected. A Security reviewer reading the test list, or S-007's author, will take the name as proof that domain constraints run.

## gap — Redaction keeps SQL comments, so values written in a comment are logged with Redaction on
Where: src/query/redact.ts:21
Axis: spec and scope
`normalize` keeps comments, and the "no literal left" check looks only for leftover literal nodes. Verified with a probe: `SELECT o.id FROM sales.orders o -- note ann@example.com` and `/* card 4111 */` are logged unchanged with Redaction on. Agents often annotate SQL with the values they filter on. R-011 makes keeping values the Operator's choice, and here a value survives it. The spec's rule does not mention comments, and S-007's T-SQL redaction will meet the same question. There are two fixes: strip comments before normalising, or log SQL containing a comment by its length only. Either needs a D-###.

## gap — D-084's Proven by lines are checked only structurally, never run
Where: test/query/structure.test.ts:153
Axis: spec and scope
The spec says two things are run:
- over a `timestamptz` `created_at`, `date_trunc('day', o.created_at AT TIME ZONE 'Africa/Johannesburg')` puts a 22:30 UTC Monday order on Tuesday;
- `ARRAY[1, 2, 3]`, `= ANY (ARRAY[1, 2])` and `ARRAY(SELECT … LIMIT 3)` run and come back as `{1,2,3}`.

`query_check_accepts_at_time_zone_and_array_constructors` only asserts that the structural layer accepts them, using `now()` rather than a column. The engine fixture already holds the 22:30 UTC order (test/query/engine.int.test.ts:25), but no test reads it. A regression in the time-zone result (R-012) or the array text form would pass CI.

## nit — `AuditEntry` is close to the rejected alias "audit log entry"
Where: src/audit.ts:14
Axis: standards and naming
It dates from S-002, and this diff extends it. The agreed term is Audit record.

## nit — The plan sentence is written out twice
Where: src/tools/query.ts:37
Axis: standards and naming
`plan` and `plan_unaccounted` must stay identical (D-082), but they are two literals that can drift apart.

## nit — The statement-shape and byte-length checks are repeated
Where: src/query/redact.ts:28
Axis: standards and naming
`isOneSelect` repeats check.ts:556–559, and the UTF-8 byte-length test appears in redact.ts, check.ts and audit.ts.

## nit — Test helpers copied from listing.test.ts
Where: test/query/mcp-helpers.ts:25
Axis: standards and naming
`resultOf`, the audit-line and op-line filters, `ToolResult` and `ASK` duplicate test/listing/listing.test.ts:26–36.

## nit — `plan_refused.code` is set and never read
Where: src/engine/database.ts:53
Axis: standards and naming
Only the extended-protocol test reads it.

## nit — `reg_type_columns_and_domains_refused` contains no domain
Where: test/query/types.test.ts:17
Axis: standards and naming
The fake catalog cannot express a domain. That case is in types.int.test.ts.

## nit — `star` is a new name for `all_columns`-and-readable
Where: src/query/check.ts:30
Axis: standards and naming
`visibleObjects` also builds Visible objects outside src/visibility.ts, where `visibleTables` lives.

## nit — `literalFree` reads as a pure check but also fills `params`
Where: src/query/redact.ts:133
Axis: standards and naming

## nit — The Engine adapter times with `Date.now()`, not the injected clock
Where: src/engine/postgres.ts:189
Axis: standards and naming
Statement `ms` cannot be controlled in tests.

## nit — Cleanup errors are swallowed without a stated reason
Where: src/engine/postgres.ts:213
Axis: standards and naming
`ROLLBACK` and `end()` errors are dropped here and at line 172. S-002's `rows()` lets `end()` errors propagate.

## nit — The validated `sql` is ignored in favour of a cast
Where: src/mcp.ts:165
Axis: standards and naming
`answerQuery(args.sql as string, …)` casts instead of using the value `validateQuery` returned.

## nit — The Proven by join example runs over the test's own fixture
Where: test/query/engine.int.test.ts:114
Axis: spec and scope
The spec names S-002's `sqlmcp_reader` fixture. The test runs the same query shape over `qe_sales`, with exact counts. Only T-013's live run uses the real fixture.

Verdict: hold (0 blockers, 11 gaps, 12 nits)
