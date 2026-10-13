# Walking skeleton — sql-mcp-server

## Deployed
Not yet deployed. The target is a Cloudflare Worker (ADR-002) reaching PostgreSQL through Hyperdrive (ADR-008), chosen by the product owner.

The thinnest complete path is in place locally:
- `GET /healthz` runs a health-check Server statement against the Database, and reports `database: ok`.
- Every `/mcp` call is blocked with 401, the not-authenticated message, and a `WWW-Authenticate` challenge pointing at protected-resource metadata (D-017, D-044).
- `GET /.well-known/oauth-protected-resource/<path>` describes the resource.

Verified by: npm run smoke -- https://REPLACE_WITH_DEPLOYED_HOST

## What this proved
Nothing has been proved on a deployed Deployment yet. Locally, these are proved:
- The app runs on web-standard APIs (ADR-001), and its 6 unit tests pass under Node.
- Wrangler builds the Worker bundle (`wrangler deploy --dry-run`: 254.68 KiB, 55.26 KiB gzipped, with the Hyperdrive binding resolved).

The PostgreSQL integration test (`test/postgres.int.test.ts`) has not run yet, because Docker's engine was failing on this machine.

## What it did not prove
- **Audit records reaching Workers Logs (ADR-013).** No Tool call runs before Sign-in, so the skeleton writes no Audit record. The first slice that runs a Tool call has to show one in Workers Logs, and has to measure the real retention for Q-010.
- **Sign-in against a real Identity provider (ADR-004).** Neither Claude nor ChatGPT has connected. Whether both can complete sign-in through the broker (Q-019) is still assumed from their published documentation.
- **The Allow-list in the connector URL path surviving Claude's and ChatGPT's organisation connector settings (ADR-006, Q-015).** This is assumed, not tested.
- **The Query check (ADR-005).** In particular, `libpg-query`'s WebAssembly running inside the Worker size limit is assumed, not measured.
- **MS SQL Server on Workers (ADR-008, Q-001).** This is untouched. D-020 governs the outcome.
- **The container image on AWS and Azure (ADR-002, ADR-009),** and private Deployments on any cloud (D-041).
