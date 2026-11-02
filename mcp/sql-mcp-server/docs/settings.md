# Settings

Every setting a Deployment reads, what to watch once it runs, and how to rotate its secrets. [deploy/cloudflare/guide.md](../deploy/cloudflare/guide.md) says when and how to set each one on Cloudflare.

## Variables

The Server settings are `ENGINE`, `DATABASE_URL`/`HYPERDRIVE`, `IDP_*`, `PERMISSION_TIER`, `REDACTION`, `ROW_LIMIT` and `BOUNDARY`. The rest are deployment configuration. All are read once per Worker isolate, on its first request, and at process start on containers. An invalid value makes every MCP request answer 503 "Deployment misconfigured: <variable>", and `/healthz` reports `config: invalid` with the variable's name, never its value.

| variable | purpose | example | secret | source |
|---|---|---|---|---|
| ENGINE | which Engine the Database runs; must match the runtime | `postgres` on Workers, `mssql` on Azure | no | Wrangler `vars`; Bicep parameter |
| HYPERDRIVE | Hyperdrive binding to the Database (Cloudflare only) | binding to a Hyperdrive config | the binding no; the connection string inside it yes | made by `npm run setup`. Locally, `wrangler dev` uses the binding's `localConnectionString` instead |
| DATABASE_URL | MS SQL Server connection string (Azure only) | `Server=tcp:sales.database.windows.net,1433;Database=sales;User Id=sqlmcp;Password=…;Encrypt=true` | yes | Azure Key Vault |
| IDP_ISSUER | the Identity provider's issuer URL; its `/.well-known/openid-configuration` is fetched | `https://login.microsoftonline.com/<tenant>/v2.0` | no | Wrangler `vars` |
| IDP_CLIENT_ID | the Server's OpenID Connect client ID at the Identity provider | `6f1c…` | no | the Operator's app registration at the Identity provider |
| IDP_CLIENT_SECRET | that client's secret | `…` | yes | `wrangler secret put` (`npm run setup -- signin` does this) |
| IDP_SCOPES | scopes requested from the Identity provider | `openid profile email offline_access` (default) | no | optional; Wrangler `vars` |
| PERMISSION_TIER | Permission tier | `read-only` (default, and the only tier this release has) | no | Wrangler `vars` |
| ROW_LIMIT | Row limit | `500` (default); 1–10,000 | no | Wrangler `vars` |
| REDACTION | Redaction | `on` (default) \| `off` | no | Wrangler `vars` |
| BOUNDARY | Boundary, as JSON: schemas included, then tables excluded within them; only narrows what the Database account is granted | `{"schemas":["sales","finance"],"exclude":[["finance","payroll"]]}`; unset means no exclusion: the Database account's grants alone decide | no | Wrangler `vars` |
| SERVER_SECRET | the deployment secret every key derives from | 43-character base64url string (32 random bytes) | yes | `wrangler secret put` (`npm run setup` makes it) |
| SERVER_SECRET_PREVIOUS | the secret before the last rotation; accepted for verifying, never for issuing | as above | yes | `wrangler secret put`; optional; removed when rotation ends |
| PUBLIC_URL | the Deployment's external origin, used in resource identifiers and metadata | `https://sql.example.com` | no | optional on Workers, which use the request's origin; required on containers |
| PORT | port the container listens on | `8080` (default) | no | the container template |

The Database account named by `HYPERDRIVE` or `DATABASE_URL` is dedicated to the Server. The Database administrator grants it SELECT on exactly the tables and columns the Agent may read, and that grant is the Allow-list. While the account bypasses grants, every Tool call answers 503.

No variable widens a Server setting from the request side.

## Monitoring

Nothing in the Server pages anyone. Alerting is the Host platform's job, configured by the Operator. Audit records are never an alert's payload; alerts carry counts only. The guide's section 8 says where to watch each signal on Cloudflare.

| signal | source | a human is called when |
|---|---|---|
| `/healthz` | the platform's health check: Container Apps probe every 30 s; on Cloudflare, an external monitor the Operator chooses | 3 failures in a row (90 s) |
| Database errors | Audit records with `outcome.kind = "database_error"` and `reason_class` `connection` or `timeout` | more than 10 within 5 minutes |
| Identity provider failures | operational lines with event `idp_unreachable` or `idp_invalid_response` | more than 5 within 5 minutes |
| Server faults | operational lines with event `signin_error` or `server_fault` | any |
| configuration errors | operational lines with event `config_invalid` | any |
| 5xx responses | the platform's request metrics | more than 1% of requests over 15 minutes, with at least 20 requests |

## Rotating secrets

- **`SERVER_SECRET`.** Set the new value as `SERVER_SECRET` and the old one as `SERVER_SECRET_PREVIOUS`, then redeploy. Tokens of every kind still verify, and new ones are issued under the new key. After 30 days, the Refresh token lifetime, remove `SERVER_SECRET_PREVIOUS`. Then dynamic Client registrations and Conversation tokens issued before the rotation stop working: AI tools re-register by themselves, and Created objects drop out of older Conversations. A Deployment made by `npm run setup` has no copy of its old value, so its rotation signs every Staff member out, as for a leaked secret (guide section 8).
- **A leaked `SERVER_SECRET`.** Rotate without setting `SERVER_SECRET_PREVIOUS`. Every Staff member signs in again, and every Conversation token is void.
- **`IDP_CLIENT_SECRET` and the Database account's password** rotate at their source. On Cloudflare, `npm run setup -- signin` and `npm run setup -- password` carry the new value to the Deployment. No token depends on them.
