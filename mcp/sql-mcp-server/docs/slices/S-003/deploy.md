# Deployment — S-003

Deployed commit 049b821 to the project test Deployment (Cloudflare Worker `sql-mcp-server`) on 2026-10-25, as version `4dc70716-52c2-411c-8fc8-1b65af40d0ff`. Its `src/`, `test/` and `wrangler.jsonc` are identical to the reviewed commit c33f708: 049b821 adds only the review record and pipeline state. The bundle, now with the PostgreSQL parser's WebAssembly, is 2,982.76 KiB, 595.61 KiB gzipped, with a 49 ms startup. That is within the paid plan's 10 MiB (ADR-005).

No variable was added or changed. `ROW_LIMIT` and `REDACTION` stay unset on this Deployment, so it runs on their defaults: 500 rows, and Redaction on (operations.md). No migration ran, and no secret passed through any command.

Done before deploying, for the live check (T-013, spec's "Needs before live verification"):
- In the AI Golf App Supabase project (PostgreSQL 17.6), 500 rows were added to `sqlmcp_test.orders`:
  - ids 105–604, spread over the three existing customers;
  - `total` 10.00–121.25;
  - `placed_on` through 2026.

  The table now holds 504 orders: 336 for North and 168 for South, with none orphaned. This was plain SQL through the connector, so the project's migration history is untouched.
- Grants are as S-002 left them. `sqlmcp_reader` reads all of `orders` (`id`, `customer_id`, `total`, `placed_on`) and `customers (id, name, region)`. It reads neither `customers.email` nor `staff`.

Verified by: npm run smoke -- https://sql-mcp-server.prinsloopower.workers.dev && node scripts/smoke-signin.mjs https://sql-mcp-server.prinsloopower.workers.dev

Both passed on the deployed Worker, 6/6 and 7/7. `healthz reaches the Database` runs the account check as `sqlmcp_reader` through Hyperdrive, with caching off, and reports the account safe.

Rollback: `npx wrangler rollback c9bbfbb0-c8ca-4abb-868a-f32e080ec65c`, the S-002 version. Code only: the Server writes nothing to the Database. The 500 added test orders stay after a rollback, and do no harm to S-002, which only lists tables. They can be removed with `DELETE FROM sqlmcp_test.orders WHERE id BETWEEN 105 AND 604;`.

Try it:
1. In Claude or ChatGPT, with the SQL MCP connector signed in, ask "How many orders are there per region?". The answer should come from a `query` call and say North 336, South 168.
2. Ask "List every order". The answer should say the result was cut short at the Row limit of 500 rows.
3. Ask to read `sqlmcp_test.staff`, then to delete an order. Each should be refused, with a sentence that names nothing from the query, and no data should change.
4. In the Cloudflare dashboard, open Workers → `sql-mcp-server` → Logs and filter on `"type":"audit"`. Each question has one record:
   - `tool` `query`;
   - your Entra identity under `staff`;
   - the Request text;
   - the SQL with its literals as `?`, under `statements` or `submitted_sql`.

## Not covered by the smoke check
- **The `query` tool itself on the deployed system.** The smoke checks do not sign in, so they cannot call a tool. The Query check, the cursor through Hyperdrive, the cut-short notice, Refusals and Audit records are proven live only by T-013. That run is also the first to send the extended-protocol cursor transaction through Hyperdrive, which the Docker tests do not use.
- **The parser's first load on Workers.** It happens on the first `query` call in each isolate. The workerd test (T-001) loads it locally, and the deployed bundle carries it, but the first deployed load is seen only in T-013.
- **Workers Logs retention** (T-012) is measured on or after 2026-10-30, against S-002's first records of 2026-10-22.
