# Deployment — S-005

Deployed commit 48ecd7d, which passed review 3, to the project test Deployment (Cloudflare Worker `sql-mcp-server`) on 2026-11-01, as version `7f43ac2e-8220-49dd-bbd8-cecbea85dfbb`. The bundle is 2,983.00 KiB, 595.70 KiB gzipped, with a 40 ms startup.

S-005 changes no Server behaviour. Its one Server edit exports `parseBoundary` and `ROW_LIMIT_MAX` from `src/config.ts`, so that the setup command reads them as the Server does. No variable or secret changed, and no secret passed through any command. This redeploy only makes the running version match the reviewed commit.

What S-005 delivers is the Deployment kit, which ships in the repository: the README, `deploy/cloudflare/`, `npm run setup`, and `docs/deployment-trials.md`. An Operator deploys their own Deployment with it. Its live proof is T-008, the product owner's timed trial, below.

Verified by: npm run smoke -- https://sql-mcp-server.prinsloopower.workers.dev && node scripts/smoke-signin.mjs https://sql-mcp-server.prinsloopower.workers.dev

Both passed on the deployed Worker, 6/6 and 7/7.

Rollback: `npx wrangler rollback 3359c4f5-cbc4-4124-bfff-727ee8ac4768`, the S-004 version. This rolls back code only; the Server keeps no data, and nothing in this deploy touched the Database. A trial Deployment made with the kit is separate, and is removed by its own steps (`npm run setup -- remove`).

Try it: T-008, the timed deployment trial, made by the product owner from a fresh clone, following only the README and the guide. Start the clock when you open the README.
1. Clone the repository into a new folder and open `mcp/sql-mcp-server/README.md` on GitHub or locally. Note the time.
2. Follow [deploy/cloudflare/guide.md](../../../deploy/cloudflare/guide.md) sections 1 to 4, using names no other Deployment uses:
   - Worker name `sql-mcp-trial`;
   - Database account `sqlmcp_trial`;
   - the AI Golf App Supabase project, Boundary schema `sqlmcp_test`.

   Run `npm run setup` in PowerShell or Windows Terminal, not Git Bash's own terminal. When the smoke checks pass, note the time: that ends R-013's hour.
3. Sections 5 to 7: register a new Entra app registration and run `npm run setup -- signin`, noting the time when its checks pass. Then grant `sqlmcp_trial` one table:

   ```
   GRANT USAGE ON SCHEMA sqlmcp_test TO sqlmcp_trial;
   GRANT SELECT ON sqlmcp_test.orders TO sqlmcp_trial;
   ```

   Add `https://sql-mcp-trial.<subdomain>.workers.dev/mcp` to Claude and to ChatGPT, and ask each one a question about orders. Note the time of the first answer.
4. Write down every place you stalled, or needed something the guide did not give. I'll record them in `docs/deployment-trials.md` and fix the docs for each.
5. Remove the trial Deployment with `npm run setup -- remove`, run the SQL it prints, and delete the trial's app registration in Entra ID. Then check that the project test Deployment's smoke checks still pass.

## Not covered by the smoke check
- **The setup command against the real Cloudflare and Supabase.** Every test runs it against a fake Wrangler and a fake Cloudflare API, and its SQL against Docker PostgreSQL. T-008 is the first run of each of these:
  - `wrangler auth token --json` and the Hyperdrive API it authorises, creating and updating a config with the password in the request body only;
  - code 10007 as Cloudflare's answer for a missing Worker on a new Worker name. A different code stops setup at step 2, which fails safe;
  - the Worker settings API listing `SERVER_SECRET` by name;
  - `COMMENT ON ROLE` and `shobj_description` run as Supabase's `postgres`, which the role mark needs;
  - the hidden prompt and Ctrl-C on a real Windows terminal;
  - `wrangler delete --force` and `wrangler hyperdrive delete`.
- **Deployment time.** The trial measures it, with the product owner as a lower bound (D-100). A run by an engineer new to the project is still owed for the release (Q-039).
