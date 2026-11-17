# Review — S-006

## Review 1 (2026-11-16)

Reviewed: commit 064fb6b (8266c65..064fb6b, restricted to this directory) against the slice spec. The two axes ran in separate fresh contexts. The `een/` files in the same range belong to another project merged in by PR #5 and #6, and are outside this review.
Tests: `npm test` → 56 files, 358 passed, 0 failed; `npx tsc --noEmit` (`npm run typecheck`) → 3 errors in test/mssql/defaults.int.test.ts:39.

Every task has code, except T-011, the product owner's live check after deploy, which has none by design. Every test on a `Verified by:` line exists, and none of them is a truism. The SHA-256 of the printed account check, recomputed from source at HEAD, is `05d2e7e1…a8f2`, the same value T-012's session recorded. No rejected domain alias appears in the code. Nothing on security.md's never-logged list is logged. The fixture passwords in test/mssql/connection.ts, test/mssql/fixtures.ts and test/docker-compose.yml are each commented as local-container only.

## gap — The image's smoke run failed from the host and passed only inside the container network, with no Q
Where: docs/slices/S-006/spec.md:161
Axis: spec and scope
T-008's Verified by, and the Proven by line for the image, call for `npm run smoke -- http://localhost:8080` against the running image. The commit for that run (8079db5) records 4 of 6 checks passing from the Windows host: every response on a path ending in `/mcp` is cut off, with curl exit 56. All 6 passed only from a container on the Server's network. The build put this down to the host's antivirus, recorded no Q or D, and the build gate passed. T-011 is Claude Code on that same host calling `http://localhost:8080/mcp`, so the live check may fail for a reason the build has already seen and nobody has answered. Raised as Q-048.
Resolved: D-139 (answering Q-048), the product owner's decision, with a manual check against the local image before the push.

## gap — An account whose check statement errors gets a Database error, not the unsafe-account 503, and the test helper hides it
Where: test/mssql/account-check.int.test.ts:114
Axis: spec and scope
The helper `unlisted()` counts any permission-class error from `accountFlags()` as a refusal, for every holding. Its comment says this is because `db_denydatareader` denies even the catalog views. In the shipped code that error leaves `catalog()` as a thrown error. The Tool call is then answered as a `permission` Database error, with no `config_invalid` line naming `DATABASE_URL`, and `/healthz` reports the database unreachable rather than `unsafe`. The Proven by line at spec.md:95 promises the 503 and `unsafe` for every fixed database role other than `public`. No data is exposed, because the check fails closed, but the Operator is told the wrong thing. The blanket catch would also hide any other holding that breaks the statement.
Resolved: D-140, the product owner's decision. Fixed in the code, and the 503 and `/healthz` tests each gain a `db_denydatareader` case.

## gap — `npm run typecheck` fails: a new test uses `Object.groupBy` (ES2024) under `lib: ES2023`
Where: test/mssql/defaults.int.test.ts:39
Axis: standards and naming
At HEAD, `tsc --noEmit` reports TS2550, TS7006 and TS2339 on this line, because tsconfig.json sets `"lib": ["ES2023"]`. docs/development.md:16 lists `npm run typecheck` as a clean-checkout step. S-005's review recorded it clean, and S-006's build gate passed without running it. The next slice will either change `lib` or learn to ignore a red check.
Resolved: the count is made with a Map, and `npm run typecheck` is clean.

## gap — docs/development.md not updated for MS SQL Server, the image, or the Node entry point
Where: docs/development.md:8
Axis: standards and naming
The file still says Docker is "for the PostgreSQL 17 the integration tests run against". It describes only the Worker entry point, and says the integration tests need "the Docker Database", singular. The diff adds the MS SQL Server Compose profile, `npm run db:mssql:certs` (which needs `openssl`), `npm run db:mssql:seed`, `npm run build:image` with its Dockerfile, `src/server.ts`, and the `test/mssql/` and `test/node/` folders. None of this is documented outside the slice spec. The export ships development.md to the clean copy, so a developer following it cannot run the MS SQL Server tests.
Resolved: development.md covers the SQL Server Database (certificates, Compose profile, seed, the Windows port reservation), the container image, `server.ts`, the Dockerfile and the new test folders.

## gap — `bypassesGrants` doc comment made false by the diff
Where: src/visibility.ts:48
Axis: standards and naming
The comment says "Whether the account holds a grant that reaches every table at once". The function now also returns true for `flags.unlisted`, which anything outside the read-only list sets, such as `VIEW DEFINITION` or owning one table. visibility.md was rewritten for this change, and the code comment was not. The next engine or tier written against the comment will rely on the old, narrower meaning.
Resolved: the comment names anything outside the read-only list as well.

## gap — `ALLOW_LIST_SQL` names a statement that returns more than the Allow-list
Where: src/engine/mssql.ts:45
Axis: standards and naming
The domain model's Allow-list is the set of columns the Database account may SELECT. This statement returns every column the account can see, each with a `granted` flag, and the shared resolver does the filtering, as the statement's own comment at line 40 says. The PostgreSQL neighbour calls its equivalent `CATALOG_SQL`. Anyone who trusts the name will read the statement's rows as already filtered.
Resolved: renamed `CATALOG_SQL`, as in the PostgreSQL engine.

## gap — The `value()` settings helper duplicated from config.ts
Where: src/node-deps.ts:23
Axis: standards and naming
This `value(env, name)` is a byte-for-byte copy of the private helper at src/config.ts:40 (trim, then an empty string becomes undefined). The spec says each setting is trimmed the same way on both runtimes, and that now holds only because the two copies match. A later change will reach one runtime and not the other. Exporting the helper from config.ts would remove the second copy.
Resolved: config.ts exports `value()`, and node-deps.ts imports it.

## nit — `MssqlConnection` comment claims a guarantee the type does not hold
Where: src/node-deps.ts:10
Axis: standards and naming
The comment says "with encryption and the certificate check forced on", but the type is a bare `mssql.config`, which allows `encrypt: false`. The guarantee actually comes from `parseDatabaseUrl` and from `MssqlDatabase.connect`.
Resolved: the comment names `parseDatabaseUrl` and `MssqlDatabase` as where the guarantee comes from.

## nit — A test re-declares the production refusal text, and another hard-codes the Docker port
Where: test/mssql/account-check.int.test.ts:14
Axis: standards and naming
`UNSAFE_ACCOUNT` is copied from src/mcp.ts rather than imported, which follows an existing pattern in test/listing. Separately, test/mssql/defaults.int.test.ts:24 writes `"localhost", 51433` where its sibling tests import `HOST` and `PORT` from connection.ts.
Resolved in part: defaults.int.test.ts imports `HOST` and `PORT`. `UNSAFE_ACCOUNT` stays a copy, following test/listing's existing pattern of tests stating the text they expect.

## nit — The MS SQL Server row type is named differently from the PostgreSQL neighbour
Where: src/engine/mssql.ts:31
Axis: standards and naming
The MS SQL Server engine names its row type `CatalogRecord` with a `type_name` column, where postgres.ts uses `CatalogQueryRow` and `column_type` for the same shape. Both engines also define `CONNECT_MS`, each its own copy.
Resolved in part: the row type is `CatalogQueryRow` with `column_type`, as in postgres.ts. Each engine keeps its own `CONNECT_MS`, a limit local to its driver.

## nit — The edition probe is a second statement, cached for the process, with no D
Where: src/engine/mssql.ts:167
Axis: spec and scope
The first `catalog()` call also runs `SELECT SERVERPROPERTY('EngineEdition')` and caches the chosen check statement until `close()`. A failed probe is not cached. The choice to probe separately and cache, rather than branch inside one statement, is recorded nowhere, and S-007's query path will face the same choice.
Resolved: recorded as D-141.

## nit — The global vitest timeout raised to 30 s traces only to a commit message
Where: vitest.config.ts:8
Axis: spec and scope
`testTimeout: 30_000` now applies to every test in the suite, the PostgreSQL tests included. No task or D covers it, so a hang in a later slice's test takes six times as long to show.
Resolved: recorded as D-142.

## nit — D-131's wider fetch-guard list has not been carried to security.md
Where: src/node-fetch.ts:19
Axis: spec and scope
The fetch guard also refuses `0.0.0.0/8`, `240.0.0.0/4` and `::`. D-131 records that choice, but security.md's Fetches rule does not list those ranges, so the system spec and the shipped Security material now disagree. Raised as Q-049, as Q-043 was for TLS.
Resolved: D-143 (answering Q-049), the product owner's decision. security.md gains the ranges at the next system-spec revision.

Verdict: hold (0 blockers, 7 gaps, 6 nits)

## Review 2 (2026-11-17)

Reviewed: commit a6c4e47 (the whole slice, 8266c65..a6c4e47, and the rework, 064fb6b..a6c4e47, both restricted to this directory) against the slice spec and review 1's findings. The two axes ran in separate fresh contexts. The `een/` files are outside this review, as in review 1.
Tests: `npm test` → 56 files, 358 passed, 0 failed; `npm run typecheck` (`tsc --noEmit`) → no errors.

Review 1's findings were checked against the code at HEAD:
- D-140's fix holds. `accountFlags()` and `catalog()` answer only a `permission`-class error from the check statement as `unlisted`. Connect-time failures, edition-probe failures and request-time connection errors such as 40613 are still Database errors.
- The `unlisted()` test helper no longer catches anything. The 503 test and the `/healthz` test each run a `db_denydatareader` case, and `mssql_check_ignores_deny_rows` still passes the ordinary DENYs.
- The `Object.groupBy` call, the `bypassesGrants` comment, `CATALOG_SQL`, `value()`, the `MssqlConnection` comment, `HOST`/`PORT`, and `CatalogQueryRow`/`column_type` are each fixed as their `Resolved:` line says. No old name is left in src, test or docs.
- development.md now covers the SQL Server Database, the image, `server.ts`, the Dockerfile and both new test folders. Every script and path it names exists.
- D-141, D-142 and D-143 cover the three nits that only needed a record.

The rework added no scope: every changed line traces to a review-1 finding. Two things are still open. The rework changed behaviour that the Security material still describes the old way, and the human decision on the host smoke run (D-139) is recorded only in the decisions register.

## gap — The Security material still says DENY rows never refuse the account, which D-140 has made false
Where: docs/security-material/visibility.md:76
Axis: spec and scope
The line reads "`DENY` rows never refuse the account, because they only narrow what it reads." Since D-140, a permission error from the check statement refuses the account as unlisted. D-140 says so outright: "any `DENY` that stops the check reading what it needs is therefore refused too". An example is a `DENY SELECT` on a catalog view the check reads. The rework did not touch visibility.md. So T-010's material, the document a Security reviewer reads, now contradicts both the shipped behaviour and the decision. An Operator who adds such a DENY will be told by the material that it is harmless, and then find the account refused.
Resolved: visibility.md says a DENY that stops the check reading its catalogs refuses the account, and that a Database the check cannot reach gives a Database error.

## gap — D-139's manual check before the push is recorded only in the decisions register, not in the tasks the deploy runs from
Where: docs/slices/S-006/spec.md:161
Axis: spec and scope
D-139 is the product owner's decision. It requires four steps against `sql-mcp:local` before the GHCR push:
1. the host smoke run;
2. the in-network smoke run;
3. pausing each antivirus product in turn until the host run reaches 6 of 6;
4. holding the push if it never does.

It also has T-011 run with that product's protection paused. T-008's and T-011's `Verified by:` lines do not cite D-139, Q-048 does not point to it (see the nit below), and the slice folder holds no deploy note. A deploy that works from the spec's tasks can push the image without the check the product owner made a condition, and T-011's result could again mix up the host with the Server. The deploy phase needs to be pointed at D-139. That could be done by citing it in T-008's and T-011's tasks through the spec's own revision, or by carrying it into the deploy record's plan.
Resolved: carried to the deploy, which depends on this review. **Before the push to GHCR, the deploy runs D-139's four steps against `sql-mcp:local` and puts their commands and output in the deploy record. If step 4 is reached, the push waits.** T-011 runs with the protection that step 3 names paused or excluded. Q-048 now carries "Answered by D-139". The spec's tasks are not edited, because the spec is gated.

## nit — `catalog()` doc comment still calls the statement's result "the Allow-list"
Where: src/engine/mssql.ts:194
Axis: standards and naming
The comment reads "The account check and the Allow-list in one catalog Server statement". Review 1 had `ALLOW_LIST_SQL` renamed because the statement returns every visible column with a `granted` flag, not the Allow-list. The comment beside the call keeps the old meaning, so a reader may again take `rows` as already filtered.
Resolved: the comment names every visible column with its `granted` flag, filtered by the resolver.

## nit — development.md starts the SQL Server container and makes the certificates by hand, though `db:mssql:seed` does both
Where: docs/development.md:17
Axis: standards and naming
test/mssql/seed.ts:7-8 makes the certificates if they are missing and runs `docker compose … --profile mssql up -d --wait mssql` itself. The Compose file's comment (test/docker-compose.yml:14) says the container is "started by `npm run db:mssql:seed`". So the doc and the Compose comment describe two different ways to start it, and whoever changes one will not know which is meant to be followed.
Resolved: development.md starts SQL Server with `npm run db:mssql:seed` alone, as the Compose comment says, and says how to stop it.

## nit — Q-048 and Q-049 carry no "Answered by" line
Where: .sdlc/questions.md:281
Axis: spec and scope
The file's convention, for example at Q-046 and Q-047, is an "Answered by D-###." line under each answered question. Q-048 (answered by D-139) and Q-049 (answered by D-143) have none. Q-048's "Blocks: T-011" line therefore still reads as open, and the next phase may treat T-011 as blocked or ask the question again.
Resolved: Q-048 and Q-049 carry "Answered by D-139" and "Answered by D-143".

Verdict: hold (0 blockers, 2 gaps, 3 nits)
