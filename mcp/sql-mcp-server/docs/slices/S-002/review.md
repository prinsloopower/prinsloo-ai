# Review — S-002

Reviewed: commit d005923 (diff 4c88366..d005923, `src` and `test`) against the slice spec.
Tests: `npm test` → 17 files, 114 passed, 0 failed (includes `visibility.int.test.ts` against Docker PostgreSQL 17 on 55432). `npm run typecheck` → clean.
Both axes were reviewed in one fresh context that did not write the code. Behaviour was also checked by hand against the test PostgreSQL (format_type output, membership of a superuser role, a refused connection's error code).

## blocker — column types can name a Hidden object
Where: src/engine/postgres.ts:43
Axis: spec and scope
`format_type(a.atttypid, a.atttypmod)` qualifies any type outside the search_path with its schema. A granted column whose type is an enum, domain or composite in a schema the account cannot see is listed as e.g. `rv_hidden.secret_status` (reproduced on the test Database). Every table has a composite row type of the same name, so a column typed as another table's row type, or an array of it, puts that hidden table's schema and name in the listing. R-003 and the Hidden object definition say no Hidden object appears in anything the Agent receives, and no test covers a non-built-in type. Fix: emit the type name only when its schema is visible (or `pg_catalog`), and otherwise a neutral name such as `USER-DEFINED` or the base type, with a resolver test that uses a hidden enum and a hidden table's row type.

## gap — the account check passes an account that can become a superuser
Where: src/engine/postgres.ts:20
Axis: spec and scope
The check reads `rolsuper` and `rolbypassrls` of `current_user` only. Those attributes are not inherited, so an account that is a member of `postgres` (or of any superuser or BYPASSRLS role) passes (reproduced: `GRANT postgres TO …` gives all flags false), and so does one with `CREATEROLE`, which before PostgreSQL 16 can grant itself `pg_read_all_data`. The check also uses `current_user`, so a superuser connecting with a `role` startup option passes while `session_user` can `RESET ROLE`. The listing itself stays safe here, because inherited ownership hides the owner's tables, but S-003 runs Agent SQL as this account and will otherwise have to invent the rule. This matches D-077 as written, so it is raised as Q-031.

## gap — Boundary matching fails open on case
Where: src/visibility.ts:43
Axis: spec and scope
`exclude` and `schemas` are compared byte-for-byte with catalog names. An Operator who writes `[["Sales","Payroll"]]`, as they would write an unquoted identifier in SQL, excludes nothing and `sales.payroll` stays listed. For `schemas` the mismatch hides (safe), but for `exclude` it shows a table the Operator meant to hide. MS SQL Server (S-006) is case-insensitive by default, so the matching rule needs deciding now; at minimum `readConfig` should reject or warn on names that cannot match a PostgreSQL unquoted identifier, and the Security material should say names are exact.

## nit — ownership through NOINHERIT membership is not excluded
Where: src/engine/postgres.ts:55
Axis: spec and scope
`pg_has_role(…, 'USAGE')` is false for a NOINHERIT member of the owning role, so such a table is listed when granted. The listing still follows grants, as D-076 intends, but the account can `SET ROLE` to the owner. Matches the spec's wording; S-003's query check must refuse `SET ROLE`. `'MEMBER'` would be the conservative test.

## nit — sort test cannot tell code-point order from collation order
Where: test/listing/listing.test.ts:104
Axis: spec and scope
`A_upper` sorts before `big` under code-point order and under any locale collation, so replacing the comparator with `localeCompare` still passes. A pair such as `Zeta`/`alpha` would fail. The comparator at src/visibility.ts:46 also compares UTF-16 code units, not code points, which differs only for astral characters.

## nit — a batched `tools/call` with an unsafe account answers 200, not 503
Where: src/mcp.ts:80
Axis: spec and scope
`isListTablesCall` sees only a single JSON-RPC object, and the SDK transport accepts arrays. A batch goes to the handler fallback: still refused, audited and logged, but inside a 200. Nothing leaks.

## nit — Audit `ts` and `duration_ms` skip the catalog read
Where: src/mcp.ts:99
Axis: spec and scope
When the catalog was read before dispatch, the handler takes `started` afterwards, so `ts` is later than arrival and `duration_ms` leaves out the Database time. data-model.md defines both from arrival.

## nit — Audit inputs are uncapped, or dropped when not a string
Where: src/audit.ts:46
Axis: spec and scope
A refused 1 MB `schema` is written whole, which can exceed Workers Logs' line size. A non-string `schema` or `request_text` is recorded as absent or `null`, not as received.

## nit — `config_invalid` for an unsafe account carries no Tool call id
Where: src/mcp.ts:88
Axis: standards and naming
security.md says operational lines name the Tool call `id` when there is one. Without it, an Operator cannot join the line to its Audit record. Same at src/mcp.ts:110.

## nit — the 4,000-character limit is defined twice
Where: src/tools/list-tables.ts:12
Axis: standards and naming
`REQUEST_TEXT_MAX` also appears at src/audit.ts:5. If one changes and the other does not, accepted text could be stored cut.

Checked and sound: the PUBLIC grants and inherited grants used by `has_column_privilege`/`has_schema_privilege`; column-only versus table grants (`all_columns`); partitions (`relispartition` also drops sub-partitions); system schemas excluded both in SQL and in `visibleTables`; a hidden and a missing `schema` give identical answers; driver text never reaches the Agent or a log line; tokens are not logged; one Audit record per call on every path (pre-dispatch 503, invalid input, Database error, listing), none for `initialize`/`tools/list`/misconfigured `BOUNDARY`; the account check runs only on `tools/call` and after input validation. Each integration test fails if its SQL clause is removed (ownership, inherited ownership, USAGE, partition, grant/revoke).

Verdict: fail (1 blocker, 2 gaps, 7 nits)
