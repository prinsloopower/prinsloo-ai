# Deployment — S-002

Deployed commit 1a70c51 to the project test Deployment (Cloudflare Worker `sql-mcp-server`) on 2026-10-22, as version `c9bbfbb0-c8ca-4abb-868a-f32e080ec65c`. Its `src/` is identical to the reviewed commit bcdb2ad. 1a70c51 adds only the `BOUNDARY` var `{"schemas":["sqlmcp_test"]}`. The bundle is 1,231.80 KiB, 247.21 KiB gzipped, with a 53 ms startup.

Done before deploying (T-007):
- In the AI Golf App Supabase project, schema `sqlmcp_test` was created with `customers`, `orders` and `staff`, all owned by `postgres`, with a few sample rows. This was plain SQL through the connector, so the project's migration history is untouched.
- Role `sqlmcp_reader` was created with LOGIN and no bypass flags. It belongs to no roles and owns nothing. It was granted `USAGE` on `sqlmcp_test`, `SELECT` on `orders`, and `SELECT (id, name, region)` on `customers`. Its password was generated locally, and Supabase received only its SCRAM-SHA-256 verifier.
- Hyperdrive config `eb6eadef…` was updated to connect as `sqlmcp_reader.dwsikgvekndbmowzdcnx` through the session pooler, with caching disabled (D-079).
- The password was passed to Wrangler as an argument, and npm's debug log for that run recorded it. That log file was deleted, and no other npm log or shell history holds it.

Verified by: npm run smoke -- https://sql-mcp-server.prinsloopower.workers.dev && node scripts/smoke-signin.mjs https://sql-mcp-server.prinsloopower.workers.dev

Both passed on the deployed Worker, 6/6 and 7/7. `healthz reaches the Database` now runs the D-077/D-081 account check as `sqlmcp_reader` through Hyperdrive and Supabase's pooler, and it reports the account safe.

Rollback: `npx wrangler rollback 8f666e42-0a9b-4bbb-83a4-e39828464114`, the S-001 version. No data changes: the Server writes nothing. Two points:
- The Hyperdrive change is outside the Worker version and stays after a rollback. S-001 only pings, so it works as `sqlmcp_reader` too.
- The `sqlmcp_test` schema and the `sqlmcp_reader` role stay in Supabase unless removed with `DROP SCHEMA sqlmcp_test CASCADE; DROP ROLE sqlmcp_reader;`.

Try it:
- In Claude or ChatGPT, with the SQL MCP connector signed in, ask "Which tables can I query?". The answer should list `sqlmcp_test.orders` (all columns) and `sqlmcp_test.customers` with only `id`, `name` and `region`, and nothing else: not `staff`, not `email`, nothing outside `sqlmcp_test`.
- Then, in Supabase's SQL editor for AI Golf App, run `REVOKE SELECT ON sqlmcp_test.orders FROM sqlmcp_reader;` and ask again. `orders` should be gone. Restore it with `GRANT SELECT ON sqlmcp_test.orders TO sqlmcp_reader;`.
- Each question leaves an Audit record. In the Cloudflare dashboard, open Workers → `sql-mcp-server` → Logs and filter on `"type":"audit"`.

## Not covered by the smoke check
- **`list_tables` itself on the deployed system.** The smoke check does not sign in, so it cannot call a tool. The listing, grant/revoke and Audit records are proven live only by T-009.
- **Supabase's own grants to `PUBLIC`** in its schemas (`extensions`, `auth`, `storage` and others). The Boundary keeps them out of this Deployment. An Operator Deployment with no Boundary against Supabase would show whatever Supabase grants `PUBLIC`, which S-005's Deployment kit has to address.
- **Workers Logs retention** for Audit records: 3 days on Free and 7 on Paid, per Cloudflare's docs. It is not measured here.
