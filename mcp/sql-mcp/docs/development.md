# Development

How to run the Server and its tests on your own machine. To deploy it, see [deploy/cloudflare/guide.md](../deploy/cloudflare/guide.md).

## What you need

- Node 24 or later, and git;
- Docker, for the PostgreSQL 17 and SQL Server 2022 Databases the integration tests run against, and to build the container image;
- `openssl`, to make the SQL Server Database's test certificates.

## From a clean checkout

```
npm ci
npm run db:up                          # PostgreSQL 17 on localhost:55432
npm run db:mssql:seed                  # SQL Server 2022 on localhost:51433: makes the test certificates if missing,
                                       # starts the container, then the sqlmcp database, its tables and sqlmcp_reader's grants
npm test                               # unit, MCP-in-workerd, Node adapter and both Databases' integration tests
npm run typecheck
cp .dev.vars.example .dev.vars         # then fill SERVER_SECRET, and the IDP_* values for Sign-in
npm run dev                            # wrangler dev on http://localhost:8787
npm run smoke -- http://localhost:8787
```

`npm run db:down` stops the PostgreSQL Docker Database, and `docker compose -f test/docker-compose.yml --profile mssql down` stops both. `wrangler dev` connects through the `localConnectionString` in `wrangler.jsonc` to the PostgreSQL Docker Database, never to a remote one. `.dev.vars` holds local secrets and is gitignored. The test certificates are gitignored too, and the MS SQL Server tests trust the test CA through `test/mssql/trust-ca.ts`.

On Windows, if Docker cannot bind port 51433, the port is in a range Windows has reserved (`netsh int ipv4 show excludedportrange protocol=tcp`). Running `net stop winnat` and then `net start winnat` in an elevated shell releases it.

## The container image

```
npm run build:image                    # bundles src/server.ts into dist/server.js
docker build -t sql-mcp:local .
```

The image holds `dist/server.js` alone and runs it as uid 1000. [docs/settings.md](settings.md) lists the settings it reads and which it requires, starting with `ENGINE=mssql`. To run it against the Docker SQL Server, use `host.docker.internal,51433` as the server in `DATABASE_URL`, and mount `test/mssql/certs/ca.crt` read-only, naming it in `NODE_EXTRA_CA_CERTS`. `npm run print:check-sql` prints the Azure SQL Database account check as the bundle holds it.

[docs/settings.md](settings.md) describes every variable.

## Layout

- `src/`: the Server. `worker.ts` is the Cloudflare entry point, `server.ts` the container image's Node entry point, and `app.ts` the routes both serve.
- `Dockerfile`: the container image.
- `deploy/cloudflare/`: the Deployment kit: the guide, the Staff guide, the setup command, the Database account's SQL and the shared Wrangler settings.
- `scripts/`: the smoke checks a Deployment is checked with.
- `test/`: Vitest. Files named `*.int.test.ts` need the Docker Databases. `test/mssql/` holds the SQL Server tests, fixtures and seed, and `test/node/` the Node adapter's and the image's tests.
- `docs/security-material/`: what a Security reviewer needs: what the Agent can see and run, who can call the Server, and what is logged.
