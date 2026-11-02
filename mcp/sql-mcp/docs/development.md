# Development

How to run the Server and its tests on your own machine. To deploy it, see [deploy/cloudflare/guide.md](../deploy/cloudflare/guide.md).

## What you need

- Node 24 or later, and git;
- Docker, for the PostgreSQL 17 the integration tests run against.

## From a clean checkout

```
npm ci
npm run db:up                          # PostgreSQL 17 on localhost:55432
npm test                               # unit, MCP-in-workerd and PostgreSQL integration tests
npm run typecheck
cp .dev.vars.example .dev.vars         # then fill SERVER_SECRET, and the IDP_* values for Sign-in
npm run dev                            # wrangler dev on http://localhost:8787
npm run smoke -- http://localhost:8787
```

`npm run db:down` stops the Docker Database. `wrangler dev` connects through the `localConnectionString` in `wrangler.jsonc` to that Docker Database, never to a remote one. `.dev.vars` holds local secrets and is gitignored.

[docs/settings.md](settings.md) describes every variable.

## Layout

- `src/`: the Server. `worker.ts` is the Cloudflare entry point, and `app.ts` the routes it serves.
- `deploy/cloudflare/`: the Deployment kit: the guide, the Staff guide, the setup command, the Database account's SQL and the shared Wrangler settings.
- `scripts/`: the smoke checks a Deployment is checked with.
- `test/`: Vitest. Files named `*.int.test.ts` need the Docker Database.
- `docs/security-material/`: what a security reviewer needs: what the Agent can see and run, who can call the Server, and what is logged.
