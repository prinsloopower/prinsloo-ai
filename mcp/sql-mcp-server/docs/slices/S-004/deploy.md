# Deployment — S-004

Deployed commit 6a965ff to the project test Deployment (Cloudflare Worker `sql-mcp-server`) on 2026-10-31, as version `3359c4f5-cbc4-4124-bfff-727ee8ac4768`.
- Its `src/`, `bench/`, `test/`, `wrangler.jsonc` and `package.json` are identical to commit 94564d8, which passed review 5. 6a965ff adds only the review record and pipeline state.
- The bundle is 2,983.00 KiB, 595.70 KiB gzipped, with a 54 ms startup.

This deploy changes the Server in one way: `initialize` now reports `0.0.1+<Worker version id>`. The new `version_metadata` binding (`VERSION_METADATA`) lives in `wrangler.jsonc` and needs no variable or secret. No other variable changed, and no secret passed through any command.

Done before deploying (T-009, 2026-10-26, D-097):
- **The sample Database:** in the AI Golf App Supabase project, `sqlmcp_test` was rebuilt from `bench/sample-db.sql`. It now holds 4 regions, 60 customers, 25 products, 1,179 orders, 3,081 order lines, 20 targets and 5 staff, every table identical to Docker by per-table md5.
- **The reader's grants:** `sqlmcp_reader` reads every table but `staff`, and every `customers` column but `email`.
- **The old fixtures:** they were kept as `sqlmcp_test_s003`, outside the Boundary, because the connector declined `DROP SCHEMA`.
- **Checked through the Server:** the deployed Server's `list_tables` shows exactly the six granted tables.

Verified by: npm run smoke -- https://sql-mcp-server.prinsloopower.workers.dev && node scripts/smoke-signin.mjs https://sql-mcp-server.prinsloopower.workers.dev

Both passed on the deployed Worker, 6/6 and 7/7.

Rollback: `npx wrangler rollback 4dc70716-52c2-411c-8fc8-1b65af40d0ff`, the S-003 version. This rolls back code only: the Server writes nothing to the Database. Two points:
- **The sample Database stays.** S-003's code answers from it just as well. Its Try it counts no longer apply, as its deploy record notes.
- **The old fixtures** can be restored in Supabase as `postgres`, if S-003's data is wanted back:

  ```
  DROP SCHEMA sqlmcp_test CASCADE;
  ALTER SCHEMA sqlmcp_test_s003 RENAME TO sqlmcp_test;
  ```

  The connector declines the DROP, so this runs in the Supabase SQL editor.

Try it (T-010, the live run, made by the product owner):
1. In a PowerShell window, in `mcp/sql-mcp-server`, with `ANTHROPIC_API_KEY` set in that window only, run:

   ```
   npm run benchmark -- https://sql-mcp-server.prinsloopower.workers.dev
   ```

2. Sign in with your Entra account when the browser opens, then close the tab.
3. The run takes a while and costs about US$5–15. It ends by printing the correctness and give-up shares, the cost and the report's path under `bench/reports/`.
4. The report's header should name the Server version as `0.0.1+3359c4f5-cbc4-4124-bfff-727ee8ac4768`.

`bench/README.md` explains how to read the report.

## Not covered by the smoke check
- **What the slice delivers.** The smoke checks do not sign in or spend API credit, so they cannot run the benchmark. The live run (T-010) is its only end-to-end proof, and its figures go into the spec at verification.
- **The Worker version in `initialize`.** It needs a Sign-in to reach, so it is seen first in the T-010 report's header. The tests cover it through `workerDeps` and the app.
- **The harness against the real Server, model and Identity provider together.** The tests run it against the app with a fake Identity provider and a fake model. These are first exercised together in T-010:
  - the real Entra sign-in through the loopback listener;
  - a renewal after the hour;
  - Claude Sonnet 5.5's actual tool use.
