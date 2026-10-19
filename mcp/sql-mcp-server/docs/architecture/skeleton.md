# Walking skeleton — sql-mcp-server

## Deployed
Cloudflare Worker (ADR-002) `sql-mcp-server`, at https://sql-mcp-server.prinsloopower.workers.dev, version `809beefe-d126-4af3-919c-1205c7d1dc68`. Deployed on 2026-10-17 from the commit that adds this file. It reaches PostgreSQL 17 on Supabase through Hyperdrive (ADR-008) and the Supabase session pooler (D-049).

What runs:
- `GET /healthz` runs a health-check Server statement against the Database, and reports `database: ok`.
- Every `/mcp` call is blocked with 401, the not-authenticated message, and a `WWW-Authenticate` challenge pointing at protected-resource metadata (D-017, D-044). Behind that block sits the MCP handler: the SDK's web-standard transport, stateless, with no Tools registered (ADR-003). No request reaches it until Sign-in exists.
- `GET /.well-known/oauth-protected-resource/<path>` describes the resource.

Verified by: npm run smoke -- https://sql-mcp-server.prinsloopower.workers.dev

## What this proved
- The deploy path: Wrangler built the bundle (1,116.22 KiB, 218.24 KiB gzipped, 40 ms startup, with the MCP SDK included), uploaded it, and bound Hyperdrive and the `ENGINE` var.
- The MCP SDK on the Workers runtime (ADR-003). It bundles and starts on the deployed Worker. In workerd, through the test-only probe Worker, it answers `initialize` with no session ID. In Node, it answers `tools/list` with no prior `initialize`. See `test/mcp.test.ts`.
- The Database round trip on the deployed Deployment: Worker to Hyperdrive to Supabase pooler to PostgreSQL, and back.
- The unauthenticated block and the protected-resource metadata, served from the real origin.
- The app runs on web-standard APIs (ADR-001), and its unit tests pass under Node.
- The PostgreSQL engine adapter against PostgreSQL 17 in Docker (ADR-010): `test/postgres.int.test.ts` passes, and the whole suite passes (11 of 11).

A TLS-intercepting proxy on the client machine can corrupt the chunked 401 response, so the smoke test reports an empty error body. This happened with Norton Safe Web, before `*.workers.dev` was excluded. The Operator material should say so, since Staff members connecting from managed machines will hit the same thing.

## What it did not prove
- **Audit records reaching Workers Logs (ADR-013).** No Tool call runs before Sign-in, so the skeleton writes no Audit record. The first slice that runs a Tool call has to show one in Workers Logs, and has to measure the real retention for Q-010.
- **Sign-in against a real Identity provider (ADR-004).** Neither Claude nor ChatGPT has connected. Whether both can complete sign-in through the broker (Q-019) is still assumed from their published documentation.
- **The Allow-list in the connector URL path surviving Claude's and ChatGPT's organisation connector settings (ADR-006, Q-015).** This is assumed, not tested.
- **The Query check (ADR-005).** In particular, `libpg-query`'s WebAssembly running inside the Worker size limit is assumed, not measured.
- **The container image on Azure with MS SQL Server (ADR-002, ADR-009, D-063).**
- **A Database the product owns (D-049).**
