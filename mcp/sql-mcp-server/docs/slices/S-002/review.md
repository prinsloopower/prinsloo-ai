# Review — S-002 (re-review after rework)

Reviewed: rework commit 22faa09 (`src` and `test`) against the slice spec as amended (D-081) and the previous review.
Tests: `npm test` → 19 files, 120 passed, 0 failed (includes `visibility.int.test.ts` and `review.int.test.ts` against Docker PostgreSQL 17.11 on 55432). `npm run typecheck` → clean.
Both axes were reviewed in one fresh context that did not write the code. The account check was also probed by hand against the test PostgreSQL with throwaway roles (dropped afterwards).

## Previous findings

| Previous finding | Status |
|---|---|
| blocker — column types can name a Hidden object | Resolved. Only `pg_catalog` types are named; enums, domains, row types and their arrays become `user-defined` (an array type lives in its element's schema). `resolver_hides_names_inside_column_types` covers a hidden enum, row type and row-type array. |
| gap — account check passes an account that can become a superuser | Resolved as D-081 words it: membership (MEMBER) of any superuser/BYPASSRLS role, `pg_read_all_data`/`pg_write_all_data`, `CREATEROLE`, and a superuser `session_user`. A remaining route is raised below. |
| gap — Boundary matching fails open on case | Resolved (D-081): exclusions compare lower-cased, inclusions stay exact, so a slip hides more. |
| nit — NOINHERIT ownership | Resolved (`'MEMBER'`, tested). |
| nit — sort test / UTF-16 comparator | Comparator accepted on record (spec amendment note). The test is unchanged and still cannot tell code-point order from collation order; carried below. |
| nit — batched `tools/call` answers 200 | Accepted on record (spec amendment note). |
| nit — Audit `ts`/`duration_ms` skip the catalog read | Resolved: timed from the start of the catalog read. |
| nit — Audit inputs uncapped or dropped | Resolved: strings cut at 128 with `…[cut]`, numbers and booleans kept. |
| nit — `config_invalid` carries no Tool call id | Resolved on both paths, tested. |
| nit — 4,000-character limit defined twice | Resolved (one exported constant). |

## gap — the account check reads only `current_user`, so the role the connection signed in as can hold the bypass
Where: src/engine/postgres.ts:27
Axis: spec and scope
Membership, `pg_read_all_data` and `CREATEROLE` are tested for `current_user`; only `rolsuper` is tested for `session_user`. A login role that holds `pg_read_all_data` (or BYPASSRLS membership, or `CREATEROLE`) and lands on a clean role through `ALTER ROLE … SET role = …` or a `-c role=…` option passes with every flag false. Reproduced on PostgreSQL 17: login `pz_lead` with `pg_read_all_data`, default role `rv_reader`, passes the check, and `SET ROLE NONE` then reads `rv_hidden.secret_tbl`. The listing stays correct (it is evaluated as `current_user`), but S-003 runs the Agent's SQL on this connection, and D-081's stated intent is to refuse every `SET ROLE`/`RESET ROLE` route. Fix: test every flag for `session_user`, including membership of a `CREATEROLE` role; `session_user` is necessarily a member of `current_user`, so this also covers the current checks. Test with a non-superuser login holding `pg_read_all_data` and a default `role`.

## nit — sort test still cannot tell code-point order from collation order
Where: test/listing/listing.test.ts:104
Axis: spec and scope
Carried from the previous review: `A_upper` sorts before `big` under either order, so a switch to `localeCompare` would still pass. A `Zeta`/`alpha` pair would catch it.

Checked and sound: `FLAGS_SQL` cannot error for an ordinary role (`pg_roles` is world-readable and `pg_has_role` with an existing role OID needs no privilege) and always returns one row; no name from a hidden schema reaches the listing through column types, since `pg_catalog` types print unqualified; lower-casing both sides of the exclusion key only ever hides more; Audit input cutting cannot drop the record; `readStarted` is per request and unset for batches; the 503 path and the handler path both time from the read.

Verdict: hold (0 blockers, 1 gap, 1 nit)

## Previous review

Commit d005923, 2026-10-22: Verdict fail (1 blocker, 2 gaps, 7 nits). Blocker: column types named hidden types/tables. Gaps: account check ignored role membership, CREATEROLE and session_user (Q-031); Boundary matching failed open on case. Answered by D-081 and reworked in 22faa09.
