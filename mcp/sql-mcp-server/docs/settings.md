# Settings

Every setting a Deployment reads, the limits it holds to, what to watch once it runs, and how to rotate its secrets. [deploy/cloudflare/guide.md](../deploy/cloudflare/guide.md) says when and how to set each one on Cloudflare. The container image `ghcr.io/prinsloopower/sql-mcp`, which serves MS SQL Server, reads them from its environment, for example from `docker run --env-file`.

## Variables

The Server settings are `ENGINE`, `HYPERDRIVE` or `DATABASE_URL`, `IDP_*`, `PERMISSION_TIER`, `REDACTION`, `ROW_LIMIT` and `BOUNDARY`. The rest are deployment configuration. A Worker reads them all once per isolate, on its first request, and the container reads them once, at process start. Every value is trimmed. An invalid value makes every MCP request answer 503 "Deployment misconfigured: <variable>", and `/healthz` reports `config: invalid` with the variable's name, never its value.

The container also requires `ENGINE=mssql`, a `DATABASE_URL` that parses as an ADO connection string naming a server and a database, and `PUBLIC_URL`, and answers the same 503 naming the first one missing or invalid. When a setting shared with Workers is also invalid, that one is named instead. On MS SQL Server, `read-only` is the only Permission tier, and any other `PERMISSION_TIER` answers the 503 too. A `PORT` that is not an integer from 1 to 65535 leaves nothing to answer on, so the container writes one `config_invalid` line naming `PORT` and exits.

The connection `DATABASE_URL` makes is always encrypted, and the Database server's certificate is always checked against the CAs Node trusts. `Encrypt` may be unset or `true`, `yes`, `mandatory` or `strict`, matched without regard to case, so the Azure portal's `Encrypt=True;TrustServerCertificate=False` works. Any other `Encrypt`, `Encrypt=false` among them, and `TrustServerCertificate=true` answer 503 naming `DATABASE_URL`. A Database server whose certificate a private CA signed is trusted by mounting that CA's certificate into the container and naming the file in `NODE_EXTRA_CA_CERTS`.

| variable | purpose | example | secret | source |
|---|---|---|---|---|
| ENGINE | which Engine the Database runs; must match the runtime | `postgres` on Workers, `mssql` in the container | no | the shared Wrangler settings; the container's environment |
| HYPERDRIVE | Hyperdrive binding to the Database | binding to a Hyperdrive config | the binding no; the connection string inside it yes | made by `npm run setup`. Locally, `wrangler dev` uses the binding's `localConnectionString` instead |
| DATABASE_URL | MS SQL Server connection string in ADO form, for a contained SQL-authenticated user in an Azure SQL Database; required by the container. The Server's 5-second connect limit overrides any `Connect Timeout` in it | `Server=tcp:sales.database.windows.net,1433;Database=sales;User Id=sqlmcp;Password=…;Encrypt=true` | yes | the container's environment, from a secret store |
| VERSION_METADATA | the deployed Worker version's id, which `initialize` adds to the package version (Workers only). The container reports the package version alone | binding | no | `version_metadata` in `wrangler.jsonc` |
| IDP_ISSUER | the Identity provider's issuer URL; its `/.well-known/openid-configuration` is fetched | `https://login.microsoftonline.com/<tenant>/v2.0` | no | Wrangler `vars` |
| IDP_CLIENT_ID | the Server's OpenID Connect client ID at the Identity provider | `6f1c…` | no | the Operator's app registration at the Identity provider |
| IDP_CLIENT_SECRET | that client's secret | `…` | yes | `wrangler secret put` (`npm run setup -- signin` does this) |
| IDP_SCOPES | scopes requested from the Identity provider | `openid profile email offline_access` (default) | no | optional; Wrangler `vars` |
| PERMISSION_TIER | Permission tier | `read-only` (default, and the only tier this release has) | no | Wrangler `vars`; the container's environment |
| ROW_LIMIT | Row limit | `500` (default); 1–10,000 | no | Wrangler `vars` |
| REDACTION | Redaction | `on` (default) \| `off` | no | Wrangler `vars` |
| BOUNDARY | Boundary, as JSON: schemas included, then tables excluded within them; only narrows what the Database account is granted | `{"schemas":["sales","finance"],"exclude":[["finance","payroll"]]}`; unset means no exclusion: the Database account's grants alone decide | no | Wrangler `vars` |
| SERVER_SECRET | the deployment secret every key derives from | 43-character base64url string (32 random bytes) | yes | `wrangler secret put` (`npm run setup` makes it) |
| SERVER_SECRET_PREVIOUS | the secret before the last rotation; accepted for verifying, never for issuing | as above | yes | `wrangler secret put`; optional; removed when rotation ends |
| PUBLIC_URL | the Deployment's external origin, used in resource identifiers and metadata; required by the container, where a proxy sits in front | `https://sql.example.com` | no | the container's environment; optional on Workers, which use the request's origin |
| PORT | port the container listens on | `8080` (default) | no | the container's environment |

The Database account named by `HYPERDRIVE` or `DATABASE_URL` is dedicated to the Server. The Database administrator grants it SELECT on exactly the tables and columns the Agent may read, and that grant is the Allow-list. While the account bypasses grants, every Tool call answers 503.

No variable widens a Server setting from the request side.

## Limits

| limit | value | on breach |
|---|---|---|
| MCP request body | 1 MiB, enforced in the shared app on both runtimes, counted as the body streams whatever `Content-Length` says | 413, before parsing |
| `request_text` | 1–4,000 characters | Refusal, `invalid_input` |
| Agent-written query text | 64 KiB | Refusal, `query_check` |
| Row limit | 1–10,000; default 500 | configuration error |
| Audit record line | 64 KiB | the longest SQL strings are cut, and `shortened` is set |
| Identity provider call | 5 s | Sign-in fails, naming the provider |
| Client ID Metadata Document fetch | 3 s; 16 KiB | registration fails, `invalid_client` |
| Database connect | 5 s | Database error, `connection` |
| Statement execution | none from the Server. The Database's own settings apply, such as a `statement_timeout` set on the Database account, and on Workers, Cloudflare's limits: Workers allow 30 s of CPU per request by default, though waiting on the Database is not CPU time | Database error, `timeout`, or a dropped connection the AI tool reports |
| Rate | none | — |

## Monitoring

Nothing in the Server pages anyone. Alerting is the Host platform's job, configured by the Operator. Audit records are never an alert's payload; alerts carry counts only. The guide's section 8 says where to watch each signal on Cloudflare.

| signal | source | a human is called when |
|---|---|---|
| `/healthz` | an external monitor the Operator chooses, since Cloudflare cannot probe a Worker | 3 failures in a row (90 s) |
| Database errors | Audit records with `outcome.kind = "database_error"` and `reason_class` `connection` or `timeout` | more than 10 within 5 minutes |
| Identity provider failures | operational lines with event `idp_unreachable` or `idp_invalid_response` | more than 5 within 5 minutes |
| Server faults | operational lines with event `signin_error` or `server_fault` | any |
| configuration errors | operational lines with event `config_invalid` | any |
| 5xx responses | the platform's request metrics | Cloudflare: more than 1% of requests over 15 minutes, with at least 20 requests. Azure: more than 1 in 15 minutes, because a metric alert cannot express a share |

## Rotating secrets

- **`SERVER_SECRET`.** Set the new value as `SERVER_SECRET` and the old one as `SERVER_SECRET_PREVIOUS`, then redeploy. Every token still verifies, and new ones are issued under the new key. After 30 days, the longest a Refresh token lasts, remove `SERVER_SECRET_PREVIOUS`. AI tools' client registrations and Conversation tokens issued before the rotation then stop working: AI tools register again by themselves, and Created objects drop out of older Conversations. A Deployment made by `npm run setup` has no copy of its old value, so its rotation signs every Staff member out, as for a leaked secret (guide section 8).
- **A leaked `SERVER_SECRET`.** Rotate without setting `SERVER_SECRET_PREVIOUS`. Every Staff member signs in again, and every Conversation token is void.
- **`IDP_CLIENT_SECRET` and the Database account's password** rotate at their source. On Cloudflare, `npm run setup -- signin` and `npm run setup -- password` carry the new value to the Deployment. No token depends on them.
