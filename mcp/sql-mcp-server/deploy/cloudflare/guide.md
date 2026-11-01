# Deploying sql-mcp-server on Cloudflare

This guide takes you from a fresh clone to a Deployment that Staff members use from Claude or ChatGPT. It serves PostgreSQL on Supabase, through a Cloudflare Worker and Hyperdrive. It is public and read-only.

Sections 1 to 4 are the part that should take under an hour: the Deployment is deployed, connects to your Database and answers on the internet, and refuses every Tool call until Sign-in is set up. Sections 5 to 7 set up Sign-in, make data visible and connect Staff members. Section 8 is for running the Deployment afterwards, and section 9 for when something fails.

The Server settings are explained in [docs/system-spec/environments.md](../../docs/system-spec/environments.md). This guide says when and how to set them.

## 1. Before you start

Have these to hand:
- a Cloudflare account. You will sign Wrangler in to it;
- a Supabase project holding the Database Staff members will ask about, and its `postgres` password for the SQL editor;
- Node 24 or later, and git;
- for Sign-in (section 5), rights to register an application in your organisation's Entra ID.

**Which Workers plan.** Workers Free runs the Server and is enough to try it. Use Workers Paid for real use. Free limits CPU time per request and requests per day, and a busy Deployment will meet those limits.

**Audit record retention.** Every Tool call writes an Audit record to Workers Logs, which keeps it 3 days on Free and 7 on Paid. That period cannot be changed, and the records cannot leave Cloudflare while staying on the Host. If your policy needs Audit records kept longer, this Deployment cannot meet it: stop here.

Then get the code:

```
git clone https://github.com/prinsloopower/prinsloo-ai.git
cd prinsloo-ai/mcp/sql-mcp-server
npm ci
npx wrangler login
```

## 2. The Database account

The Server connects as a Database account of its own: a PostgreSQL role used by this Deployment and nothing else.
- **Its grants are the Allow-list.** The Agent sees exactly the tables and columns the Database administrator grants this role, and nothing else (section 6).
- **It must not bypass grants.** Supabase's `postgres` role does, so the Server refuses it, and so does setup. So does any role with `BYPASSRLS` or membership of `pg_read_all_data`. With such an account, every Tool call answers "Deployment misconfigured" and `/healthz` reports `database: unsafe`.

You do not write this role's SQL yourself. In section 3, `npm run setup` makes the role's password, which you never see. It prints SQL that creates the role with only a SCRAM verifier of that password, so the password itself never reaches Supabase. Run that SQL as `postgres` in the Supabase SQL editor when setup asks.

The SQL ends with a listing of every table and column the new role can already read, with no Boundary.
- **Expect no rows.** A new role has no grants.
- **If rows appear,** something in your Database is granted to `PUBLIC`, which every role inherits: Supabase itself, or an extension. When setup then asks for the Boundary, name the schemas that hold your own data, so nothing else is visible.

Setup marks the role it creates with a comment naming this Deployment. Run again, for a rerun or a new password, the same SQL gives that role a new password. It refuses any other role of that name, which another Deployment may be using: choose another name.

## 3. Setup

Run:

```
npm run setup
```

It asks:

| question | becomes |
|---|---|
| Worker name | the Worker's name, its hostname `https://<worker>.<your subdomain>.workers.dev`, and its Hyperdrive config's name |
| Supabase session pooler host and port | where Hyperdrive connects. In Supabase, open **Connect**, then **Session pooler**: the host looks like `aws-0-us-east-2.pooler.supabase.com`, port `5432` |
| database name | usually `postgres` |
| Supabase project ref | the id in your project's URL. The pooler's user name is `<role>.<project ref>` |
| Database account | the new role's name, such as `sqlmcp_reader` |
| schemas in the Boundary | the Boundary (`BOUNDARY`). Blank means none, so the grants alone decide. Name your schemas if section 2's listing showed rows |
| Row limit | the Row limit (`ROW_LIMIT`), 500 unless you choose otherwise |
| Cloudflare account | asked only if Wrangler's Cloudflare login reaches more than one |

Then it works through these steps, stopping at the first failure with what failed and what to do. Rerunning `npm run setup` with the same Worker name resumes where it stopped.
1. **Uses Wrangler's Cloudflare login.** It runs `wrangler whoami --json` to check the login and list your accounts, then `wrangler auth token --json` to read the token that login holds. It also calls `GET /accounts/<account>/workers/subdomain` to check that your account has a `workers.dev` subdomain.
2. **Checks the Worker name.** It calls `GET /accounts/<account>/workers/scripts/<worker>/settings` to see whether a Worker of that name exists, and `GET /accounts/<account>/hyperdrive/configs` to list your Hyperdrive configs. It never deploys over a Worker it did not make. Before the questions, when no config file for that Worker name is here, setup asks whether this is a Deployment it made whose file is lost (section 9); press Enter for a new one.
3. **Prints the Database account's SQL** (section 2) and waits while you run it.
4. **Creates the Hyperdrive config** with `POST /accounts/<account>/hyperdrive/configs`, with query caching disabled. A rerun updates it with `PATCH /accounts/<account>/hyperdrive/configs/<id>`. The password goes only in that request's body. Wrangler's own Hyperdrive commands would put it on a command line, so setup does not use them.
5. **Writes `wrangler.<worker>.jsonc`** in this folder. A first version is written at step 3, before the SQL is shown, so a rerun after a stop there finds it. That file holds this Deployment's own settings: its name, account, Hyperdrive config id, Database account and `vars`. It holds no secret. **Keep a backup of it.** It is gitignored, so it stays on this machine. Section 9 says what to do if it is lost.
6. **Sets `SERVER_SECRET`,** the secret every key derives from: 32 random bytes, through `wrangler secret put` on standard input. A rerun keeps the one already set: the Worker's settings from step 2 list its secrets by name.
7. **Deploys.** It merges [wrangler.template.jsonc](wrangler.template.jsonc), the settings every Deployment shares, with your file, then runs `wrangler deploy -c` on the result and deletes it.
8. **Runs the smoke checks** (section 4), retrying for up to two minutes while a new hostname starts resolving.
9. **Prints** the Deployment's URL and the redirect URI for section 5.

Every Wrangler command runs as Node with Wrangler's own script, never through a shell, `npx` or `npm`. That keeps command lines out of npm's log and works the same on Windows. No secret is ever passed as an argument.

The Deployment now refuses every Tool call, because no one can sign in yet. That is expected until section 5.

Other forms of the command:
- `npm run setup -- deploy` deploys your file's current settings, and the current shared settings, then runs the smoke checks.
- `npm run setup -- signin` sets up Sign-in (section 5).
- `npm run setup -- password` rotates the Database account's password (section 8).
- `npm run setup -- remove` removes the Deployment (section 8). It uses `wrangler delete` and `wrangler hyperdrive delete`.

## 4. Checking it

Setup runs these already. Run them yourself at any time with `npm run smoke -- https://<worker>.<subdomain>.workers.dev`. Without Node, the same checks with curl:

```
curl https://<worker>.<subdomain>.workers.dev/healthz
curl -i -X POST https://<worker>.<subdomain>.workers.dev/mcp -H "content-type: application/json" -H "accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
curl https://<worker>.<subdomain>.workers.dev/.well-known/oauth-protected-resource/mcp
curl https://<worker>.<subdomain>.workers.dev/.well-known/oauth-authorization-server
```

Expect:
- `{"status":"ok","database":"ok"}` from `/healthz`;
- `401` from `/mcp`, saying the connection has not been authenticated, with a `WWW-Authenticate` header naming `resource_metadata="https://<worker>.<subdomain>.workers.dev/.well-known/oauth-protected-resource/mcp"`;
- `"resource": "https://<worker>.<subdomain>.workers.dev/mcp"` from the protected-resource metadata;
- `S256` among the code challenge methods in the authorization-server metadata.

If `/healthz` reports anything else, section 9 says what it means.

## 5. Sign-in

Staff members sign in with their Entra ID accounts.
1. In the Entra admin center, open **App registrations** and choose **New registration**.
   - **Name:** anything, such as `sql-mcp-server`.
   - **Supported account types:** this organisational directory only.
   - **Redirect URI:** platform **Web**, and the URI setup printed: `https://<worker>.<subdomain>.workers.dev/oauth/callback`.
2. From the registration's overview, copy the **Application (client) ID** and the **Directory (tenant) ID**.
3. Under **Certificates & secrets**, add a client secret and copy its **Value**. Entra shows it once.
4. Run `npm run setup -- signin`. It asks for the tenant id (for `IDP_ISSUER`), the client id (`IDP_CLIENT_ID`) and the secret (`IDP_CLIENT_SECRET`, hidden as you type). Run it in PowerShell or Windows Terminal: Git Bash's own terminal cannot hide input, so setup stops there before asking for the secret. It puts the secret on standard input, redeploys, and runs the Sign-in smoke checks, which go as far as Entra's own sign-in page.

`IDP_SCOPES` is optional. It defaults to `openid profile email offline_access`, which Entra needs.

**Who gets in.** Anyone your Identity provider authenticates can call the Server, guest and external accounts included. If that is too wide, restrict the accounts in Entra ID itself, for example by requiring assignment to the app registration.

## 6. Making data visible

What the Agent sees is the Allow-list: the Database account's SELECT grants, within the Boundary. The Database administrator grants them in the Supabase SQL editor, or with any tool they already use. Grants take effect on the next Tool call, with no redeploy.

```
GRANT USAGE ON SCHEMA sales TO sqlmcp_reader;
GRANT SELECT ON sales.orders TO sqlmcp_reader;
GRANT SELECT (id, name, region) ON sales.customers TO sqlmcp_reader;   -- some columns only
REVOKE SELECT ON sales.orders FROM sqlmcp_reader;                      -- and back
```

Grant only what Staff members should reach through an Agent. Leave out columns such as salaries or personal details unless they are needed. The Server cannot tell a grant made by mistake from one made on purpose.

## 7. Connecting Staff members

Send Staff members [staff.md](staff.md), with the address `https://<worker>.<subdomain>.workers.dev/mcp`.

## 8. Running it

**Changing a Server setting.** Edit `vars` in `wrangler.<worker>.jsonc`, then run `npm run setup -- deploy`. The settings:
- `ROW_LIMIT`, the Row limit;
- `BOUNDARY`, the Boundary. To exclude a table within a schema, use the `exclude` form, as in `{"schemas":["sales"],"exclude":[["sales","payroll"]]}`;
- `REDACTION`, Redaction, `on` unless set to `off`;
- `PERMISSION_TIER`, the Permission tier. Leave it unset: this release has only `read-only`;
- `PUBLIC_URL`. Leave it unset on Cloudflare, which uses the request's own origin.

`ENGINE` (`postgres`) and the `HYPERDRIVE` binding come from the shared settings. Do not set them in your file.

**Rollback.** `npx wrangler deployments list --name <worker>` shows earlier versions, and `npx wrangler rollback <version-id> --name <worker>` returns to one. The Server keeps no data, so a rollback needs no data step. No commit so far has changed the token format's version, so a rollback keeps everyone's Sign-in. Until releases carry notes, a commit that changes it says so in its message: look for that before rolling back across it.

**Moving to a newer Server.** Until releases are tagged, `git pull`, then `npm ci` and `npm run setup -- deploy`. Your file keeps your settings, and the shared ones come from the new code.

**Rotating secrets:**
- `IDP_CLIENT_SECRET`: add a new client secret in Entra ID, run `npm run setup -- signin` with it, then delete the old secret in Entra ID.
- The Database account's password: run `npm run setup -- password`. It makes a new password, prints section 2's SQL with the new verifier for the SQL editor, and gives the password to Hyperdrive. A redeploy alone does not change the password Hyperdrive holds.
- `SERVER_SECRET`: setup never shows it, so you cannot set it as `SERVER_SECRET_PREVIOUS` to keep Sign-ins working through a rotation. Rotating it therefore signs every Staff member out, as for a leaked secret (security.md). To set a new value without it ever showing, pipe a generated one straight in, then redeploy:

  ```
  node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))" | npx wrangler secret put SERVER_SECRET --name <worker>
  npm run setup -- deploy
  ```

**Audit records.** In the Cloudflare dashboard, open **Workers & Pages**, then your Worker, then **Observability**. Filter on `$metadata.type` equals `cf-worker` and `type` equals `audit`. Workers Logs splits each record into fields, so a text search for `"type":"audit"` finds nothing. Records are kept 3 days on Free and 7 on Paid (section 1). Above 5 billion log lines a day across the account, Workers Logs keeps only a sample and could drop Audit records without trace. On an account shared with busy Workers, watch the daily volume.

**Monitoring.** Nothing in the Server pages anyone, and setup sets no alert up. For each signal below, this is where to watch it and when to call a human. This project has not found a Cloudflare notification for any of them, so save each Workers Logs query in **Observability** and check it, or point your own tooling at it.
- **`/healthz`:** an external HTTPS uptime monitor on `https://<worker>.<subdomain>.workers.dev/healthz`, because Cloudflare cannot run a health probe for a Worker. Call a human at 3 failures in a row (90 s).
- **Database errors:** in Workers Logs, `$metadata.type` equals `cf-worker`, and Audit records with `outcome.kind` equals `database_error`, and `outcome.reason_class` `connection` or `timeout`. Call a human at more than 10 within 5 minutes.
- **Identity provider failures:** in Workers Logs, `$metadata.type` equals `cf-worker`, `type` equals `op` and `event` `idp_unreachable` or `idp_invalid_response`. Call a human at more than 5 within 5 minutes.
- **Server faults:** in Workers Logs, `$metadata.type` equals `cf-worker`, `type` equals `op` and `event` `signin_error` or `server_fault`. Call a human at any.
- **Configuration errors:** in Workers Logs, `$metadata.type` equals `cf-worker`, `type` equals `op` and `event` `config_invalid`. Call a human at any.
- **5xx responses:** the Worker's **Metrics** tab, requests and errors. Call a human at more than 1% of requests over 15 minutes, with at least 20 requests.

**Removing a Deployment.** Run `npm run setup -- remove` and type the Worker's name to confirm. It deletes the Worker, its Hyperdrive config and `wrangler.<worker>.jsonc`, and nothing else. Then:
- run the SQL it prints, as `postgres` in the Supabase SQL editor. It drops the role only if setup made it for this Deployment, so it cannot remove another Deployment's account;
- delete the app registration in Entra ID.

## 9. Troubleshooting

**`/healthz` and the smoke checks:**
- `config: invalid` names one variable whose value the Server cannot use: a malformed `BOUNDARY`, a `ROW_LIMIT` outside 1 to 10,000, or a missing `SERVER_SECRET`. Fix it in your file, or with `wrangler secret put`, then run `npm run setup -- deploy`.
- `database: unreachable` means Hyperdrive could not connect to Supabase: usually a wrong pooler host, port or project ref, a role whose SQL was never run, or a password that no longer matches. Rerun `npm run setup` with the right details, or rotate the password with `npm run setup -- password`.
- `database: unsafe` means the Database account bypasses grants: it is `postgres`, has `BYPASSRLS`, or belongs to `pg_read_all_data` or `pg_write_all_data`. Remove that attribute or membership in Supabase; the next check sees the change, with no redeploy.

**Setup stopped partway.** Rerun the same command with the same Worker name. It finds what the earlier run made and carries on, creating nothing twice. If it stopped before Hyperdrive was made, it prints the Database account's SQL again with a new password, because the first one is gone. Run it whether or not you ran the first: it creates the role, or gives a new password to the one setup made for this Deployment.

**A lost `wrangler.<worker>.jsonc`.** Restore it from your backup. Without one, run `npm run setup`, give the same Worker name, and type that name again when setup asks whether it is a lost Deployment. Setup recognises a Worker it made by the Hyperdrive config of the same name it uses. It rebuilds the file from the Worker's current settings and its Hyperdrive config, asking nothing else, so every setting is kept: the Boundary, the Row limit, Sign-in and the Database account.

**"This terminal cannot hide what you type."** Setup stopped before a secret, because the terminal would echo it. Rerun in PowerShell or Windows Terminal, or in Git Bash as `winpty npm.cmd run setup -- signin`. Git Bash's `npm` is a shell script that winpty cannot start, so name `npm.cmd`.

**No `workers.dev` subdomain.** A new Cloudflare account has none until you choose one. In the dashboard, open **Workers & Pages** and choose a subdomain, then rerun.

**Sign-in fails with AADSTS50011.** The redirect URI in Entra ID does not match exactly. It must be `https://<worker>.<subdomain>.workers.dev/oauth/callback`, on the Web platform.

**The smoke checks report an empty error body, but the Deployment looks right.** Antivirus web shields and corporate proxies that re-sign HTTPS can corrupt the Server's chunked 401 response. Exclude the Deployment's host from HTTPS scanning. Staff members on managed machines can meet the same problem, and see it as a failed connection in their AI tool.
