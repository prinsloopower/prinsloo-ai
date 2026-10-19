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
| `/authorize` accepts only `response_type=code`, PKCE `S256`, a `redirect_uri` exactly equal to one the Client registration lists, and a `resource` under this Deployment's `/mcp` | Sign-in broker |
| `/token` accepts a code or Refresh token only for the `client_id`, `redirect_uri` and `resource` it was issued for, plus a matching `code_verifier` | Sign-in broker |

### Fetches the Server makes on a caller's behalf

These carry forward the architecture's Integrations rows.

- **Client ID Metadata Document.** The `client_id` must be an `https://` URL on port 443, with a path and no fragment, userinfo or query. The fetch follows no redirects, sends no cookies or credentials, gives up after 3 seconds, and reads at most 16 KiB. The response must be `application/json`, and its `client_id` must equal the URL. On containers, the connection is refused unless every resolved address is public, checked at connect time so a DNS answer cannot change between check and use: no loopback, RFC 1918, link-local (including 169.254.169.254), CGNAT, ULA or multicast addresses. On Workers the platform's own egress applies, and private ranges are not reachable. Any failure ends the registration with `invalid_client`, saying the document could not be fetched.
- **Identity provider.** Discovery, keys and token calls each give up after 5 seconds. Discovery and keys are cached per isolate or process for 10 minutes. A key ID not in the cache causes one refetch, at most once a minute. Any failure tells the Staff member that the Identity provider named by `IDP_ISSUER` did not answer.
- **Database.** Connecting gives up after 5 seconds. Statements get no Server-side time limit (D-003).

## What the Agent can see

| rule | enforced in |
|---|---|
| The Visible objects for a Tool call are the Boundary intersected with that call's Allow-list, plus the Created objects in a Conversation token signed for this Staff member and this Deployment | Visibility resolver |
| Every name the Agent receives — tool descriptions, results, Refusals, Database errors — comes from the Visibility resolver's list for that Tool call | Visibility resolver, MCP endpoint |
| A Database error's message is rebuilt from its `reason_class` and the Visible objects it names. The driver's text is never passed through, because rebuilding is easier to prove free of Hidden object names than scrubbing is (D-005) | Engine adapter |
| A Refusal for a Hidden object reads the same as one for an Object that does not exist (D-005) | Visibility resolver |
| `/healthz` reports only `ok`, `unreachable` or `invalid`, never a driver message (skeleton) | Runtime adapter |

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
| clauses | `FROM`, all `JOIN` kinds, `WHERE`, `GROUP BY` (with `ROLLUP`/`CUBE`/`GROUPING SETS`), `HAVING`, `WINDOW`, `ORDER BY`, `LIMIT`, `OFFSET`, `DISTINCT [ON]`, `UNION`/`INTERSECT`/`EXCEPT`, subqueries, `CASE`, casts, `VALUES` | `FROM`, all `JOIN` kinds and `APPLY`, `WHERE`, `GROUP BY` (with `ROLLUP`/`CUBE`/`GROUPING SETS`), `HAVING`, `ORDER BY`, `TOP`, `OFFSET … FETCH`, `DISTINCT`, `UNION`/`INTERSECT`/`EXCEPT`, subqueries, `CASE`, `CAST`/`CONVERT`/`TRY_CAST` |
| refused | `FOR UPDATE`/`SHARE`, `INTO`, `TABLESAMPLE`, `pg_catalog` and `information_schema`, set-returning functions other than `unnest` and `generate_series` | `INTO`, table and query hints, `OPENROWSET`/`OPENQUERY`/`OPENDATASOURCE`/`OPENJSON`/`OPENXML`, `FOR XML`/`FOR JSON`, `sys` and `INFORMATION_SCHEMA`, `WAITFOR`, variables, `EXEC` |
| aggregate | `count sum avg min max string_agg array_agg bool_and bool_or stddev stddev_pop stddev_samp variance var_pop var_samp percentile_cont percentile_disc mode` | `COUNT COUNT_BIG SUM AVG MIN MAX STRING_AGG STDEV STDEVP VAR VARP` |
| window | `row_number rank dense_rank percent_rank cume_dist ntile lag lead first_value last_value nth_value` | `ROW_NUMBER RANK DENSE_RANK PERCENT_RANK CUME_DIST NTILE LAG LEAD FIRST_VALUE LAST_VALUE` |
| date/time | `now current_date current_timestamp date_trunc date_part extract age make_date make_timestamp to_char to_date to_timestamp justify_days justify_hours justify_interval` | `GETDATE GETUTCDATE SYSDATETIME DATEADD DATEDIFF DATEDIFF_BIG DATEPART DATENAME DATEFROMPARTS DATETRUNC EOMONTH YEAR MONTH DAY` |
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
- the decoded Allow-list. Only its hash is logged;
- with Redaction on, literals in SQL and in Typed tool inputs (D-007, D-028).

**Redaction rule.** SQL is redacted by the Engine's parser: every literal becomes `?`, and identifiers and keywords stay. On PostgreSQL this uses `libpg-query`'s normalise. On MS SQL Server it uses the `node-sql-parser` AST. SQL that does not parse is logged as `<unparsed: N chars>` and nothing more. Typed tool input values become `"<redacted>"`, keys stay, and Object names stay because they are identifiers. `request_text` is never redacted (R-011).

**Outside the Server's control.** The Host platform keeps its own request logs. Workers Logs and Azure Container Apps' ingress and console logs record each request's URL, so the connector URL, Allow-list segment included, appears there even for blocked calls that leave no Audit record (D-056).

## Secrets

- They live only in the platform's secret store: Wrangler secrets or Azure Key Vault. They never go in `wrangler.jsonc`, the templates' defaults or the repository. `.dev.vars` is gitignored.
- **Rotating `SERVER_SECRET`.** The Operator sets the new value as `SERVER_SECRET` and the old one as `SERVER_SECRET_PREVIOUS`, then redeploys. Tokens of every kind still verify, and new ones are issued under the new key. After 30 days, the Refresh token lifetime, the Operator removes `SERVER_SECRET_PREVIOUS`. At that point, dynamic Client registrations and Conversation tokens issued before the rotation stop working: AI tools re-register by themselves, and Created objects drop out of older Conversations. The Security material says so.
- **A leaked `SERVER_SECRET`.** The Operator rotates without setting `SERVER_SECRET_PREVIOUS`. Every Staff member signs in again, and every Conversation token is void.
- `IDP_CLIENT_SECRET` and the Database password rotate at their source, followed by a redeploy. No token depends on them.

## Accepted threats

- D-051: an Authorization code can be replayed within its 60 seconds, and Refresh tokens and dynamic Client registrations cannot be revoked one at a time. These follow from having no store (ADR-004).
- D-056: the platform's own request logs hold connector URLs.
- D-057: the Server applies no rate limit. A flood of unauthenticated calls, or of `/register` and metadata fetches, costs the Operator compute but stores nothing and reaches no Database.
- Already on record: results reach the AI provider (D-036), and Request text cannot be verified (ADR-011).
