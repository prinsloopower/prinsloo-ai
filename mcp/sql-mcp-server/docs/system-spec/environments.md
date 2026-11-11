# Environments — sql-mcp-server

## Environments

| environment | what it is | who runs it | Database |
|---|---|---|---|
| local | `wrangler dev` (Worker) or `node dist/server.js` (container image code) on a developer's machine | a developer | PostgreSQL 17 from `test/docker-compose.yml` on port 55432; MS SQL Server 2022 from the same file once step 5 adds it |
| ci | Vitest, with the Docker Compose engines (ADR-010) | the repository's CI | as local |
| project test Deployment (PostgreSQL) | `https://sql-mcp-server.prinsloopower.workers.dev`, the Cloudflare Worker that the release test harness runs against | the project | the AI Golf App Supabase project, schema `sqlmcp_test` (D-049, D-060) |
| project test Deployment (MS SQL Server) | an Azure Container App in resource group `ai-dev` (Central US), subscription `f3773fcf-7f0c-445f-9184-b50b3e74a99c`, added by the MS SQL Server slices | the project | Azure SQL Database `mcp-test` on `prinslooai.database.windows.net`, schema `sqlmcp_test`, read as the contained user `sqlmcp_reader` (D-065, D-113) |
| Operator Deployment | a public Deployment in an adopting organisation's cloud: a Cloudflare Worker for PostgreSQL, or an Azure Container App for MS SQL Server (D-063, D-064) | an Operator | the organisation's own: PostgreSQL on Supabase, or Azure SQL Database. SQL Server on a VM or on-premises waits for private networking, because Container Apps have no fixed outbound address (D-120) |

The project test Deployment and every other test needing a reachable PostgreSQL use the AI Golf App Supabase project (D-060). Test objects live in their own schema, `sqlmcp_test`, which is the only schema in that Deployment's Boundary.

## Variables

The Server settings are `ENGINE`, `DATABASE_URL`/`HYPERDRIVE`, `IDP_*`, `PERMISSION_TIER`, `REDACTION`, `ROW_LIMIT` and `BOUNDARY`. The rest are deployment configuration that the Operator also owns but that decides no behaviour a Staff member sees (D-054). All of them are read once per Worker isolate, on its first request, and at process start on containers (D-070). Every value is trimmed. An invalid value makes every MCP request answer 503 "Deployment misconfigured: <variable>", and `/healthz` reports `config: invalid` with the variable's name, never its value. On containers, the runtime adapter also requires `ENGINE=mssql`, a `DATABASE_URL` that parses, and `PUBLIC_URL`, and reports a missing one the same way. A failure among the shared settings is named first (D-117).

| variable | purpose | example | secret | source |
|---|---|---|---|---|
| ENGINE | which Engine the Database runs; must match the runtime (D-063) | `postgres` on Workers, `mssql` on Azure | no | Wrangler `vars`; Bicep parameter |
| HYPERDRIVE | Hyperdrive binding to the Database (Cloudflare only) | binding to config `eb6eadef…` | the binding no; the connection string inside it yes | `wrangler hyperdrive create`, then `hyperdrive` in `wrangler.jsonc`. Locally, `wrangler dev` uses that block's `localConnectionString` (the Docker Database on port 55432) and never the remote Database |
| DATABASE_URL | MS SQL Server connection string (Azure only), in ADO form, for a contained SQL-authenticated user in an Azure SQL Database (security.md). The adapter's 5-second connect limit overrides any `Connect Timeout` in it. Every service tier is supported. On a serverless database with auto-pause, the first connection after a pause can take longer than 5 seconds, so that Tool call ends as a Database error of class `connection` and the next one succeeds. One such error stays under the Database-errors alert's threshold. The Deployment kit says so, and suggests turning auto-pause off where that matters (D-123) | `Server=tcp:sales.database.windows.net,1433;Database=sales;User Id=sqlmcp;Password=…;Encrypt=true` | yes | Azure Key Vault, as a Key Vault reference in the Container App (stage 2) |
| VERSION_METADATA | the deployed Worker version's id, which `initialize` adds to the package version (Cloudflare only). Containers report the package version alone (D-114) | binding | no | `version_metadata` in `wrangler.jsonc` |
| IDP_ISSUER | the Identity provider's issuer URL; its `/.well-known/openid-configuration` is fetched | `https://login.microsoftonline.com/<tenant>/v2.0` | no | Wrangler `vars`; template parameter |
| IDP_CLIENT_ID | the Server's OpenID Connect client ID at the Identity provider | `6f1c…` | no | the Operator's app registration at the Identity provider |
| IDP_CLIENT_SECRET | that client's secret | `…` | yes | `wrangler secret put`; Azure Key Vault |
| IDP_SCOPES | scopes requested from the Identity provider | `openid profile email offline_access` (default) | no | optional; Wrangler `vars`; template parameter. Some providers, Google among them, issue refresh tokens through an `access_type=offline` request parameter rather than the `offline_access` scope. The Sign-in slice checks this against its Google test client |
| PERMISSION_TIER | Permission tier | `read-only` (default, D-019) \| `read-write` \| `read-write-delete` \| `full` | no | Wrangler `vars`; template parameter |
| ROW_LIMIT | Row limit | `500` (default); 1–10,000 | no | Wrangler `vars`; template parameter |
| REDACTION | Redaction | `on` (default, D-007) \| `off` | no | Wrangler `vars`; template parameter |
| BOUNDARY | Boundary, as JSON: schemas included, then tables excluded within them; only narrows what the Database account is granted | `{"schemas":["sales","finance"],"exclude":[["finance","payroll"]]}`; unset means no exclusion: the Database account's grants alone decide (D-074) | no | Wrangler `vars`; template parameter |
| SERVER_SECRET | the deployment secret every key derives from (data-model.md) | 43-character base64url string (32 random bytes) | yes | generated by the Operator (`openssl rand -base64 32 \| tr '+/' '-_' \| tr -d '='`), then `wrangler secret put` or Azure Key Vault |
| SERVER_SECRET_PREVIOUS | the secret before the last rotation; accepted for verifying, never for issuing | as above | yes | as above; optional; removed when rotation ends (security.md) |
| PUBLIC_URL | the Deployment's external origin, used in resource identifiers and metadata | `https://sql.example.com` | no | on Azure, stage 1's optional `publicUrl` parameter for a custom domain, otherwise computed as `https://<app name>.<environment default domain>`, and set on the Container App by stage 2 (D-117). Required by the container at run time, where a proxy sits in front; optional on Workers, which use the request's origin |
| PORT | port the container listens on | `8080` (default) | no | the template |

The Database account named by `HYPERDRIVE` or `DATABASE_URL` is dedicated to the Server. The Database administrator grants it SELECT on exactly the tables and columns the Agent may read, and that grant is the Allow-list (D-074). While the account fails ADR-006's check, every Tool call answers 503 (D-077). The project test Database uses a dedicated role, `sqlmcp_reader`, never Supabase's `postgres` (D-077).

Never set in any environment: a variable that widens a Server setting from the request side, because none exists (R-017). `.dev.vars`, the local secrets file, is gitignored.

Amended 2026-11-07 by D-113, D-114, D-117 and D-120:
- the MS SQL Server test Deployment's resources;
- Azure SQL Database as the only MS SQL Server target;
- the container adapter's required variables;
- trimming;
- `DATABASE_URL`'s connect limit;
- `PUBLIC_URL`'s source on Azure;
- the `VERSION_METADATA` binding.

## From a clean checkout to a running system

Local, against Docker PostgreSQL:

```
git clone <repo> && cd mcp/sql-mcp-server
npm ci
npm run db:up                          # PostgreSQL 17 on localhost:55432
npm test                               # unit, MCP-in-workerd, PostgreSQL integration
cp .dev.vars.example .dev.vars         # then fill SERVER_SECRET and the IDP_* values
npm run dev                            # wrangler dev on http://localhost:8787
npm run smoke -- http://localhost:8787
```

The project test Deployment, given a Cloudflare account:

```
npx wrangler login
npx wrangler hyperdrive create <name> --connection-string="<session-pooler URI>"   # put the ID in wrangler.jsonc
npx wrangler secret put SERVER_SECRET
npm run deploy
npm run smoke -- https://<worker>.workers.dev
```

Status: nobody has run either sequence from a clean checkout. The deploy steps were run once, in the developer's working tree, on 2026-10-17 (skeleton.md), when `SERVER_SECRET` and the `IDP_*` variables did not exist yet. `.dev.vars.example` does not exist either: the Sign-in slice adds it, with every variable above listed and the secrets left blank. That slice's done-condition includes one run of the local sequence from a fresh clone (D-059).
