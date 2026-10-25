# Review — S-003

## Review 1 (2026-10-25)

Reviewed: commits d53ede9, 1410f27 and 9505fea against the slice spec, on two axes in separate fresh contexts. Tests: `npm test` → 32 files, 191 passed. Verdict: hold (0 blockers, 11 gaps, 12 nits).

The product owner chose to fix all eleven gaps in this slice, and to strip comments under Redaction (D-087). The rework is commit a5298a3. Review 2 confirmed every gap resolved. These were the gaps:
- a plan-step socket error treated as a Refusal;
- a failure after the fetch recorded as unsent;
- PostgreSQL specifics in Engine-neutral places;
- `checkQuery` misnamed;
- tool-name branching in the MCP endpoint;
- a singular Statement in the Audit logger;
- untyped Refusal classes;
- a second `SYSTEM_SCHEMA`;
- a misnamed domain-constraint test;
- comments kept under Redaction;
- D-084's constructs never run.

Its Where lines cited `src/query/check.ts` and `src/query/redact.ts`. Those are now `src/engine/postgres-structure.ts` and `src/engine/postgres-redact.ts`.

## Review 2 (2026-10-25)

Reviewed: the whole slice, `git diff 19c6faa..a5298a3`, with the rework `git show a5298a3`. Both axes ran in separate fresh contexts and are merged here with attribution. One finding was raised on both axes and is merged into one, noted where it appears.
Tests: `npm test` → 33 files, 195 passed, 0 failed, against Docker PostgreSQL 17 on 55432. `npm run typecheck` → clean. Both axes ran both commands.

Each axis verified:
- **Spec and scope**, with a temporary probe since deleted:
  - about 55 structural queries, with no route to a hidden column found;
  - about 25 Redaction inputs;
  - the new tests would fail if their behaviour broke.
- **Standards and naming:** no stale reference to the old names or to `src/query/` is left in `src`, `test` or the Security material.

## blocker — Redaction throws on SQL the lexer cannot finish, so the call writes no Audit record
Where: src/engine/postgres-redact.ts:34
Axis: spec and scope
`withoutComments` calls `parser.scan`. On a lexer error, `_wasm_scan` returns error text, not JSON, so `JSON.parse` (src/engine/pg-parser.ts:161) throws a `SyntaxError`, which is not a `ParseError`, and `redactSql` rethrows it. The throw comes from `auditSql` (src/mcp.ts:101–105), so `writeAudit` never runs. Reproduced through the MCP harness with `SELECT o.id FROM sales.orders o WHERE o.total = 'secret-unterminated`: HTTP 200, the Agent gets `Unexpected token 'u'… is not valid JSON`, and there are zero Audit lines. `/* unterminated`, `$$x` and a `U&'…'` literal with a control character fail the same way. This breaks "every `query` call writes exactly one Audit record" (R-010) and D-080's sentence and reference. Before the rework, this input was logged as `<unparsed>`.

## gap — With Redaction on, any query using an ORDER BY or GROUP BY ordinal loses its SQL
Where: src/engine/postgres-redact.ts:56
Axis: spec and scope
`normalize` leaves `GROUP BY 1` and `ORDER BY 1` as constants, so the "no literal left" rule logs `SELECT o.id FROM sales.orders o GROUP BY 1` as `<unparsed: 42 chars>`. Ordinals are supported constructs, and common in Agent-written aggregates, so the Operator loses the SQL J-008 needs. No decision weighs this, and S-007's T-SQL redaction will meet the same question.

## gap — 14 files rewritten with CRLF line endings in an LF codebase
Where: src/app.ts:1
Axis: standards and naming; also raised on spec and scope (as a nit)
Before this slice, every file under `src/` and `test/` was LF, and the rework committed 14 of them as CRLF:
- src/app.ts, src/worker.ts, src/engine/postgres-queries.ts, src/engine/postgres-redact.ts;
- test/signin/helpers.ts;
- nine files under test/query/;
- docs/security-material/queries.md.

There is no `.gitattributes`, and `core.autocrlf` is false. test/signin/helpers.ts shows 687 changed lines for 7 real ones, and src/app.ts 279 for 9. The real edits to S-001/S-002 code are hidden in the churn, and `git blame` now points at a5298a3.

## gap — The answer shape is declared twice, and the Engine-neutral one holds a single Statement
Where: src/mcp.ts:46
Axis: standards and naming
`ToolCallAnswer` repeats `QueryAnswer` (src/tools/query.ts:66). Its `statement` is singular, while the logger now takes `statements: StatementRecord[]`. A Typed tool produces one or more Statements, so S-010 has to reshape this type in two places.

## gap — `queries` is a plural name for one QueryEngine, which goes by three names
Where: src/mcp.ts:38
Axis: standards and naming
The same object goes by three names:
- `ToolContext.queries` and `Deps.queries` (src/app.ts:25);
- `postgresQueries` and `nodeQueries`;
- `QueryContext.engine` (src/tools/query.ts:56).

`engine` also collides with the domain term Engine. S-007 will copy the pattern as `mssqlQueries`. One name, `queryEngine`, would agree with the type.

## gap — The Request text check and its sentence are copied into the query tool
Where: src/tools/query.ts:48
Axis: standards and naming
`validateQuery` repeats `validateListTables`'s `request_text` test and its exact sentence (src/tools/list-tables.ts:20–21). Every Tool needs a Request text (ADR-011), so each Typed tool would add another copy.

## gap — The Security material uses the rejected alias "the person asking"
Where: docs/security-material/queries.md:78
Axis: standards and naming
"…pass that notice on to the person asking (J-004)." "Person asking" is a rejected alias of Staff member (domain-model.md:23). This line is in the document a Security reviewer reads, and the lint does not scan the Security material.

## nit — A failed parser load is cached for the isolate's lifetime
Where: src/app.ts:116
Axis: spec and scope
`queries ??= loadQueries()` keeps a rejected promise, so every later `query` call fails in `auditSql`, again with no Audit record.

## nit — An `N'…'` literal is logged as an identifier
Where: src/engine/postgres-redact.ts:23
Axis: spec and scope
`= n'nat'` is logged as `= n$1`. No value leaks, but the logged SQL misstates the query.

## nit — D-087's "inputs checked once" is inexact
Where: src/mcp.ts:176
Axis: spec and scope; also raised on standards and naming
`prepare` runs before dispatch (line 158) and again in the handler. It is deliberate, so that the catalog is read once.

## nit — A doc comment stranded by the refactor, and stray blank lines
Where: src/engine/postgres.ts:296
Axis: standards and naming; also raised on spec and scope
`classifyPostgresError`'s doc comment now sits above `errorCode`. Double blank lines are left at postgres.ts:292–293 and src/engine/postgres-structure.ts:59–60.

## nit — `visibleKey` exists, but the key is still built by hand
Where: src/visibility.ts:61
Axis: standards and naming
The key is written out by hand at visibility.ts:61 and :71, and at src/engine/postgres.ts:183 and :285.

## nit — "ceiling" in a new comment
Where: src/config.ts:37
Axis: standards and naming
"ceiling" is a rejected alias of Boundary.

## nit — `typeNames` is protected only so a test subclass can override it
Where: src/engine/postgres.ts:212
Axis: standards and naming
Elsewhere, test seams are constructor parameters.

## nit — Two imports from the same module
Where: src/app.ts:4
Axis: standards and naming
This also happens at test/signin/helpers.ts:5.

## nit — The structural tests are still named `query_check_*`
Where: test/query/structure.test.ts:10
Axis: standards and naming
They call `checkStructure` only. They are cited in the spec's Verified by lines.

## nit — Redaction is applied in the MCP endpoint, but components.md places it in the Audit logger
Where: src/mcp.ts:56
Axis: standards and naming
The reason, that Redaction needs the Engine's parser, is not recorded.

## nit — The Audit logger keeps its own byte-length helper
Where: src/audit.ts:46
Axis: standards and naming
It is carried over from review 1.

## nit — Test helpers copied from listing.test.ts
Where: test/query/mcp-helpers.ts:25
Axis: standards and naming
It is carried over from review 1.

## nit — `plan_refused.code` is read only by tests
Where: src/engine/database.ts:83
Axis: standards and naming
It is carried over from review 1.

## nit — `reg_type_columns_and_domains_refused` contains no domain
Where: test/query/types.test.ts:17
Axis: standards and naming
It is carried over from review 1.

## nit — The `star` case names what `all_columns` names
Where: src/engine/database.ts:42
Axis: standards and naming
It is carried over from review 1. D-087 keeps the case names.

## nit — The Proven by join example runs over the test's own fixture
Where: test/query/engine.int.test.ts:114
Axis: spec and scope
It is carried over from review 1. T-013's live run uses the real fixture.

Verdict: fail (1 blocker, 6 gaps, 17 nits)
