# Security — sql-mcp-server

Organised by R-014's four questions, the shape the Security material also takes; no external framework is mapped (D-055). Every rule names the component that enforces it (components.md). Every component listed is server-side, and the AI tool enforces nothing the Server relies on.

## Who can call it

| rule | enforced in |
|---|---|
| Anyone without a valid Sign-in gets 401, the not-authenticated message and a `WWW-Authenticate` challenge, and nothing else: no tool list, no Database contact, no Audit record (D-044) | Sign-in broker, before the MCP endpoint is reached |
| While `IDP_ISSUER`, `IDP_CLIENT_ID` or `IDP_CLIENT_SECRET` is unset, every MCP request gets the same 401, and `/authorize` answers 503 (D-017) | Sign-in broker |
| A Sign-in is valid only if it decrypts under a current key and has the right `v`, `iss` equal to `IDP_ISSUER`, `aud` equal to the request's resource URL, and `exp` in the future, with 60 seconds of clock skew allowed | Sign-in broker |
| Anyone the Identity provider authenticates may sign in (D-015). The Server keeps no list of permitted people | Identity provider |
| An ID token is accepted only with an RS256, PS256 or ES256 signature verified against the provider's published keys, `iss` and `aud` matching, an unexpired `exp`, and the `nonce` from the Authorization request | Sign-in broker |
| `/authorize` accepts only `response_type=code`, PKCE `S256`, a `redirect_uri` exactly equal to one the Client registration lists (a plain-http loopback one may differ in port only, RFC 8252, D-072), and a `resource` under this Deployment's `/mcp` | Sign-in broker |
| `/token` accepts a code or Refresh token only for the `client_id`, `redirect_uri` and `resource` it was issued for, plus a matching `code_verifier` | Sign-in broker |

### Fetches the Server makes on a caller's behalf

These carry forward the architecture's Integrations rows.

- **Client ID Metadata Document.** The `client_id` must be an `https://` URL on port 443, with a path and no fragment, userinfo or query. The fetch follows no redirects, sends no cookies or credentials, gives up after 3 seconds, and reads at most 16 KiB. The response must be `application/json`, and its `client_id` must equal the URL. On containers, the connection is refused unless every resolved address is public, checked at connect time so a DNS answer cannot change between check and use. A host written as an IP literal is checked against the same list: no loopback, RFC 1918, link-local (including 169.254.169.254), CGNAT, ULA or multicast addresses. On Workers the platform's own egress applies, and private ranges are not reachable. Any failure ends the registration with `invalid_client`, saying the document could not be fetched.
- **Identity provider.** Discovery, keys and token calls each give up after 5 seconds. Discovery and keys are cached per isolate or process for 10 minutes. A key ID not in the cache causes one refetch, at most once a minute. Any failure tells the Staff member that the Identity provider named by `IDP_ISSUER` did not answer.
- **Database.** Connecting gives up after 5 seconds. Statements get no Server-side time limit (D-003).

## What the Agent can see

| rule | enforced in |
|---|---|
| The Visible objects for a Tool call are the Allow-list, read from the Database account's grants at that moment, intersected with the Boundary (none when unset, D-075), less system schemas and tables the account owns, plus the Created objects in a Conversation token signed for this Staff member and this Deployment (ADR-006) | Visibility resolver, and the Database itself, which refuses what is not granted |
| A Tool call made while the Database account fails ADR-006's check answers 503. Sign-in, `/healthz` and metadata keep answering, and `/healthz` reports `database: unsafe` (D-077). The check per Engine is below | Visibility resolver, on every Tool call |
| Nothing the AI tool sends affects what is visible: there is no Allow-list in the URL, a header or a tool input | MCP endpoint |
| Every name the Agent receives — tool descriptions, results, Refusals, Database errors — comes from the Visibility resolver's list for that Tool call | Visibility resolver, MCP endpoint |
| A Database error's message is rebuilt from its `reason_class` and the Visible objects it names. The driver's text is never passed through, because rebuilding is easier to prove free of Hidden object names than scrubbing is (D-005) | Engine adapter |
| A Refusal for a Hidden object reads the same as one for an Object that does not exist (D-005) | Visibility resolver |
| `/healthz` reports only `ok`, `unreachable`, `invalid` or `unsafe`, never a driver message. Its health-check Server statement includes the D-077 check | Runtime adapter |

### Database account check

The check runs in the catalog Server statement on every Tool call, and in `/healthz` (D-077).

**PostgreSQL** refuses the routes D-077 and D-081 list.

**MS SQL Server** passes the account only if everything it holds is on the list below (D-122, D-123). Anything not listed refuses it, so a route nobody thought of is refused too.

**Who the account is.**
- **Its principals** are every principal in the session's own security tokens: `sys.user_token` in the database, and `sys.login_token` where the server level can be read. These include the database user, every role it reaches at any depth, `public`, and any Windows or Entra group the token carries. Role membership tables alone would miss groups.
- **The server level can be read** on any edition other than Azure SQL Database (`SERVERPROPERTY('EngineEdition') = 5`).
- **On Azure SQL Database,** where the server level cannot be read, the account must be a contained SQL-authenticated user: `authentication_type` `DATABASE` (2) in `sys.database_principals`, mapped to no login. A user mapped to a login, or an Entra user, is refused there, because its server-level roles and group memberships cannot all be seen from the database.

**What it may hold.** The account passes when all of these hold:
- **It is not `dbo`.** Its database user is not `dbo`, and none of its principals owns the database.
- **No fixed role but `public`.** Its database principals include no fixed database role other than `public`. Where the server level can be read, its server principals include no fixed or user-defined server role other than `public`.
- **It owns nothing.** None of its principals is the owner (`principal_id`, or `owning_principal_id` for principals) in any catalog of owned securables:
  - in the database: `sys.schemas`, `sys.objects`, `sys.types`, `sys.xml_schema_collections`, `sys.assemblies`, `sys.certificates`, `sys.asymmetric_keys`, `sys.symmetric_keys`, `sys.fulltext_catalogs`, `sys.fulltext_stoplists`, `sys.registered_search_property_lists`, `sys.service_contracts`, `sys.service_message_types`, `sys.services`, `sys.routes`, `sys.remote_service_bindings`, `sys.event_notifications`, `sys.database_scoped_credentials`, `sys.external_languages`, `sys.external_libraries`, `sys.external_models`, `sys.external_streams`, `sys.external_streaming_jobs` and `sys.database_principals`;
  - where the server level can be read: `sys.server_principals`, `sys.endpoints`, `sys.server_audits` and `sys.server_event_notifications`.
  Two catalogs differ by edition and are skipped where the instance lacks them, that is where `OBJECT_ID(N'sys.<view>')` is NULL: `sys.external_models`, which Azure SQL Database has and SQL Server 2022 does not, and `sys.external_languages`, the reverse. No other catalog is skipped. Any other listed catalog the instance lacks refuses the account, and so does any error while the check runs, as an unreachable Database already does, so the check fails closed. Where it is unclear whether a view's `principal_id` names an owner, as for `sys.external_streams` and `sys.external_streaming_jobs`, the view is listed, because listing one only refuses more.
  Every other view with a `principal_id` or `owning_principal_id` column names no owner of a securable the account could hold, and is not listed. Each line below gives the reason, then after its colon the views it covers:
  - not owners, as views over the objects catalog whose rows are its rows or system objects only `sys` owns, and no account is `sys`: `sys.all_objects`, `sys.system_objects`, `sys.all_views`, `sys.system_views`, `sys.views`, `sys.tables`, `sys.internal_tables`, `sys.procedures`, `sys.extended_procedures`, `sys.sequences`, `sys.synonyms`, `sys.check_constraints`, `sys.default_constraints`, `sys.edge_constraints`, `sys.foreign_keys`, `sys.key_constraints`, `sys.security_policies`, `sys.service_queues` and `sys.external_tables`;
  - not owners, as views over another listed catalog (types, endpoints, server principals, server audits, external libraries) whose rows are that catalog's entries, or rows about one whose owner that catalog already gives: `sys.table_types`, `sys.assembly_types`, `sys.database_mirroring_endpoints`, `sys.http_endpoints`, `sys.service_broker_endpoints`, `sys.soap_endpoints`, `sys.tcp_endpoints`, `sys.via_endpoints`, `sys.sql_logins`, `sys.server_file_audits`, `sys.external_libraries_installed` and `sys.external_library_setup_errors`;
  - not owners, as the deprecated name of the database-scoped credentials catalog: `sys.database_credentials`;
  - not owners, as the session's own tokens: `sys.user_token` and `sys.login_token`;
  - not owners, as mappings rather than ownership: `sys.conversation_endpoints` and `sys.server_principal_credentials`;
  - not owners, as Microsoft Purview DevOps policy assignments, which apply only to Microsoft Entra principals: `sys.devops_database_access`, `sys.devops_database_principals` and `sys.devops_principals`.
  The DevOps exclusion holds because Azure SQL Database is the one supported edition with these views (D-120) and the check refuses Entra principals there. Supporting another edition that has them reopens it.
  A securable class added in a later version is out of this list until it is added here, which is the one way ownership is not closed. The test suite reads both the listed catalogs and the not-owner lines from this document, and checks that every catalog view with a `principal_id` or `owning_principal_id` column is on exactly one of them: on SQL Server 2022, live in the test instance; on Azure SQL Database, against the 53 views measured on `mcp-test` (Q-045), stored in the repository as a fixture.
- **Its database grants are only these.** Every `GRANT` or `GRANT WITH GRANT OPTION` row held by its principals in `sys.database_permissions` is one of:
  - `CONNECT` on the database;
  - `SHOWPLAN` on the database, which the Query check's plan layer needs (ADR-005);
  - `VIEW ANY COLUMN ENCRYPTION KEY DEFINITION` or `VIEW ANY COLUMN MASTER KEY DEFINITION` on the database, which `public` holds by default;
  - `SELECT` on a schema or on any object or column (`OBJECT_OR_COLUMN`). Only user tables are Visible (data-model.md), so `SELECT` on a view, function or synonym reaches nothing more;
  - any row held by `public` on a system object (`OBJECT_OR_COLUMN` with a negative `major_id`), which every user database carries.
- **Its server grants are only these,** where the server level can be read. Every grant held by its server principals in `sys.server_permissions` is `CONNECT SQL`, `VIEW ANY DATABASE`, or `CONNECT` on an endpoint, which `public` holds by default on the TSQL endpoints.

**At higher tiers.** This list is the read-only tier's. A write tier needs `INSERT`, `UPDATE` or `DELETE` grants, and the `full` tier needs `CREATE TABLE` and a schema the account owns for its Created objects (D-076, Q-029). Each slice that adds a tier on MS SQL Server (S-010 to S-012) widens the list here for that tier only, with its tests. Until then, a Deployment above `read-only` on MS SQL Server is refused at start-up, as an invalid `PERMISSION_TIER`.

**Defaults are measured.** Before it is built, the first slice that builds this check runs it against the account a Database administrator would make, on SQL Server 2022 and on the project's Azure SQL Database (D-113). It records every row `public` holds by default. A default it finds that is not covered here is added by amendment, with its test, before the check ships. The list is widened only here. `DENY` rows never refuse the account, because they only narrow it. The data-model.md Allow-list then reads what the `SELECT` grants reach. This check supersedes the MS SQL Server routes in D-077, D-117 and D-120, every one of which also fails it.

## What it can run

| rule | enforced in |
|---|---|
| The Typed tools registered for a Deployment are exactly those its Permission tier allows. A higher tier's tool does not exist for the Agent at all (R-007) | MCP endpoint |
| A Typed tool's Statement is parameterised. Inputs never become SQL text, and identifiers are quoted by the Engine's own rules after being checked against the Visible objects | Typed tools |
| An Agent-written query passes all three layers of the Query check, or is never sent (ADR-005, D-013) | Query check |
| The Database account's grants cap everything above (D-004). The Deployment kit tells the Operator to grant no more than the tier needs | Database |

### Query check: supported constructs

ADR-005 places this list here. A construct not listed is refused.

| | PostgreSQL | MS SQL Server |
|---|---|---|
| statement | one `SELECT`, optionally under `WITH` (recursive allowed, data-modifying CTEs refused) | one `SELECT`, optionally under `WITH` |
| clauses | `FROM`, all `JOIN` kinds, `WHERE`, `GROUP BY` (with `ROLLUP`/`CUBE`/`GROUPING SETS`), `HAVING`, `WINDOW`, `ORDER BY`, `LIMIT`, `OFFSET`, `DISTINCT [ON]`, `UNION`/`INTERSECT`/`EXCEPT`, subqueries, `CASE`, casts, `VALUES`, `ARRAY[…]` and `ARRAY(subquery)` (no subscripts) | `FROM`, all `JOIN` kinds and `APPLY`, `WHERE`, `GROUP BY` (with `ROLLUP`/`CUBE`/`GROUPING SETS`), `HAVING`, `ORDER BY`, `TOP`, `OFFSET … FETCH`, `DISTINCT`, `UNION`/`INTERSECT`/`EXCEPT`, subqueries, `CASE`, `CAST`/`CONVERT`/`TRY_CAST` |
| refused | `FOR UPDATE`/`SHARE`, `INTO`, `TABLESAMPLE`, `pg_catalog` and `information_schema`, set-returning functions other than `unnest` and `generate_series` | `INTO`, table and query hints, `OPENROWSET`/`OPENQUERY`/`OPENDATASOURCE`/`OPENJSON`/`OPENXML`, `FOR XML`/`FOR JSON`, `sys` and `INFORMATION_SCHEMA`, `WAITFOR`, variables, `EXEC` |
| aggregate | `count sum avg min max string_agg array_agg bool_and bool_or stddev stddev_pop stddev_samp variance var_pop var_samp percentile_cont percentile_disc mode` | `COUNT COUNT_BIG SUM AVG MIN MAX STRING_AGG STDEV STDEVP VAR VARP` |
| window | `row_number rank dense_rank percent_rank cume_dist ntile lag lead first_value last_value nth_value` | `ROW_NUMBER RANK DENSE_RANK PERCENT_RANK CUME_DIST NTILE LAG LEAD FIRST_VALUE LAST_VALUE` |
| date/time | `now current_date current_timestamp date_trunc date_part extract age make_date make_timestamp to_char to_date to_timestamp justify_days justify_hours justify_interval` and `AT TIME ZONE`/`AT LOCAL` (`timezone`) | `GETDATE GETUTCDATE SYSDATETIME DATEADD DATEDIFF DATEDIFF_BIG DATEPART DATENAME DATEFROMPARTS DATETRUNC EOMONTH YEAR MONTH DAY` and `AT TIME ZONE` |
| text | `lower upper length char_length substring trim ltrim rtrim replace concat concat_ws left right position strpos split_part initcap lpad rpad` and the `LIKE`/`ILIKE` operators | `LOWER UPPER LEN SUBSTRING TRIM LTRIM RTRIM REPLACE CONCAT CONCAT_WS LEFT RIGHT CHARINDEX REPLICATE` and `LIKE` |
| numeric | `abs round ceil floor trunc mod power sqrt sign greatest least` | `ABS ROUND CEILING FLOOR POWER SQRT SIGN` |
| conditional | `coalesce nullif` | `COALESCE NULLIF ISNULL IIF` |

Every other function is refused, including `nextval`, `pg_sleep`, `set_config`, `current_setting`, `dblink*`, `lo_*`, `pg_read_*` and every user-defined function (D-038). A slice that needs a function not listed adds it to this table and to the Query check's tests together.

## What is logged

**Logged:** one Audit record per Tool call (data-model.md). Separately, operational lines with `"type":"op"`: configuration errors, Identity provider and metadata-fetch failures, and start-up. These name the event, the variable or host involved, and the Tool call `id` if there is one.

**Never logged, in Audit records or operational lines:**
- result rows or any value read from the Database (R-011);
- Sign-in, Refresh tokens, Authorization codes, Conversation tokens, ID tokens, the Identity provider's refresh tokens, and `Authorization` headers;
- `SERVER_SECRET`, `SERVER_SECRET_PREVIOUS`, `IDP_CLIENT_SECRET`, and the Database connection string or password;
- the driver's own error text, which can name Hidden objects (D-005);
- with Redaction on, literals in SQL and in Typed tool inputs (D-007, D-028).

**Redaction rule.** SQL is redacted by the Engine's parser: every literal becomes `?`, and identifiers and keywords stay. On PostgreSQL this uses `libpg-query`'s normalise. On MS SQL Server it uses the `node-sql-parser` AST. SQL that does not parse is logged as `<unparsed: N chars>` and nothing more. Typed tool input values become `"<redacted>"`, keys stay, and Object names stay because they are identifiers. `request_text` is never redacted (R-011).

**Outside the Server's control.** The Host platform keeps its own request logs. Workers Logs and Azure Container Apps' ingress and console logs record each request's URL, so the connector URL appears there even for blocked calls that leave no Audit record (D-056).

## Secrets

- They live only in the platform's secret store: Wrangler secrets or Azure Key Vault. They never go in `wrangler.jsonc`, the templates' defaults or the repository. `.dev.vars` is gitignored.
- **Rotating `SERVER_SECRET`.** The Operator sets the new value as `SERVER_SECRET` and the old one as `SERVER_SECRET_PREVIOUS`, then redeploys. Tokens of every kind still verify, and new ones are issued under the new key. After 30 days, the Refresh token lifetime, the Operator removes `SERVER_SECRET_PREVIOUS`. At that point, dynamic Client registrations and Conversation tokens issued before the rotation stop working: AI tools re-register by themselves, and Created objects drop out of older Conversations. The Security material says so.
- **A leaked `SERVER_SECRET`.** The Operator rotates without setting `SERVER_SECRET_PREVIOUS`. Every Staff member signs in again, and every Conversation token is void.
- `IDP_CLIENT_SECRET` and the Database password rotate at their source, followed by a redeploy. No token depends on them.
- **What a redeploy means on Azure.** Container Apps secrets belong to the app, not to a revision. Changing a Key Vault secret creates no revision, and the platform refreshes its reference on its own schedule, within 30 minutes. Every deploy of the Container App therefore forces a new revision, which reads each referenced secret again. After a rotation, the Operator confirms the new value is live by checking that:
  - the new revision is the only active one and is running;
  - `/healthz` reports `database: ok`, for a Database password;
  - a fresh Sign-in completes after the old client secret is deleted at the Identity provider, for `IDP_CLIENT_SECRET`. Entra ID keeps several client secrets valid at once, so a Sign-in before the deletion proves nothing;
  - a token issued before the rotation is refused, for a leaked `SERVER_SECRET`.
  If a check fails, the Operator restarts the active revision and checks again. If it still fails 30 minutes after the vault change, the reference is wrong, not late, and the Operator checks the secret's name and the identity's role on the vault. The Deployment kit gives these checks and steps as commands (D-121, D-123).

## Accepted threats

- D-051: an Authorization code can be replayed within its 60 seconds, and Refresh tokens and dynamic Client registrations cannot be revoked one at a time. These follow from having no store (ADR-004).
- D-056: the platform's own request logs hold connector URLs.
- D-057: the Server applies no rate limit. A flood of unauthenticated calls, or of `/register` and metadata fetches, costs the Operator compute but stores nothing and reaches no Database.
- Already on record: results reach the AI provider (D-036), and Request text cannot be verified (ADR-011).

Amended 2026-11-08 by D-135, answering Q-045: the MS SQL Server ownership list gains the owner views measured on SQL Server 2022 and on Azure SQL Database `mcp-test`, skips only its two edition-specific catalogs where the instance lacks them and otherwise fails closed, and names the views it leaves out with their reasons.

Amended 2026-11-07 by D-121, D-122 and D-123, answering Q-041: MS SQL Server's Database account check is a closed list, for the read-only tier. Its principals come from the session's tokens, and on Azure SQL Database it requires a contained SQL-authenticated user. On Azure, a deploy forces a new revision, and the Operator confirms a rotated secret is live. The container fetch guard covers IP-literal hosts.

Amended 2026-10-25 by D-084: `AT TIME ZONE` on both Engines, plus `AT LOCAL` and the array constructors on PostgreSQL, join the supported constructs. Other wording owed to S-002 and S-003 waits for the next revision (Q-030, Q-033).

## Critique findings

System-spec part of the 2026-10-25 amendment review for D-084 and D-085, by a fresh critic. Verdict: hold (0 blockers, 1 gap, 0 nits) for the system-spec amendment. For the slice backlog's re-approval: pass (0 blockers, 0 gaps, 0 nits), because no slice line becomes wrong or incomplete. The `reg*`-inside-composite blocker found in the same gate is recorded in the S-003 spec. The line saying every user-defined function is refused (D-038) is out of date under D-083 and D-085, but that wording is deferred on the record (Q-033, fifth bullet), so it is not a finding here.

- **gap — the MS SQL Server parser named here cannot parse `AT TIME ZONE`.** The Redaction rule and ADR-005 name `node-sql-parser`'s AST for MS SQL Server. Verified with `node-sql-parser` 5.4.0 (`database: 'transactsql'`): `SELECT o.created_at AT TIME ZONE 'South Africa Standard Time' FROM s.o AS o` fails to parse, because `AT` is read as an alias and the parser then stops at `TIME`. The same happens with a `CAST(… AS datetimeoffset)` operand. S-007's Query check would refuse a construct this table says is supported, and redaction would log it as `<unparsed>`. S-007's slice-spec will find this out mid-build. It should be raised as a Q-### now: a different parser, a pre-parse rewrite, or removing the MS SQL Server entry. T-SQL also takes Windows time-zone names, not IANA names, which S-004's and S-008's benchmark questions should allow for.

Resolution, 2026-10-25: raised as Q-035, which blocks S-007's slice-spec. The MS SQL Server entry stays until S-007 settles it.

Amendment review of 2026-11-07 (D-121, D-122), by a fresh critic. Verdict: fail (4 blockers, 4 gaps, 3 nits).
- **blocker:** the closed list left out `SHOWPLAN`, which ADR-005's plan layer needs on MS SQL Server.
- **blocker:** the list refused every write tier and Created objects (D-076, S-010 to S-012, Q-029), with no deferral.
- **blocker:** the principal set missed Entra groups, which appear only in the session's token, and login-mapped users' server roles on Azure SQL Database.
- **blocker:** the server list refused `public`'s default `CONNECT` on endpoints, so every account on SQL Server 2022 would fail.
- **gap:** `public`'s defaults were unmeasured, and "a table" did not say whether views and synonyms count.
- **gap:** the ownership bullet named eight classes, so it was a deny-list inside the allow-list.
- **gap:** the rotation check could pass while the old client secret stayed valid, and gave no step after a failed check.
- **gap:** serverless auto-pause against the 5-second connect limit was neither stated nor deferred.
- **nits:** data-model.md had no amendment note; "D-081's MS SQL Server lists" pointed at the wrong decision; lengths are in characters, not bytes.

Revision, 2026-11-07 (D-123):
- principals come from the session's tokens, and only a contained SQL-authenticated user passes on Azure SQL Database;
- `SHOWPLAN`, endpoint `CONNECT`, `public`'s system-object rows and `SELECT` on any object are on the list;
- ownership is checked in every owned-securable catalog;
- the list is the read-only tier's, and each write slice widens it for its own tier;
- defaults are measured before the check ships;
- the rotation check deletes the old secret first, and gives the steps after a failed check;
- serverless is supported, and its cost is stated;
- the nits are fixed.
