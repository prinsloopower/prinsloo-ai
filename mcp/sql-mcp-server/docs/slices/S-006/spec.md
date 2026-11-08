# S-006 — The container image, the Bicep kit and MS SQL Server's catalog

Delivers: with two `az deployment group create` runs and the published image `ghcr.io/prinsloopower/sql-mcp`, a Container App comes up whose `/mcp` a Staff member adds to Claude or ChatGPT, signs in to through Entra ID, and asks which tables they may query, getting `list_tables` answered from MS SQL Server's own grants. Its one tool lists; none reads rows.
Traces: J-001, J-002, J-003, R-001, R-002, R-003, R-009

## Screens
None: the Server has no interface of its own (D-046). What a Staff member sees is their AI tool's rendering of Sign-in and of the `list_tables` result, unchanged from S-001 and S-002.

## Interface
No new endpoint and no new tool. The Azure Deployment answers the same paths as the Worker: `/healthz`, `/mcp`, the two well-known metadata documents, `/authorize`, `/oauth/callback`, `/token` and `/register`.

- **Tools on MS SQL Server:** `list_tables` only. The query tool is not registered, because the Node adapter supplies no Query engine until S-007. `tools/list` therefore shows one tool.
- **`initialize`** reports the Server version as the package version alone, such as `0.1.0` (D-114). Unlike the Worker, it carries no deploy id.
- **Request body:** a body over 1 MiB gets 413 before it is parsed (operations.md). The shared app enforces this, so the Worker gains it too (D-117). A `Content-Length` over the limit is refused at once. A body with no `Content-Length`, or with one that understates it, is counted as it streams, and refused as soon as it passes 1 MiB.

### Seams in the shared app
Engine and runtime differences enter through `Deps` (`src/app.ts`), and through nothing else. Two fields are new:
- `classify`: the runtime's Database error classifier, which replaces the app's direct import of `classifyPostgresError`. The Worker passes `classifyPostgresError`, so its behaviour is unchanged.
- `adapterConfigError`: the name of a variable that the runtime adapter itself requires and found missing or invalid. When it is set, the app takes the same path as a `readConfig` failure naming that variable: 503 on every MCP and Sign-in path, `/healthz` reporting `config: invalid`, and one `config_invalid` line. When `readConfig` also fails, its variable is the one named. The Worker never sets it, and `readConfig` is unchanged, so `PUBLIC_URL` stays optional on Workers.

## Runtime adapter (Node)
`src/server.ts`, built to `dist/server.js`, is the container image's entry point (components.md, Runtime adapter). It:
- reads Server settings from `process.env` once, at process start (D-070);
- sets `adapterConfigError` to the first of these that fails, in this order:
  - `ENGINE`, unless it is exactly `mssql`;
  - `DATABASE_URL`, when it is unset or does not parse as an ADO connection string naming a server and a database. It is trimmed first, like every other variable, so a secret saved from a file with a trailing newline still works;
  - `PUBLIC_URL`, when it is unset, because a proxy sits in front (environments.md).
  The value of `DATABASE_URL` is never logged or echoed;
- listens on `PORT`, `8080` when unset;
- names `DATABASE_URL` as the connection setting in `config_invalid` lines for an account that bypasses grants (D-077);
- gives the app a guarded `fetch` for the Client ID Metadata Document and the Identity provider. It refuses the connection unless every address the host resolves to is public, checking at connect time (security.md, Fetches): no loopback, RFC 1918, link-local (169.254.0.0/16, fe80::/10), CGNAT (100.64.0.0/10), ULA (fc00::/7), multicast or unspecified address, and no IPv4-mapped form of any of them. A host written as an IP literal, such as `https://169.254.169.254/x` or `https://[::1]/x`, is checked against the same list, because no DNS lookup happens for it. A refused fetch fails the way an unreachable one does, so registration ends with `invalid_client`.

Sign-in, tokens, metadata, Audit records and operational lines are the shared code S-001 and S-002 built, unchanged.

## Engine adapter (MS SQL Server)
`MssqlDatabase` implements `Database` with `mssql` (`tedious`), one connection pool per process, built from `DATABASE_URL` in ADO form (environments.md). Connecting gives up after 5 seconds (operations.md). The adapter sets this after reading `DATABASE_URL`, so a `Connect Timeout` in the connection string does not change it. `requestTimeout` is 0, so the Server sets no statement time limit (D-003). `query()` is not reached in this slice, because no query tool is registered. It throws if it is called.

### Allow-list
`catalog()` runs one catalog Server statement (ADR-006). It returns one `CatalogRow` per column of every user table (`sys.tables`, `is_ms_shipped = 0`):
- `granted` is `HAS_PERMS_BY_NAME(QUOTENAME(<schema>) + '.' + QUOTENAME(<table>), 'OBJECT', 'SELECT', <column>, 'COLUMN') = 1`. The quoting keeps a name holding `.` or `]` pointing at its own table. The check counts grants through roles, and denies at table and column level. data-model.md also names `fn_my_permissions(<table>, 'OBJECT')` per table. The column check alone decides the same rows in one statement, so it is not used (D-117, Q-041);
- `type` is shown by name only when it is a built-in type (`sys.types.is_user_defined = 0`), with its length, precision and scale where they apply, such as `nvarchar(100)`, `decimal(10,2)` or `nvarchar(max)`. Any other type, whether alias, CLR or table, is shown as `user-defined`, because a type's name lives in a schema and can carry a Hidden object's name (D-081);
- `readable` is true for every column. D-085 refuses only `reg*` and composite types, which MS SQL Server columns do not have;
- tables the account owns, directly or through a role it is a member of, are left out. A table's owner is its own `principal_id`, else its schema's (D-076, D-077).

System schemas (`sys`, `INFORMATION_SCHEMA`) are already excluded by the shared resolver. The Boundary, the 500-table cap, code-point ordering and the `schema` filter all apply unchanged.

### Account check
`accountFlags()` runs in the same catalog statement and in `/healthz`. The account bypasses grants if it holds any of the following, directly or through a role at any depth:
- **reaches every table (D-077):**
  - `sysadmin` (`IS_SRVROLEMEMBER`);
  - server-level `CONTROL SERVER` or `SELECT ALL USER SECURABLES` (`fn_my_permissions(NULL, 'SERVER')`);
  - `db_owner` or `db_datareader` (`IS_ROLEMEMBER`);
  - database-level `CONTROL` or `SELECT` (`fn_my_permissions(NULL, 'DATABASE')`);
- **can give itself such a grant (D-081):**
  - the server role `securityadmin`, or server-level `ALTER ANY SERVER ROLE` or `IMPERSONATE ANY LOGIN`;
  - `IMPERSONATE` on any one login;
  - `db_securityadmin` or `db_accessadmin`;
  - database-level `ALTER ANY ROLE`, `ALTER ANY USER` or `ALTER ANY APPLICATION ROLE`;
  - `IMPERSONATE` on any database user;
  - ownership of, or `ALTER` on, any database role whose members would bypass grants by the rules above. Ownership counts directly or through a role.

  Every permission here is read as an effective permission (`HAS_PERMS_BY_NAME` on the securable), so a permission that implies it counts too. `CONTROL` on a user or a login, for example, implies `IMPERSONATE` on it.

On Azure SQL Database (`SERVERPROPERTY('EngineEdition') = 5`), server-level permissions cannot be read from a user database, so the server-level checks are left out of the statement there. The server admin login maps to `dbo`, and is caught as `db_owner` (D-116). The results map onto the existing `AccountFlags` (D-116, D-117):
- `superuser`: the server-level checks, `db_owner` and database `CONTROL`;
- `readAllData`: `db_datareader` and database `SELECT`;
- `createRole`: every route under D-081;
- `bypassRls` and `writeAllData`: always false.

### Database errors
`classifyMssqlError` maps `tedious` errors to D-080's reason classes. The error number decides first, whether the error came at connect time or from a request on a pooled connection. The driver code decides only when there is no number.
- `connection`:
  - error numbers 18456 (login failed), 4060 (cannot open database), 40613 (database unavailable, including a serverless database resuming), 40615 (firewall), 40532 (cannot open server), 40197 (service error), 40501 (service busy), 40549 (transaction ended by the service), and 10928 and 10929 (resource limit reached);
  - with no number, the driver codes `ESOCKET`, `ECONNCLOSED`, `ELOGIN` and `ETIMEOUT`. The last can only come from connecting, because `requestTimeout` is 0;
- `timeout`: error number 1222 (lock timeout), the Database's own limit. The Server sets none (D-003);
- `permission`: error numbers 229, 230 and 262;
- `constraint`: error numbers 547, 2601, 2627 and 515;
- `other`: everything else.

As on PostgreSQL, the Agent's message is rebuilt from the class, and the driver's text is never passed through (D-005).

## Container image
- `dist/server.js` is one file, bundled by esbuild from `src/server.ts` with every dependency inlined (`npm run build:image`). The PostgreSQL adapter is never imported from `src/server.ts`, so `pg` and the parser are not in the bundle (D-063, D-118). S-006 adds `mssql`, `@hono/node-server` and `undici` to `dependencies`, and `esbuild` to `devDependencies`. The Worker's bundle imports none of the three, so it does not change.
- A `Dockerfile` at the package root: build on `node:24-slim`, run on `node:24-slim` as a non-root user. The runtime image holds `dist/server.js` and nothing else from the project: no `node_modules`, no PostgreSQL parser, no `pg` and no Wrangler.
- **Published** to GHCR, public, as `ghcr.io/prinsloopower/sql-mcp` (D-115). Each push carries two tags: the commit SHA, which never moves, and the package version `X.Y.Z`. Until CI exists, the image is built and pushed by hand from the default branch, as D-104 does for the Worker, so `X.Y.Z` is overwritten by each push of the same version. Deploys and rollbacks therefore name the SHA tag (D-117).

## Deployment kit (Azure)
Two Bicep templates in `deploy/azure/`, each deployed with `az deployment group create` into an existing resource group (ADR-009). They are run in two stages, so the vault and the final URL exist before the Container App does (D-117).

**Stage 1: `base.bicep`** creates:
- a Log Analytics workspace, whose retention is the required parameter `logRetentionDays`, with no default (D-052). It is limited to 30 to 730 days, the range Log Analytics accepts on its pay-as-you-go tier, so a value outside it is refused before anything is made. The Security material states the 30-day floor;
- a Container Apps environment that sends console logs to that workspace, so Audit records reach Azure Monitor (ADR-013);
- a user-assigned managed identity, and a Key Vault with RBAC authorisation;
- two role assignments on that vault only: **Key Vault Secrets User** for the identity, and **Key Vault Secrets Officer** for the Operator. The Operator's object id is the required parameter `operatorPrincipalId`, which the guide fills from `az ad signed-in-user show`.

The vault is named `kv-<uniqueString(resource group id, app name)>`, which is unique worldwide and the same on every rerun. Stage 1's outputs are:
- `publicUrl`: the parameter `publicUrl` when given, for an Operator with a custom domain, and otherwise `https://<app name>.<environment default domain>`, computed from the environment it has just made;
- `environmentName`, `identityName` and `vaultName`.

Stage 2 takes all four outputs as parameters, and the guide passes them from stage 1's output with `az deployment group show`. The app name is a parameter of both stages.

**Between the stages,** the Operator:
- registers the Server in Entra ID with the redirect URI `<publicUrl>/oauth/callback`, as the Cloudflare guide's section 5 does;
- writes `DATABASE-URL`, `SERVER-SECRET` and `IDP-CLIENT-SECRET` into the vault, in the portal or with `az keyvault secret set --file`, never `--value`. If the write is refused just after stage 1, the guide says the new role assignment can take a few minutes to apply, and to retry.

**Stage 2: `app.bicep`** creates the Container App:
- the image's SHA tag as a parameter, 1 replica, scaling to at most 3 at 70% CPU (operations.md);
- external HTTPS ingress on port 8080, with HTTP disallowed, and a TCP liveness probe on the port (D-116, Q-041);
- `DATABASE_URL`, `SERVER_SECRET` and `IDP_CLIENT_SECRET` as Key Vault references through the identity;
- `SERVER_SECRET_PREVIOUS` as a Key Vault reference only while the boolean parameter `rotating` is true. It defaults to false, so a deploy outside a rotation references no secret that does not exist;
- `ENGINE=mssql`, and `PUBLIC_URL` from stage 1's `publicUrl` output;
- `IDP_ISSUER`, `IDP_CLIENT_ID`, `IDP_SCOPES`, `PERMISSION_TIER`, `ROW_LIMIT`, `REDACTION` and `BOUNDARY` as parameters.

No secret is a parameter of either template, and no secret is ever on an `az` command line.

`deploy/azure/guide.md` takes an Operator through these steps, in order. Timing them is S-008's job (Q-039):
0. what the Operator needs: Owner or User Access Administrator on the resource group, because stage 1 makes role assignments, which Contributor cannot. The guide's first command checks this with `az role assignment list`;
1. the Database account: a contained user, `CREATE USER … WITH PASSWORD`, in the Azure SQL Database, given only the grants that make the Allow-list, never a role or permission the account check refuses. The guide says at its start that this release supports Azure SQL Database only (D-120);
2. the firewall rule that lets Container Apps reach the Database, and what it opens (D-116);
3. stage 1;
4. the Entra ID registration and the vault's secrets;
5. stage 2;
6. the smoke checks and the Sign-in smoke checks;
7. rollback: stage 2 again, with the previous SHA tag (operations.md);
8. rotation, as security.md's Secrets rules give it:
   - `SERVER_SECRET`: write the old value as `SERVER-SECRET-PREVIOUS` and the new one as `SERVER-SECRET`, then run stage 2 with `rotating=true`. After 30 days, run stage 2 with `rotating=false` and delete `SERVER-SECRET-PREVIOUS`;
   - a leaked `SERVER_SECRET`: write the new value only, and run stage 2 with `rotating=false`, which signs every Staff member out;
   - `IDP_CLIENT_SECRET` and the Database password: rotate at the source, update the vault, and run stage 2.
   A vault change reaches the Container App only with a new revision, which stage 2 makes;
9. monitoring. The kit creates no alert itself (D-118), and `/healthz` waits on Q-041. For the other signals:
   - Database errors, Identity provider failures, Server faults and configuration errors: the Log Analytics query over the Container App's console logs, operations.md's threshold, and how to save it as an Azure Monitor alert;
   - 5xx responses: an Azure Monitor metric alert on the Container App's `Requests` metric, filtered to status code category 5xx, firing at more than 1 in 15 minutes. A metric alert cannot express operations.md's 1% share, so this count is stricter (D-119).

## Data
No new tables, and nothing new in the Server. On the project's Azure SQL Database (D-113):
- the schema `sqlmcp_test`, holding `orders`, `customers` and `staff`, owned by `dbo`, mirroring S-002's test objects;
- the contained user `sqlmcp_reader`, granted SELECT on `sqlmcp_test.orders` and on `sqlmcp_test.customers (id, name, region)` only, and nothing that the account check refuses;
- the project test Deployment's Boundary is `{"schemas":["sqlmcp_test"]}` (operations.md).

`test/docker-compose.yml` gains MS SQL Server 2022 (`mcr.microsoft.com/mssql/server:2022-latest`) on port 51433, for the integration tests (ADR-010, environments.md).

## Proven by
- On MS SQL Server 2022 in Docker, `list_tables` returns exactly the granted tables and columns: a fully granted table has `all_columns: true`, and a partly granted one lists only its granted columns. An ungranted, denied, owned or system table is absent.
- A column of an alias type, such as `sqlmcp_test.phone`, is listed with type `user-defined`, and that type's name appears nowhere in the result.
- A granted table named `a.b]c` is listed with its own grants, not another table's.
- A `GRANT` or `REVOKE` shows on the next `list_tables` call, with no restart.
- An account holding any one of the account check's routes gets 503 "Deployment misconfigured: Database account bypasses grants" on every Tool call, plus one Audit record and a `config_invalid` line naming `DATABASE_URL`. The routes are each tested on their own: `sysadmin`, `CONTROL SERVER`, `SELECT ALL USER SECURABLES`, `db_owner`, `db_datareader`, database `CONTROL`, database `SELECT`, `securityadmin`, `ALTER ANY SERVER ROLE`, `IMPERSONATE ANY LOGIN`, `IMPERSONATE` on one login, `CONTROL` on one login, `db_securityadmin`, `db_accessadmin`, `ALTER ANY ROLE`, `ALTER ANY USER`, `ALTER ANY APPLICATION ROLE`, `IMPERSONATE` on a user, `CONTROL` on a user, ownership of a role that is a member of `db_datareader`, and `ALTER` on such a role. Each database-level route is also tested through a user-defined database role nested two deep. The server-level routes are tested held directly, and `CONTROL SERVER` and `IMPERSONATE ANY LOGIN` also through a user-defined server role. SQL Server lets no user-defined role join `sysadmin`, so `sysadmin` has no nested form. `/healthz` reports `database: unsafe`, and Sign-in and metadata still answer.
- The statement built for `EngineEdition = 5` holds no server-level check, and the one for any other edition holds all of them. On the project's Azure SQL Database, `sqlmcp_reader` passes the check, and the server admin login is refused.
- The Node adapter answers 503 naming `ENGINE` when it is `postgres` or unset, `DATABASE_URL` when that is unset, and `PUBLIC_URL` when it is unset. With `SERVER_SECRET` also unset, the 503 names `SERVER_SECRET`. A `DATABASE_URL` ending in a newline connects. One that names no server, such as `Database=x`, gets the 503 naming `DATABASE_URL`, and its value appears in no output. The Worker's existing tests pass unchanged.
- `tools/list` on the Node adapter lists `list_tables` and nothing else. `initialize` reports version `0.1.0`.
- An MCP request body of 1 MiB + 1 byte gets 413, on both runtimes, before any parsing. It does so in three forms: with a true `Content-Length`, chunked with none, and with a `Content-Length` of 100. A body of exactly 1 MiB is accepted.
- The guarded fetch refuses a Client ID Metadata Document whose host resolves to `127.0.0.1`, `10.0.0.1`, `169.254.169.254`, `100.64.0.1`, `::1`, `fd00::1` or `::ffff:10.0.0.1`, even when another of its addresses is public. It also refuses the IP-literal hosts `https://169.254.169.254/x`, `https://10.0.0.1/x` and `https://[::1]/x`. Registration then ends with `invalid_client`.
- An unreachable Database gives a Database error of class `connection` within the 5-second connect limit (the test allows one second for the runner), even with `Connect Timeout=60` in `DATABASE_URL`, and the Agent's message names no host. Each listed error number maps to its class both at connect time and on a pooled connection's request, and each driver code with no number maps to its class.
- The image built from the `Dockerfile` passes `npm run smoke -- http://localhost:8080` against the Docker Database. Its project files are `dist/server.js` alone, with no `node_modules`, and the bundle holds no `@libpg-query`, `pg` or `wrangler` code.
- `base.bicep` and `app.bicep` build with `az bicep build`. In the compiled templates:
  - `logRetentionDays` and `operatorPrincipalId` have no default, `logRetentionDays` is limited to 30 to 730, and neither template has a secret parameter;
  - `base.bicep` outputs `publicUrl`, `environmentName`, `identityName` and `vaultName`, and `app.bicep` takes each as a parameter;
  - `base.bicep` makes exactly two role assignments, both scoped to its Key Vault: Key Vault Secrets User for the identity and Key Vault Secrets Officer for `operatorPrincipalId`;
  - `base.bicep`'s `publicUrl` output is the `publicUrl` parameter when given, and `https://<app name>.<environment default domain>` otherwise;
  - `app.bicep`'s Container App has at least 1 and at most 3 replicas and a CPU scale rule at 70%. Its ingress is external, on target port 8080, with `allowInsecure` false. Its liveness probe is TCP on port 8080;
  - `app.bicep` references `SERVER_SECRET_PREVIOUS` only when `rotating` is true.
- The Azure guide:
  - names the role stage 1 needs, in its first step;
  - says at its start that it supports Azure SQL Database only, and gives the contained-user form of the Database account;
  - gives the rotation steps for all three secrets;
  - gives a Log Analytics query with operations.md's threshold for the four log signals;
  - gives the 5xx metric alert at more than 1 in 15 minutes.
- docs/settings.md, the settings reference the clean copy ships, describes the Azure Deployment as well as the Cloudflare one. It covers:
  - `ENGINE=mssql`;
  - `DATABASE_URL` and `PUBLIC_URL`, both required on Azure;
  - `PORT`;
  - Key Vault and template parameters as sources;
  - reading at process start;
  - the 503 a missing adapter setting gives.
  It no longer says this release does not read `DATABASE_URL` or `PORT`.
- The vault name and the bundle's package list each have a test: the name is `kv-` followed by `uniqueString(resource group id, app name)`; `mssql`, `@hono/node-server` and `undici` are in `dependencies`, and `esbuild` in `devDependencies`.
- On the project test Deployment, `npm run smoke` and the Sign-in smoke checks pass against the Container App's URL.
- From Claude and from ChatGPT, a signed-in Staff member asking which tables they may query gets `orders` and the three `customers` columns, and nothing else. After a `REVOKE`, the next question omits `orders`. Each question's Audit record is found in Log Analytics, naming the Staff member.

## Out of scope
- **Answering questions:** the query tool, the T-SQL Query check and T-SQL Redaction (S-007, Q-035).
- **Timing the deployment:** the timed Azure trial (S-008).
- **A setup command for Azure,** like S-005's. The guide gives `az` commands, and S-008's trial shows whether a command is needed.
- **A `/healthz` health check that calls a human:** the liveness probe is TCP (D-116). How operations.md's `/healthz` row is met on Azure is Q-041. Until it is answered, the guide says no alert is set up.
- **Alert rules in the templates:** the guide gives each other signal's query and threshold, and the Operator saves the alerts (D-118).
- **Managed identity sign-in to the Database:** the Database account uses a password held in Key Vault, so the same kit works for SQL Server outside Azure SQL (D-116).
- **Private networking:** a VNet or private endpoint between the Container App and the Database (D-064, D-116).
- **SQL Server outside Azure SQL Database,** on a VM or on-premises. Container Apps have no fixed outbound address, so reaching it would mean opening its port to every Azure address. It waits for private networking (D-120). The Engine adapter still runs against SQL Server 2022, which the integration tests use.
- **CI building the image** (Q-039, D-104).

## Needs before live verification
- The Azure CLI on the product owner's machine, signed in to tenant `Prinsloo147.onmicrosoft.com`, subscription `f3773fcf-7f0c-445f-9184-b50b3e74a99c` (D-113), as Owner or User Access Administrator on `ai-dev`.
- `docker login ghcr.io` with a GitHub token that can write packages, and the `sql-mcp` package set to public once it is first pushed.
- On `prinslooai.database.windows.net`: the firewall rule from the guide, plus `sqlmcp_test` and `sqlmcp_reader` in `mcp-test`, made as `dbo`.
- An Entra ID app registration for stage 1's `publicUrl`, as the guide's step 4.

## Tasks

### T-001 — The Node adapter requires its own settings through the app's seams, and serves the shared app
Verified by: node_adapter_requires_engine_mssql, node_adapter_requires_database_url, node_adapter_requires_public_url, adapter_config_error_takes_config_invalid_path, read_config_failure_named_before_adapter_error, node_adapter_trims_database_url, node_adapter_refuses_unparseable_database_url, app_uses_runtime_classifier, node_adapter_serves_healthz_and_metadata, node_adapter_reports_package_version_only, node_adapter_offers_list_tables_alone

### T-002 — An MCP request body over 1 MiB gets 413 before parsing
Verified by: oversized_mcp_body_gets_413_before_parsing, oversized_chunked_body_gets_413_while_streaming, understated_content_length_gets_413_while_streaming, body_at_limit_is_accepted

### T-003 — Container fetches refuse private addresses at connect time
Verified by: guarded_fetch_refuses_private_and_special_addresses, guarded_fetch_refuses_when_any_address_is_private, guarded_fetch_refuses_ipv4_mapped_private, guarded_fetch_refuses_ip_literal_hosts, guarded_fetch_allows_public_address, cimd_private_host_ends_in_invalid_client

### T-004 — The Allow-list is read from MS SQL Server's grants on every Tool call
Verified by: mssql_resolver_lists_granted_tables_and_columns, mssql_resolver_hides_ungranted_and_denied, mssql_resolver_excludes_owned_and_system_tables, mssql_resolver_excludes_tables_owned_through_role, mssql_resolver_formats_builtin_column_types, mssql_resolver_shows_user_defined_types_without_their_names, mssql_resolver_marks_every_column_readable, mssql_resolver_sees_grant_and_revoke_immediately, mssql_resolver_applies_boundary, mssql_resolver_quotes_table_names

### T-005 — An MS SQL Server account with any route past its grants is refused, and /healthz says so
Verified by: mssql_bypass_check_catches_each_route, mssql_bypass_check_reads_effective_permissions, mssql_bypass_check_catches_role_ownership_and_alter, mssql_bypass_check_catches_database_routes_through_nested_role, mssql_bypass_check_catches_server_routes_through_server_role, mssql_bypass_check_passes_plain_reader, mssql_check_statement_omits_server_checks_on_azure_sql, mssql_unsafe_account_answers_503_naming_database_url, mssql_healthz_reports_unsafe_account

### T-006 — MS SQL Server errors are classified to D-080's classes and rebuilt without names
Verified by: mssql_errors_classified, mssql_error_number_decides_before_driver_code, mssql_azure_transient_errors_are_connection_at_connect_and_request, mssql_resource_limit_errors_are_connection, mssql_lock_timeout_is_timeout, mssql_unreachable_database_is_connection_within_connect_limit, mssql_connect_limit_overrides_connection_string, mssql_pool_sets_no_request_timeout

### T-007 — The container image runs the Server and nothing else
Verified by: image_bundle_excludes_postgres_and_wrangler, image_holds_only_the_bundle, image_packages_declared, and the command `npm run build:image && docker build -t sql-mcp:local .`. Then `docker run`, with `PUBLIC_URL=http://localhost:8080` and a `DATABASE_URL` for a reader login on the Docker Database that passes the account check (never `sa`), followed by `npm run smoke -- http://localhost:8080`. The command and its output are recorded in the deploy record.

### T-008 — The two Bicep stages make the vault and URL first, then the Container App, with secrets only in Key Vault
Verified by: bicep_base_requires_log_retention_and_operator_without_default, bicep_base_grants_operator_and_identity_on_vault_only, bicep_base_outputs_given_or_computed_public_url, bicep_base_limits_log_retention_to_30_through_730, bicep_base_names_vault_from_unique_string, bicep_app_takes_stage_one_outputs, bicep_templates_take_no_secret_parameter, bicep_app_scales_one_to_three_at_70_percent_cpu, bicep_app_ingress_https_only_on_8080_with_tcp_probe, bicep_app_references_previous_secret_only_when_rotating, all reading the templates as `az bicep build` compiles them, which must exit 0 for both

### T-009 — The Azure guide and the settings reference cover every setting and step, in order, and the clean copy carries the Azure kit
Verified by: azure_guide_names_every_azure_setting, azure_guide_names_role_needed_for_stage_one, azure_guide_orders_stages_registration_and_secrets, azure_guide_supports_azure_sql_only_with_contained_user, settings_reference_covers_azure_deployment, azure_guide_gives_rotation_for_each_secret, azure_guide_gives_query_and_threshold_per_signal, azure_guide_gives_5xx_metric_alert, azure_guide_gives_sha_rollback_and_firewall, export_keeps_azure_kit_and_image_files, export_refuses_azure_project_identifiers

### T-010 — The project's MS SQL Server test Deployment runs on Azure
Verified by: manual — in `mcp-test`, `sqlmcp_reader` exists as a contained user that passes the account check, the server admin login is refused by it, and `sqlmcp_test` holds the three tables owned by `dbo`, with the grants under Data. The image `ghcr.io/prinsloopower/sql-mcp` is public, with the deployed SHA tag. Both stages deploy into `ai-dev`. `npm run smoke` and `node scripts/smoke-signin.mjs` pass against the Container App's URL. environments.md's project test Deployment row is given that URL in the deploy record.

### T-011 — A Security reviewer can read what an Azure Deployment adds
Verified by: manual — `docs/security-material/azure.md` is read against this spec. It states: the Key Vault, managed identity and Operator role arrangement; the container fetch guard; the firewall rule and what it opens; MS SQL Server's account check, route by route; the 1 MiB body limit; and log retention set by the Operator. Each point names its rule or decision.

### T-012 — Live: Sign-in and listing from Claude and ChatGPT follow the grants on MS SQL Server
Verified by: manual — the product owner adds the Container App's `/mcp` to Claude and ChatGPT, signs in with Entra ID, and asks which tables they can query. Each answer lists `orders` and the three `customers` columns, and nothing else. After `REVOKE SELECT ON sqlmcp_test.orders FROM sqlmcp_reader`, the next question omits `orders`. Each question's Audit record is found in Log Analytics. Outcomes and dates are recorded in the verification record.

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
