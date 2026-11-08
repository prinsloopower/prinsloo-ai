# S-006 — Listing MS SQL Server tables from the container image

Delivers: the product owner runs `ghcr.io/prinsloopower/sql-mcp` on their own machine against MS SQL Server 2022 in Docker, adds `http://localhost:8080/mcp` to Claude Code, signs in through Entra ID, and asks which tables they may query. The answer is exactly what the Database account is granted inside the Boundary. `docker logs` shows a JSON line per Tool call with their identity, and an account holding anything past security.md's read-only list is refused.
Traces: J-002, J-003, R-002, R-003, R-009, R-010

R-002 and J-003 are only begun here: S-007 adds answers, and S-013 adds Claude and ChatGPT.

## Screens
None: the Server has no interface of its own (D-046). What the Staff member sees is Claude Code's rendering of Sign-in and of the `list_tables` result, unchanged from S-001 and S-002.

## Interface
No new endpoint and no new tool. The container answers the Worker's paths: `/healthz`, `/mcp`, the two well-known metadata documents, `/authorize`, `/oauth/callback`, `/token` and `/register`.

- **Tools on MS SQL Server:** `list_tables` only. The Node adapter supplies no Query engine until S-007, so `tools/list` shows one tool.
- **`initialize`** reports the package version alone (D-114). S-006 raises it to `0.2.0`, because the shared app changes and `0.1.0` is the Worker already deployed (D-127).
- **Request body:** the 1 MiB limit is enforced in the shared app (operations.md, D-117). A true `Content-Length` over the limit is refused at once. A body with none, or with one that understates it, is refused as soon as the count passes 1 MiB. The Worker gains this in code, and S-006 does not redeploy it (D-126).

### Seams in the shared app
Engine and runtime differences enter through `Deps` (`src/app.ts`) and nothing else. Two fields are new:
- `classify`: the runtime's Database error classifier, which replaces the app's direct import of `classifyPostgresError`. The Worker passes `classifyPostgresError`.
- `adapterConfigError`: the name of a variable the runtime adapter requires and found missing or invalid. When it is set, the app takes the path of a `readConfig` failure naming that variable. When `readConfig` also fails, its variable is named (environments.md). The Worker never sets it, and `readConfig` is unchanged.

`AccountFlags` gains `unlisted`: true when the account holds anything outside MS SQL Server's list. `bypassesGrants` includes it, and PostgreSQL always sets it false (D-126).

## Runtime adapter (Node)
`src/server.ts`, built to `dist/server.js`, is the image's entry point (components.md, Runtime adapter). It:
- reads Server settings from `process.env` once, at process start, trimmed (D-070);
- sets `adapterConfigError` to the first of these that fails, in this order:
  - `ENGINE`, unless it is exactly `mssql`;
  - `DATABASE_URL`, when it is unset or does not parse as an ADO connection string naming a server and a database, or when it sets `Encrypt` to anything but true or `TrustServerCertificate` to true. Keys and values are matched without regard to case. `Encrypt` passes when unset or set to `true`, `yes`, `mandatory` or `strict`, so the Azure portal's `Encrypt=True;TrustServerCertificate=False` passes. Its value is never logged or echoed;
  - `PUBLIC_URL`, when it is unset;
  - `PERMISSION_TIER`, when it is anything but `read-only` (security.md, At higher tiers);
- listens on `PORT`, `8080` when unset. A `PORT` that is not an integer from 1 to 65535 leaves nothing to answer a 503 on, so the process writes one `config_invalid` line naming `PORT` and exits non-zero (D-127);
- names `DATABASE_URL` in `config_invalid` lines for an account the check refuses (D-077);
- writes Audit records and operational lines to standard output, one JSON line each, as the Worker's `console.log` does;
- gives the app a guarded `fetch` for the Client ID Metadata Document and the Identity provider, which refuses a connection as security.md's Fetches rule gives it, checked at connect time and for IP-literal hosts. A refused fetch fails as an unreachable one does. The guard also covers the Identity provider, which security.md does not require, so a private Identity provider is refused too until private networking revisits it (D-128).

## Engine adapter (MS SQL Server)
`MssqlDatabase` implements `Database` with `mssql` (`tedious`). It keeps one connection pool per process, made from `DATABASE_URL` on first use. If that pool's first connect fails, it is discarded, and the next call makes a new one, so a Database that comes up later is reached without a restart. Connecting gives up after 5 seconds, whatever `Connect Timeout` the string holds (operations.md, environments.md). The connection is always encrypted, and the server's certificate is always checked against Node's trusted CAs, on every target. No setting turns the check off (D-129). `requestTimeout` is 0 (D-003). `query()` throws if called, because no query tool is registered.

### Allow-list
`catalog()` runs one catalog Server statement (ADR-006) holding data-model.md's MS SQL Server Allow-list and the account check. Column types are formatted as data-model.md gives them, for example `nvarchar(100)`, `decimal(10,2)`, `nvarchar(max)` and, for an alias type, `user-defined`. `readable` is true for every column (D-085). The shared resolver applies system schemas, the Boundary, the 500-table cap, code-point ordering and the `schema` filter unchanged.

### Account check
`accountFlags()` runs the check in the same statement, and in `/healthz`, as security.md's MS SQL Server Database account check defines it, including the `EngineEdition = 5` branch. Any failed condition sets `unlisted`, and the other flags are false (D-126). The routes D-116 and D-117 mapped onto the other flags are superseded (security.md).

**Defaults are measured first** (security.md, D-125). Before the check is wired into `catalog()`, its conditions are run as a query against a reader made the way a Database administrator would make one:
- on SQL Server 2022 in Docker, by an integration test that prints every row `public` holds;
- on `mcp-test`, by the product owner running the same query with `sqlcmd` as `sqlmcp_reader`. The same session also runs the ownership-catalog query below, because Azure SQL Database is evergreen and can have views SQL Server 2022 lacks.
Both sets of rows go into the build record. A row the list does not cover stops the build for a system-spec amendment (security.md).

**The shipped statement is confirmed on `mcp-test`** in a second, short session, once the statement is final and after any amendment. The product owner runs, with `sqlcmd`, the `EngineEdition = 5` statement exactly as `dist/server.js` holds it, printed by `npm run print:check-sql`, which runs `node dist/server.js --print-check-sql`. It runs as `sqlmcp_reader`, which must pass, and as `sqlmcp_mapped`, a user mapped to a login made in `master`, and the server admin login, which must both be refused. `sqlmcp_mapped` and its login are then dropped in `master`.

Both sessions use `sqlcmd` from the product owner's machine, never the portal's query editor, because logins are made and dropped in `master`. Each reaches the server through a client-IP firewall rule added for that session only and removed when it ends (D-127, D-128).

**The ownership catalogs are checked against the instance.** A test lists every `sys` catalog view on SQL Server 2022, and the first `mcp-test` session lists every one on Azure SQL Database, with a `principal_id` or `owning_principal_id` column. Each must be either in security.md's list, or in the test's own exclusion list with the reason its column names no owner. For example, `sys.database_principals.principal_id` is the principal itself, and `sys.user_token` is the session's token. A view in neither list fails the test, and the build stops for a security.md amendment, as for defaults. The build never edits security.md's list itself.

### Database errors
`classifyMssqlError` maps `tedious` errors to D-080's reason classes. The error number decides first, at connect time and on a pooled connection's request alike. The driver code decides only when there is no number.
- `connection`: numbers 18456, 4060, 40613, 40615, 40532, 40197, 40501, 40549, 10928 and 10929. With no number, the codes `ESOCKET`, `ECONNCLOSED`, `ELOGIN` and `ETIMEOUT`;
- `timeout`: number 1222;
- `permission`: numbers 229, 230 and 262;
- `constraint`: numbers 547, 2601, 2627 and 515;
- `other`: everything else.

The Agent's message is rebuilt from the class (D-005).

## Container image
- `dist/server.js` is one file, bundled by esbuild from `src/server.ts` with every dependency inlined (`npm run build:image`, D-118). `src/server.ts` never imports the PostgreSQL adapter, so `pg` and the parser stay out. S-006 adds `mssql`, `@hono/node-server` and `undici` to `dependencies`, and `esbuild` to `devDependencies`. The Worker's bundle imports none of them.
- A `Dockerfile` at the package root builds on `node:24-slim` and runs on `node:24-slim` as the image's `node` user (uid 1000), never root. The runtime image holds `dist/server.js` and no other project file.
- **Published** to GHCR, public, as `ghcr.io/prinsloopower/sql-mcp` (D-115), tagged with the commit SHA and `0.2.0`. Until CI exists it is built and pushed by hand from the default branch (D-104). The SHA tag is the one that never moves.

## Settings reference
docs/settings.md, which the clean copy ships, gains the container: `ENGINE=mssql`, `DATABASE_URL` and `PUBLIC_URL` required, `PORT`, reading at process start, `read-only` as the only tier on MS SQL Server, the 503 a missing adapter setting gives, and the 503 for a `DATABASE_URL` that turns off encryption or the certificate check (D-129). It no longer says this release does not read `DATABASE_URL` or `PORT`. Key Vault and Bicep sources are S-013's. The clean-copy export keeps `Dockerfile`, `src/server.ts` and the MS SQL Server adapter.

## Data
No new tables, and nothing new stored by the Server.

`test/docker-compose.yml` gains MS SQL Server 2022 (`mcr.microsoft.com/mssql/server:2022-latest`) on port 51433 (ADR-010, environments.md). `npm run db:mssql:seed` creates the user database `sqlmcp`, and the login, from `master`, then runs `test/mssql/schema.sql` in `sqlmcp`. Every test, measurement and the local run connect with `Database=sqlmcp`. The image's container reaches the Compose SQL Server as `host.docker.internal,51433`, with `--add-host=host.docker.internal:host-gateway` on Linux.

**TLS in Docker** (D-129). `npm run db:mssql:certs` uses `openssl` to make a test CA and a server certificate for `localhost` and `host.docker.internal` in `test/mssql/certs/`, which git ignores. Compose mounts the certificate and key into SQL Server, and `mssql.conf` sets them with `forceencryption = 1`. The tests, the smoke run and the image container trust the CA through `NODE_EXTRA_CA_CERTS`, and the image container gets the CA file by a read-only mount. The CA's key never leaves the developer's machine, and the export refuses `test/mssql/certs/`.

`schema.sql` makes:
- the schema `sqlmcp_test`, owned by `dbo`, holding `orders`, `customers`, `staff`, a table named `a.b]c`, and a column of the alias type `sqlmcp_test.phone`;
- the grants to `sqlmcp_reader`: SELECT on `sqlmcp_test.orders`, and on `sqlmcp_test.customers (id, name, region)` only.

The account is made separately for each target, because its form differs. In Docker, the seed makes a login and a user. On `mcp-test`, the product owner runs `test/mssql/contained-user.sql` and then `schema.sql` with `sqlcmd` as `dbo`, for the defaults measurement. `contained-user.sql` takes the password as the `sqlcmd` variable `$(READER_PASSWORD)`, set from the environment, and the committed file holds no password. The same password goes into the Key Vault in S-013. S-013 deploys against the result.

## Proven by
- On SQL Server 2022 in Docker, `list_tables` returns exactly the granted tables and columns: a fully granted table has `all_columns: true`, and a partly granted one lists only its granted columns. An ungranted, denied or system table is absent.
- The alias-type column is listed as `user-defined`, and `phone` appears nowhere in the result. Built-in types carry the lengths data-model.md gives, in characters.
- The table `a.b]c` is listed with its own grants, not another table's.
- A `GRANT` or `REVOKE` shows on the next `list_tables` call, with no restart.
- A reader holding only what security.md's list allows passes: `CONNECT`, `SHOWPLAN`, `SELECT` on a schema, a table and columns, `public`'s defaults, and `DENY` rows.
- An account holding any one thing outside the list gets 503 "Deployment misconfigured: Database account bypasses grants" on every Tool call, one Audit record and a `config_invalid` line naming `DATABASE_URL`. `/healthz` reports `database: unsafe`, and Sign-in and metadata still answer. Each case is tested on its own: every MS SQL Server route named in D-077, D-117 and D-120, and gate 5's gap below; a fixed database role other than `public`, including `db_denydatawriter`; ownership of a table, a schema and a database role; at server level, ownership of a user-defined server role and of a `DATABASE_MIRRORING` endpoint made for the test, which SQL Server on Linux supports; and a grant outside the list, such as `VIEW DEFINITION`. The database-level cases are also tested through a user-defined database role nested two deep, which `sys.user_token` carries.
- The statement built for `EngineEdition = 5` reads no server-level catalog and refuses a user that is not contained and SQL-authenticated. The one for any other edition reads `sys.login_token`, `sys.server_principals`, `sys.endpoints` and `sys.server_permissions`.
- On `mcp-test`, the `EngineEdition = 5` statement exactly as `dist/server.js` ships it passes `sqlmcp_reader` and refuses `sqlmcp_mapped` and the server admin login. The statement printed from the published SHA-tagged image has the SHA-256 recorded for that run.
- Every `sys` catalog view with a `principal_id` or `owning_principal_id` column, on SQL Server 2022 and on `mcp-test`, is in security.md's ownership list or in the test's exclusion list, each exclusion with its reason.
- Every row `public` holds for a fresh reader, on SQL Server 2022 and on `mcp-test`, is in the build record, and each is covered by the list.
- Only creating `sqlmcp` and the logins runs in `master`. The schema, the grants, the measurements and every test connect to `sqlmcp`.
- The Boundary narrows the MS SQL Server listing as it does PostgreSQL's, and every listed column is readable.
- PostgreSQL's `accountFlags()` always returns `unlisted: false`, and S-002's tests pass unchanged.
- The Node adapter answers 503 naming `ENGINE` when it is `postgres` or unset, `DATABASE_URL` when that is unset or names no server, such as `Database=x`, `PUBLIC_URL` when it is unset, and `PERMISSION_TIER` when it is `read-write`. With `SERVER_SECRET` also unset, the 503 names `SERVER_SECRET`. A `PORT` of `abc` exits non-zero after one `config_invalid` line naming `PORT`. A `DATABASE_URL` ending in a newline connects, and no value appears in any output. The Worker's existing tests pass unchanged.
- The Node adapter answers `/healthz`, both metadata documents and `/register` as the Worker does. `tools/list` lists `list_tables` alone, and `initialize` reports `0.2.0`. Each Tool call writes its Audit record to standard output as one JSON line.
- The app imports no Engine's classifier. The Worker passes `classifyPostgresError` and the Node adapter `classifyMssqlError`, and each runtime's Database errors reach the Agent with that classifier's class.
- An MCP request body of 1 MiB + 1 byte gets 413 before any parsing, on both runtimes, with a true `Content-Length`, chunked with none, and with a `Content-Length` of 100. A body of exactly 1 MiB is accepted.
- The guarded fetch refuses a Client ID Metadata Document whose host resolves to `127.0.0.1`, `10.0.0.1`, `169.254.169.254`, `100.64.0.1`, `::1`, `fd00::1` or `::ffff:10.0.0.1`, even when another of its addresses is public. It also refuses `https://169.254.169.254/x`, `https://10.0.0.1/x` and `https://[::1]/x`, and allows a public address. Registration then ends with `invalid_client`.
- A Docker SQL Server whose certificate the CA did not sign gives class `connection`, and the Agent's message names no host. With the CA trusted, it connects. A `DATABASE_URL` holding `TrustServerCertificate=true` or `Encrypt=false` gets the 503 naming `DATABASE_URL`. One holding `Encrypt=True;TrustServerCertificate=False`, `Encrypt=strict` or no `Encrypt` connects.
- An unreachable Database gives class `connection` within 5 seconds (one second's tolerance for the runner), even with `Connect Timeout=60`, and the Agent's message names no host. A Database started after that first failure is reached on the next call. Each listed number maps to its class at connect time and on a pooled request, each driver code with no number maps to its class, and the pool's `requestTimeout` is 0.
- The image built from the `Dockerfile` passes `npm run smoke -- http://localhost:8080` against the Docker Database. It runs as uid 1000, not root. Its project files are `dist/server.js` alone, with no `node_modules`, and the bundle holds no `@libpg-query`, `pg` or `wrangler` code. `mssql`, `@hono/node-server` and `undici` are in `dependencies`, and `esbuild` in `devDependencies`.
- docs/settings.md covers each container setting above, and the export keeps the image files. The export refuses a file holding the project's tenant, subscription or Database server name, `test/mssql/*.sql` included, and it refuses anything under `test/mssql/certs/`.
- `ghcr.io/prinsloopower/sql-mcp` is public, and its SHA tag pulls without credentials.
- From Claude Code, the product owner, signed in through Entra ID, asks which tables they may query, and gets `orders` and the three `customers` columns, and nothing else. After a `REVOKE`, the next question omits `orders`. `docker logs` holds one Audit record line per `list_tables` call, with the product owner's identity.

## Out of scope
- **Deploying on Azure:** the Bicep kit, Key Vault, forced revisions and rotation, the Azure guide and its monitoring, the firewall, the Azure part of the Security material, and the live Deployment on `mcp-test` (S-013). Gate 5's blocker and nits 1 and 5 concern these, and go with them.
- **Claude and ChatGPT,** which call from their vendors' infrastructure and cannot reach a local container (S-013).
- **A supported local setup** for Staff members (D-064). The local run is how the image is checked.
- **Answering questions:** the query tool, the T-SQL Query check and T-SQL Redaction (S-007, Q-035).
- **Tiers above `read-only` on MS SQL Server,** which are refused at start-up (S-010 to S-012).
- **Windows and Entra groups in the token.** SQL Server on Linux in Docker cannot make one, so the check reads them through `sys.user_token` with no test of their own (D-126).
- **Naming the failed condition** in the `config_invalid` line. It names `DATABASE_URL`, as on PostgreSQL.
- **Redeploying the Worker** with the 413 change (D-126).
- **CI building the image** (Q-039, D-104).

## Needs before live verification
- Docker on the product owner's machine, and `docker login ghcr.io` with a GitHub token that can write packages. The `sql-mcp` package is set to public once it is first pushed.
- The redirect URI `http://localhost:8080/oauth/callback` added to the project's existing Entra ID app registration (D-126).
- An env file outside the repository holding `SERVER_SECRET`, `IDP_CLIENT_SECRET` and `DATABASE_URL` for `sqlmcp_reader`, passed with `docker run --env-file`, so no secret is on a command line.
- `sqlcmd` on the product owner's machine, and two sessions on `mcp-test`: the measurement, as `dbo` and then `sqlmcp_reader`; and the confirmation, as the server admin in `master` and `mcp-test` and as each account. A client-IP firewall rule on `prinslooai.database.windows.net` is added for each session and removed when it ends. Each removal is checked in the portal and noted in the build record (D-127, D-128).
- `READER_PASSWORD` set in the shell for `contained-user.sql`, never written to a file in the repository.
- `openssl` on the product owner's machine for `npm run db:mssql:certs`.

## Tasks

### T-001 — The Node adapter requires its own settings through the app's seams, and serves the shared app
Verified by: node_adapter_requires_engine_mssql, node_adapter_requires_database_url, node_adapter_requires_public_url, node_adapter_refuses_tier_above_read_only, adapter_config_error_takes_config_invalid_path, read_config_failure_named_before_adapter_error, node_adapter_trims_database_url, node_adapter_refuses_unparseable_database_url, node_adapter_refuses_unchecked_tls_settings, app_uses_runtime_classifier, node_adapter_serves_healthz_and_metadata, node_adapter_reports_package_version_only, node_adapter_offers_list_tables_alone, node_adapter_writes_audit_record_to_stdout, node_adapter_exits_on_invalid_port

### T-002 — An MCP request body over 1 MiB gets 413 before parsing
Verified by: oversized_mcp_body_gets_413_before_parsing, oversized_chunked_body_gets_413_while_streaming, understated_content_length_gets_413_while_streaming, body_at_limit_is_accepted

### T-003 — Container fetches refuse private addresses at connect time
Verified by: guarded_fetch_refuses_private_and_special_addresses, guarded_fetch_refuses_when_any_address_is_private, guarded_fetch_refuses_ipv4_mapped_private, guarded_fetch_refuses_ip_literal_hosts, guarded_fetch_allows_public_address, cimd_private_host_ends_in_invalid_client

### T-004 — The Allow-list is read from MS SQL Server's grants on every Tool call
Verified by: mssql_resolver_lists_granted_tables_and_columns, mssql_resolver_hides_ungranted_and_denied, mssql_resolver_excludes_system_tables, mssql_resolver_formats_builtin_column_types, mssql_resolver_shows_user_defined_types_without_their_names, mssql_resolver_marks_every_column_readable, mssql_resolver_sees_grant_and_revoke_immediately, mssql_resolver_applies_boundary, mssql_resolver_quotes_table_names

### T-005 — public's defaults and the ownership catalogs are measured on SQL Server 2022 and on mcp-test before the check ships
Verified by: mssql_public_defaults_are_covered_by_list, mssql_ownership_list_covers_catalog_views, mssql_tests_connect_to_sqlmcp, and manual — in the first `sqlcmd` session on `mcp-test`, the product owner runs the defaults query as `sqlmcp_reader` and the ownership-catalog query. The rows, and the Docker tests', are in the build record, each matched to the list entry or exclusion that covers it, with the firewall rule's addition and removal.

### T-012 — The shipped Azure SQL Database statement passes the reader and refuses the others on mcp-test
Verified by: check_sql_printed_matches_bundle, and manual — after the statement is final, in the second `sqlcmd` session, the product owner runs `npm run print:check-sql`'s output as `sqlmcp_reader` (passes), `sqlmcp_mapped` and the server admin (both refused), then drops `sqlmcp_mapped` and its login. The outcomes, the printed statement's SHA-256, the firewall rule's removal and the drop are in the build record. At verification, `docker run --rm ghcr.io/prinsloopower/sql-mcp:<SHA> node dist/server.js --print-check-sql` is run against the published SHA tag, and its SHA-256 must equal the recorded one. If it differs, the statement changed after the session, and the second session is run again.

### T-006 — An MS SQL Server account holding anything outside the read-only list is refused, and /healthz says so
Verified by: mssql_check_passes_listed_reader, mssql_check_ignores_deny_rows, mssql_check_refuses_each_named_route, mssql_check_refuses_fixed_roles_but_public, mssql_check_refuses_owned_securables, mssql_check_refuses_server_level_ownership, mssql_check_refuses_unlisted_grant, mssql_check_reads_nested_roles_from_token, mssql_check_statement_on_azure_sql_reads_no_server_level, mssql_check_statement_on_azure_sql_requires_contained_user, mssql_unsafe_account_answers_503_naming_database_url, mssql_healthz_reports_unsafe_account, postgres_unlisted_flag_always_false

### T-007 — MS SQL Server errors are classified to D-080's classes and rebuilt without names
Verified by: mssql_errors_classified, mssql_error_number_decides_before_driver_code, mssql_azure_transient_errors_are_connection_at_connect_and_request, mssql_resource_limit_errors_are_connection, mssql_lock_timeout_is_timeout, mssql_unreachable_database_is_connection_within_connect_limit, mssql_connect_limit_overrides_connection_string, mssql_pool_retries_after_failed_first_connect, mssql_pool_sets_no_request_timeout, mssql_untrusted_certificate_is_connection, mssql_connects_with_test_ca

### T-008 — The container image runs the Server and nothing else, and is published to GHCR
Verified by: image_bundle_excludes_postgres_and_wrangler, image_holds_only_the_bundle, image_packages_declared, image_runs_as_non_root, and the command `npm run build:image && docker build -t sql-mcp:local .`, then `docker run` with `PUBLIC_URL=http://localhost:8080` and a `DATABASE_URL` of `Server=host.docker.internal,51433;Database=sqlmcp;…` for `sqlmcp_reader` (never `sa`), and the test CA mounted read-only and named by `NODE_EXTRA_CA_CERTS`, then `npm run smoke -- http://localhost:8080`. The pushed image's SHA tag is then pulled with no `docker login`. Commands and output go in the deploy record.

### T-009 — The settings reference and the clean copy carry the container
Verified by: settings_reference_covers_container_settings, settings_reference_states_database_tls_rule, export_keeps_image_files, export_refuses_project_identifiers, export_refuses_test_certificates

### T-010 — The Security material states MS SQL Server's account check
Verified by: manual — `docs/security-material/visibility.md` is read against this spec. It states the closed list, how it differs from PostgreSQL's (D-124), the contained-user rule on Azure SQL Database, and the container fetch guard. Each point names its rule or decision.

### T-011 — Live: listing from Claude Code follows the grants on MS SQL Server 2022 in Docker
Verified by: manual — the product owner runs the published image by its SHA tag with the env file, the test CA mounted read-only and named by `NODE_EXTRA_CA_CERTS`, adds `http://localhost:8080/mcp` to Claude Code, signs in with Entra ID, and asks which tables they can query. The answer lists `orders` and the three `customers` columns, and nothing else. After `REVOKE SELECT ON sqlmcp_test.orders FROM sqlmcp_reader`, the next question omits `orders`. `docker logs` holds one Audit record line per call, with their identity. Outcomes and dates go in the verification record.

## Critique findings

Gate 1, 2026-11-07, critique in fresh context. Verdict: fail (2 blockers, 12 gaps, 3 nits).

- **blocker: the Key Vault is created by the same deploy that needs its secrets.** The first revision resolves Key Vault references before the Operator can write them, and on an RBAC vault the Operator has no data-plane role to write them at all.
- **blocker: column type names leak user-defined types,** against D-081 and D-082: a non-built-in type must show as `user-defined`, because its name can carry a Hidden object's name.
- **gap 1:** no seam is named for the Node adapter's required `ENGINE`, `PUBLIC_URL` and `DATABASE_URL`. `readConfig` reads none of them as required, and the Worker must stay unchanged.
- **gap 2:** the error classifier misses Azure SQL's login-time errors 40613, 40615 and 40532, so a paused database or a firewall refusal would be `other`.
- **gap 3:** no statement time limit is set, so the `mssql` driver's 15-second `requestTimeout` default breaks D-003.
- **gap 4:** the account check is tested for four of D-077's seven routes. `CONTROL SERVER`, `SELECT ALL USER SECURABLES`, database `CONTROL` and the `EngineEdition = 5` branch are untested.
- **gap 5:** D-081's routes to a bypassing role (`ALTER ANY ROLE`, `db_securityadmin`, `ALTER ANY USER`, `IMPERSONATE`) are not checked on MS SQL Server.
- **gap 6:** user-defined types are marked unreadable as if Q-034 were open. D-085 answered it.
- **gap 7:** an unconditional Key Vault reference to the optional `SERVER_SECRET_PREVIOUS` fails every deploy without a rotation.
- **gap 8:** the TCP probe changes operations.md's `/healthz` monitoring rule with no amendment or Q.
- **gap 9:** a computed `PUBLIC_URL` contradicts environments.md and rules out custom domains.
- **gap 10:** the guide leaves out the Identity provider app registration and its ordering around the generated URL.
- **gap 11:** the 1 MiB request body limit and its 413 are not assigned to the Node adapter.
- **gap 12:** rollback by `:X.Y.Z` fails while hand pushes overwrite that tag. It should use the SHA tag.
- **nit 1:** the Allow-list statement differs from data-model.md's `fn_my_permissions` per table, with no D.
- **nit 2:** the MS SQL Server mapping has no `constraint` class (547, 2601, 2627, 515), which D-080 gives S-006.
- **nit 3:** the connect test's 6 seconds should be stated as tolerance on the 5-second limit.

Revision 2, 2026-11-07:
- Key Vault → two stages. `base.bicep` makes the vault, with Secrets Officer for the Operator and Secrets User for the identity, then the Operator writes the secrets, then `app.bicep` makes the Container App (D-117).
- Column types → built-in types by name, every other type as `user-defined` (D-081).
- Seams → `Deps.classify` and `Deps.adapterConfigError`. The Worker and `readConfig` are unchanged.
- Azure login errors → `ELOGIN` and the listed numbers are `connection`.
- Statement limit → `requestTimeout` 0 (D-003).
- Account check → every route tested on its own and through a nested role, plus the `EngineEdition = 5` statement and a live check on Azure SQL.
- D-081 routes → added, mapped to `createRole` (D-117).
- Readability → every column readable, per D-085.
- `SERVER_SECRET_PREVIOUS` → referenced only while `rotating` is true.
- `/healthz` monitoring → raised as Q-041. The probe stays TCP until it is answered.
- `PUBLIC_URL` → a parameter when given, computed otherwise.
- Registration ordering → the guide's steps 3 to 5, around stage 1's `publicUrl` output.
- 1 MiB body → the shared app, both runtimes (D-117).
- Rollback → the SHA tag.
- Allow-list statement → recorded in D-117 and Q-041.
- `constraint` class → added.
- Connect test → the 5-second limit, with one second's tolerance for the runner.

Gate 2, 2026-11-07, critique in fresh context. Verdict: hold (0 blockers, 6 gaps, 3 nits). All gate-1 findings confirmed resolved.

- **gap 1:** operations.md's other monitoring signals (Database errors, Identity provider failures, Server faults, configuration errors, 5xx) are neither built nor deferred. The kit "sets these up where the platform can", and Azure Monitor log alerts can.
- **gap 2:** stage 1 creates role assignments, which needs Owner or User Access Administrator on the resource group. The spec does not state it, so a Contributor-only Operator fails stage 1 with nothing to explain why.
- **gap 3:** the image is said to hold production dependencies but not `pg` or the parser, which package.json lists under `dependencies`. esbuild is not a direct devDependency.
- **gap 4:** the scaling numbers, HTTPS-only ingress and the TCP probe in `app.bicep`, and two of T-008's Bicep tests, have no Proven-by line.
- **gap 5:** the 413 check can be met by reading `Content-Length` alone, leaving chunked or understated bodies unbounded on the Node adapter.
- **gap 6:** with `requestTimeout` 0, the `timeout` class cannot fire as written. The Database's own limits (1222, 40549) and Azure's transient errors at request time (40613, 40197, 40501) fall to `other`.
- **nit 1:** which variable is named when both `adapterConfigError` and `readConfig` fail is unstated.
- **nit 2:** `az keyvault secret set --file` keeps a trailing newline, and the adapter is not said to trim `DATABASE_URL`.
- **nit 3:** some nested-role fixtures, such as a user-defined server role inside `sysadmin`, may not be buildable. The spec should name which routes have a nested form.

Hold resolved by the product owner, 2026-11-07: "Guide queries only" for gap 1, and "Fix all, then re-critique" for the rest.
- Monitoring → the guide's step 8 gives each signal's query and threshold. The templates create no alert (D-118).
- Stage 1's role → the guide's step 0, and the needs above.
- Image → one esbuild bundle with every dependency inlined, and no `node_modules` in the image (D-118).
- Bicep numbers → Proven-by lines and tests for replicas, scaling, ingress, the probe, the vault roles and the `publicUrl` output.
- 413 → counted as the body streams, with tests for chunked and understated bodies.
- Error classes → the error number decides at connect and request time. 40501 and 40549 are `connection`, and 1222 is `timeout`.
- Precedence → a `readConfig` failure is named first.
- Trailing newline → `DATABASE_URL` is trimmed.
- Nested roles → named per route. `sysadmin` has no nested form.

Gate 3, 2026-11-07, critique in fresh context. Verdict: hold (0 blockers, 5 gaps, 4 nits). All gate-2 findings confirmed resolved.

- **gap A:** the 5xx signal cannot be a console-log query. The Server writes no line per request, and Container Apps reports status codes only as the `Requests` metric.
- **gap B:** `CREATE USER … WITH PASSWORD` fails on SQL Server outside Azure SQL unless the database is partially contained. Otherwise it is a login plus a user.
- **gap C:** a fetch guard hooked on DNS lookup never sees an IP-literal host, such as `https://169.254.169.254/x`, and no test covers one.
- **gap D:** the guide has no rotation step for `SERVER_SECRET`, `IDP_CLIENT_SECRET` or the Database password, though `app.bicep` has `rotating`. On Container Apps a vault change takes effect only with a new revision.
- **gap E:** `logRetentionDays` has no allowed range. Log Analytics accepts 30 to 730 days, so a shorter value fails late, and the Security material would not state the floor.
- **nit 1:** the packages S-006 adds, and where they go in package.json, are not named.
- **nit 2:** how `app.bicep` finds stage 1's resources and `publicUrl`, and how the vault's globally unique name is formed, are unstated.
- **nit 3:** the `HAS_PERMS_BY_NAME` object name should be built with `QUOTENAME`.
- **nit 4:** whether a `Connect Timeout` inside `DATABASE_URL` or the 5-second limit wins is unstated.

Hold resolved by the product owner, 2026-11-07: "Metric alert on a count" for gap A, and "Fix all, then re-critique" for the rest (D-119).
- 5xx → a metric alert on `Requests` at more than 1 in 15 minutes, stricter than operations.md's 1%.
- SQL Server account → the guide gives both forms.
- IP literals → checked against the same list, with tests.
- Rotation → the guide's step 8.
- Retention → 30 to 730 days, with the floor in the Security material.
- Packages, stage outputs and vault name, `QUOTENAME`, and the connect limit → stated, each with a test.

Gate 4, 2026-11-07, critique in fresh context. Verdict: hold (0 blockers, 3 gaps, 4 nits). All gate-3 findings confirmed resolved.

- **gap 1:** the account check misses routes to a self-granted bypass (D-081): the `securityadmin` server role, `ALTER ANY SERVER ROLE`, `IMPERSONATE` or `CONTROL` on one specific login, and ownership of, `ALTER` on or `CONTROL` on a database role that reaches a bypassing grant. It does not say whether `IMPERSONATE` on a user means the effective permission, which `CONTROL` implies.
- **gap 2:** there is no reachability path for SQL Server outside Azure SQL Database. The firewall step covers only Azure SQL's "allow Azure services", and Container Apps have no fixed outbound address.
- **gap 3:** docs/settings.md, which the clean copy ships, still says this release does not read `DATABASE_URL` or `PORT`, and gives Wrangler sources only. The spec does not name it.
- **nit 1:** the gate-3 resolution claims a test for the vault name and the packages, and none is named.
- **nit 2:** a malformed `DATABASE_URL` is not addressed.
- **nit 3:** Azure SQL's resource-limit errors 10928 and 10929 fall to `other`.
- **nit 4:** the local image smoke check needs a Database account that passes the account check, and `PUBLIC_URL=http://localhost:8080`.

Hold resolved by the product owner, 2026-11-07: "Azure SQL only" for gap 2, and "Fix all, then re-critique" for the rest (D-120).
- Account check → the missing routes are added and read as effective permissions, each with a test.
- SQL Server outside Azure SQL → out of scope until private networking. The guide supports Azure SQL Database only, and gate 3's login-plus-user form is withdrawn.
- Settings reference → docs/settings.md covers Azure, with a test.
- Nits → vault-name and package tests; an unparseable `DATABASE_URL` is a configuration error; 10928 and 10929 are `connection`; the local smoke check names its login and `PUBLIC_URL`.

Gate 5, 2026-11-07, critique in fresh context. Verdict: fail (1 blocker, 1 gap, 5 nits). All gate-4 findings confirmed resolved.

- **blocker:** rerunning stage 2 after a vault change makes no new revision. On Container Apps, secrets are app-scoped, and changing one creates no revision. Versionless Key Vault references also refresh on the platform's own schedule, within 30 minutes. Rotating `IDP_CLIENT_SECRET` or the Database password, or recovering from a leaked `SERVER_SECRET`, therefore leaves the old value live. Only the planned `SERVER_SECRET` rotation works, and only because it adds an env var.
- **gap:** the account check misses `ALTER` on a schema (ownership chaining reaches other tables), `ALTER ANY SCHEMA`, `db_ddladmin`, `CONTROL` on a schema, and `TAKE OWNERSHIP` on a bypassing role.
- **nit 1:** the managed-identity out-of-scope reason still says the kit works for SQL Server outside Azure SQL, against D-120.
- **nit 2:** `ALTER` on, or ownership of, a user-defined server role that holds `CONTROL SERVER` is not listed, which matters on editions other than Azure SQL Database.
- **nit 3:** whether the pool retries after a failed first connect is unstated.
- **nit 4:** `node_adapter_serves_healthz_and_metadata` and `mssql_pool_sets_no_request_timeout` have no Proven-by line.
- **nit 5:** a soft-deleted vault with the same name blocks stage 1 after a resource group is recreated, and the guide has no line for it.

Revision 6, 2026-11-08, after the system-spec amendment (D-122 to D-124) and the backlog split (D-121, D-125). S-006 is now the image, the Node adapter and MS SQL Server listing, checked locally against SQL Server 2022 in Docker.
- Blocker (revisions after a vault change) → S-013, with the Azure kit. operations.md now forces a revision on every stage-2 deploy (D-121).
- Gap (schema `ALTER`, `ALTER ANY SCHEMA`, `db_ddladmin`, schema `CONTROL`, `TAKE OWNERSHIP`) → security.md's closed list refuses each. They are tested among the named routes.
- Nit 1 (managed-identity reason) and nit 5 (soft-deleted vault) → S-013.
- Nit 2 (server roles holding `CONTROL SERVER`) → the closed list refuses any server role but `public`.
- Nit 3 (pool retry) → a failed first connect discards the pool, with a test.
- Nit 4 → Proven-by lines for the Node adapter's `/healthz` and metadata, and for the pool's `requestTimeout`.
- The lint's restatement finding on column types → the spec refers to data-model.md.

Gate 6, 2026-11-08, critique in fresh context. Verdict: hold (0 blockers, 5 gaps, 5 nits). All gate-5 findings confirmed resolved or moved to S-013.

- **gap 1:** server-level ownership (`sys.server_principals`, `sys.endpoints`) is never tested. The named routes include none, so owning a user-defined server role could go unrefused off Azure SQL Database.
- **gap 2:** the ownership-catalog test has no operational definition. Many views carry a `principal_id` that is not an owner. Owner columns security.md does not list, possibly `sys.fulltext_stoplists` and `sys.registered_search_property_lists`, have no path to an amendment.
- **gap 3:** the `EngineEdition = 5` branch is checked only as statement text. No login-mapped user is ever seen refused before S-013.
- **gap 4:** the Docker database is not named, so the seed and the defaults measurement could run in `master`.
- **gap 5:** the Azure portal's query editor may need a client-IP firewall rule on `mcp-test`, against D-125, and the spec has no plan for it.
- **nit 1:** R-002 and J-003 are only partly delivered here. S-007 and S-013 carry the rest.
- **nit 2:** the image's `X.Y.Z` is not given. `0.1.0` is already the Worker's, which lacks the 413 change.
- **nit 3:** `node_adapter_writes_audit_record_to_stdout`, `app_uses_runtime_classifier` and `export_refuses_project_identifiers` have no Proven-by line.
- **nit 4:** no source is named for the `mcp-test` tables.
- **nit 5:** no behaviour is given for an invalid `PORT`.

Hold resolved by the product owner, 2026-11-08: "Temporary IP rule" for gap 5, "Run on mcp-test" for gap 3, "Fix all, re-critique" for the rest, and "Confirm all" for D-126 (D-127).
- Query editor → a client-IP rule for the measurement session only, removed after it, with the removal noted in the build record.
- Azure SQL Database branch → run on `mcp-test` as `sqlmcp_mapped` and the server admin, both refused, with `sqlmcp_mapped` dropped afterwards.
- Server-level ownership → tested for a server role and a `DATABASE_MIRRORING` endpoint.
- Ownership catalogs → checked against `sys` views with an owner-like column, with an exclusion list giving each reason. A view in neither list stops the build for a security.md amendment.
- Docker database → `sqlmcp`, never `master`.
- Nits → trace note; version `0.2.0`; Proven-by lines for the Audit line, the classifier seam and the export's refusal; `test/mssql/*.sql` as the source for `mcp-test`; an invalid `PORT` exits non-zero.

Gate 7, 2026-11-08, critique in fresh context. Verdict: hold (0 blockers, 3 gaps, 6 nits). All gate-6 findings confirmed resolved.

- **gap 1:** the ownership-catalog test runs only on SQL Server 2022. Azure SQL Database, the only Operator target (D-120), is evergreen and may have owned-securable views that 2022 lacks (security.md, It owns nothing).
- **gap 2:** `CREATE LOGIN` and `DROP LOGIN` for `sqlmcp_mapped` run in `master` on Azure SQL Database. The portal's query editor may not connect to `master`, and no other client is named.
- **gap 3:** the live `EngineEdition = 5` run is not tied to the statement that ships. A defaults amendment would change the statement after D-127's one session.
- **nit 1:** "no test or seed step runs in `master`" contradicts the seed creating `sqlmcp`.
- **nit 2:** `mssql_resolver_applies_boundary`, `mssql_resolver_marks_every_column_readable` and `postgres_unlisted_flag_always_false` have no Proven-by line. The Dockerfile's non-root user has neither a test nor a Proven-by line.
- **nit 3:** the connect-time guard also covers Identity provider fetches, which security.md does not state for them, and no D records it.
- **nit 4:** where `sqlmcp_reader`'s password on `mcp-test` comes from is unstated. `contained-user.sql` is committed and exported.
- **nit 5:** the slice backlog's S-006 entry still says no firewall rule is added, which D-127 amends. No Q carries the fix.
- **nit 6:** how the image container reaches the Compose SQL Server is unstated.

Hold resolved by the product owner, 2026-11-08: "sqlcmd for everything" for gap 2, "Measure, then confirm" for gaps 1 and 3, and "Fix all, re-critique" for the nits (D-128).
- Client → `sqlcmd` for both `mcp-test` sessions, never the portal's query editor.
- Sessions → the first measures `public`'s defaults and lists Azure SQL Database's ownership catalogs. The second, after any amendment, runs the shipped `EngineEdition = 5` statement as printed from the bundle (T-012).
- Nits → only creating `sqlmcp` and the logins runs in `master`; Proven-by lines for the Boundary, readability and PostgreSQL's `unlisted`; the image runs as uid 1000, with a test; the Identity provider's fetch guard is recorded in D-128; `contained-user.sql` takes the password as a `sqlcmd` variable; Q-042 carries the backlog's firewall wording; the container reaches the Compose SQL Server as `host.docker.internal,51433`.

Gate 8, 2026-11-08, critique in fresh context. Verdict: hold (0 blockers, 1 gap, 1 nit). All gate-7 findings confirmed resolved.

- **gap:** how the Database connection's TLS certificate is checked is undecided. SQL Server 2022 in Docker serves a self-signed certificate, which `tedious` refuses by default. Whether the adapter honours `TrustServerCertificate=true` on every target, Azure included, is a system-wide security choice with no decision on record.
- **nit:** T-012 records the confirmed statement's hash, but nothing compares it with the statement in the published SHA-tagged image.

Hold resolved by the product owner, 2026-11-08: "Mount a CA in Docker" for the gap, and "Fix both, re-critique" (D-129).
- Database TLS → always encrypted, with the certificate always checked. `TrustServerCertificate=true` or `Encrypt=false` is a configuration error naming `DATABASE_URL`. Docker's SQL Server gets a test CA's certificate, which the tests and the image container trust through `NODE_EXTRA_CA_CERTS`.
- Statement hash → at verification, the statement printed from the published SHA-tagged image must have the SHA-256 recorded in T-012's session.

Gate 9, 2026-11-08, critique in fresh context. Verdict: pass (0 blockers, 0 gaps, 3 nits). Both gate-8 findings confirmed resolved.

- **nit 1:** which `Encrypt` values pass is unstated, and only refusals are tested. The Azure portal's `Encrypt=True;TrustServerCertificate=False` could be refused.
- **nit 2:** T-011's live run does not mention the test CA, without which the image cannot connect.
- **nit 3:** the export's refusal of `test/mssql/certs/` has no test of its own, and the settings reference does not list the TLS refusal.

Nits fixed before the pass: matching is case-insensitive, with `true`, `yes`, `mandatory` and `strict` passing, and a Proven-by line for the portal's string; T-011 mounts the CA; T-009 gains `settings_reference_states_database_tls_rule` and `export_refuses_test_certificates`, and the settings reference states the rule.
