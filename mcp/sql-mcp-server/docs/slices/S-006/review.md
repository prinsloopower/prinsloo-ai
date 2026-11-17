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
Open: Q-049, for the product owner.

Verdict: hold (0 blockers, 7 gaps, 6 nits)
