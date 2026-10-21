# Operations — sql-mcp-server

## Deployment

A release is a git tag `vX.Y.Z`. CI builds two artifacts from it: the Worker bundle, and the container image tagged `X.Y.Z` and with the commit SHA (ADR-002). The registry is chosen in PRD sequencing step 5, the first step that builds the image. A release ships only if `npm test`, `npm run typecheck` and the smoke test against the project test Deployment all pass.

| cloud | deploy | rollback |
|---|---|---|
| Cloudflare | `npm run deploy` (Wrangler). Settings are `vars` in `wrangler.jsonc`, secrets come from `wrangler secret put` | `npx wrangler rollback <version-id>`. Wrangler prints the version ID on every deploy, and `npx wrangler deployments list` shows past ones |
| Azure | `az deployment group create` with the Bicep template, the new image tag and parameters | the same command with the previous image tag |

Every Server setting change is a redeploy (Deployment, in the domain model). Rolling back the code never needs a data step, because the Server keeps no data. Rolling back one release is always safe for tokens, because of the two-release format rule (data-model.md). Rolling back further, across a release that raised `v`, voids the newer tokens: every Staff member signs in again, and Created objects drop out of the Conversations that used them. The rollback procedure checks the release notes for a `v` change first.

After every deploy, the Operator runs `npm run smoke -- <url>`. The Deployment kit's docs give the same five checks as `curl` commands for Operators without Node.

**TLS-intercepting software.** Antivirus web shields and corporate proxies that re-sign HTTPS can corrupt the chunked 401 response. The smoke test then reports an empty error body even though the Deployment is correct. This was seen on 2026-10-17 with Norton Safe Web. The fix is to exclude the Deployment's host from HTTPS scanning, and the Deployment kit's troubleshooting section says so. Staff members on managed machines can hit the same thing, and see it as a failed connection in their AI tool.

## Configuration per environment

| setting | local | project test Deployment | Operator Deployment default |
|---|---|---|---|
| PERMISSION_TIER | as the test needs | `read-only` until step 6 | `read-only` (D-019) |
| ROW_LIMIT | 500 | 500 | 500 |
| REDACTION | `on` | `on` | `on` (D-007) |
| BOUNDARY | the sample Database's schemas | `{"schemas":["sqlmcp_test"]}` on both test Deployments (D-060, D-065) | unset: no exclusion, the grants alone decide (D-075) |
| Database account | a local role with test grants | `sqlmcp_reader`, granted only on `sqlmcp_test` (D-077) | a dedicated account the Database administrator grants; never a role that bypasses grants |
| IDP_ISSUER | a test provider, or unset to exercise D-017 | the product owner's Entra ID tenant (D-073) | the organisation's provider |
| Host log retention | n/a | Workers Logs: 7 days (paid plan) | Operator's own policy (D-052). On Azure, the Bicep template takes it as a required parameter with no default, so the choice cannot be skipped. On Cloudflare, Workers Logs keeps 3 days on the Free plan and 7 on Paid, and the period cannot be changed |

**Workers Logs limits that bear on Audit records** (Cloudflare docs, checked 2026-10-18):
- Retention is fixed at 3 days (Free) or 7 days (Paid). An Operator whose policy needs longer cannot meet it on Cloudflare while keeping records on the Host. Logpush and tail Workers both move records off it, which D-006 forbids. With PostgreSQL served only from Cloudflare (D-063), such an Operator has no supported PostgreSQL Deployment this iteration. The Security material and the Deployment kit both say so.
- A log line over 256 KB is cut. The Audit record's own 64 KiB cap stays below that.
- Above 5 billion log lines per account per day, Workers Logs keeps a 1% sample. Expected volume is far below this, but on an account shared with busy Workers, Audit records could be dropped without trace. The Deployment kit tells Cloudflare Operators to watch the account's daily volume.

## Monitoring, and what calls a human

The Deployment kit sets these up where the platform can, and documents them where it cannot.

| signal | source | a human is called when |
|---|---|---|
| `/healthz` | the platform's health check: Container Apps probe every 30 s; on Cloudflare, an external monitor the Operator chooses | 3 failures in a row (90 s) |
| Database errors | Audit records with `outcome.kind = "database_error"` and `reason_class` `connection` or `timeout` | more than 10 within 5 minutes |
| Identity provider failures | operational lines with event `idp_unreachable` or `idp_invalid_response` (D-070) | more than 5 within 5 minutes |
| Server faults | operational lines with event `signin_error` or `server_fault` (D-070) | any |
| configuration errors | operational lines with event `config_invalid` | any |
| 5xx responses | the platform's request metrics | more than 1% of requests over 15 minutes, with at least 20 requests |

Nothing in the Server pages anyone. Alerting is the Host platform's job, configured by the Operator. Audit records are never the alert channel's payload; alerts carry counts only.

## Limits

| limit | value | on breach |
|---|---|---|
| MCP request body | 1 MiB | 413, before parsing |
| `request_text` | 1–4,000 characters | Refusal, `invalid_input` |
| Agent-written query text | 64 KiB | Refusal, `query_check` |
| Typed tool row inputs (insert, update, delete) | 100 rows per Tool call | Refusal, `invalid_input` |
| Conversation token | 50 Created objects | create-table Refusal, `invalid_input`, asking the Database administrator to grant the objects |
| Row limit | 1–10,000; default 500 | configuration error |
| Audit record line | 64 KiB | the longest SQL strings are cut, and `shortened` is set (data-model.md) |
| Identity provider call | 5 s | Sign-in fails, naming the provider |
| Client ID Metadata Document fetch | 3 s; 16 KiB | registration fails, `invalid_client` |
| Database connect | 5 s | Database error, `connection` |
| Statement execution | none from the Server (D-003). The Database's own settings and the platform's limits apply: Workers allow 30 s of CPU per request by default, though waiting on the Database is not CPU time; Azure Container Apps ingress ends a request after 240 s, which cannot be configured | Database error, `timeout`, or a dropped connection the AI tool reports |
| Rate | none (D-057) | — |
| Worker bundle | under 10 MiB gzipped (Workers paid plan). Fitting the free plan is not promised (ADR-005). Currently 218 KiB | the release build fails |

### Expected volume and targets

These are the sizes the release test harness checks one Deployment against:
- up to 200 Staff members on one Deployment;
- up to 5 Tool calls per second at peak, and 1 per second sustained;
- the Server's own overhead per Tool call (arrival to response, minus time inside the Database): p95 at most 150 ms on Workers and at most 100 ms on Azure Container Apps;
- `/healthz` p95 at most 500 ms, including one Database round trip.

Beyond this, an organisation runs more Deployments (ADR-012). On Azure, the Container App runs 1 replica by default, and the Bicep template allows up to 3, scaling at 70% CPU.

## Critique findings

Gate 1, 2026-10-18, critique in fresh context. Verdict: fail (1 blocker, 2 gaps, 2 nits). The fail was recorded before these lines were written, because of a tooling error, so that gate's `defects_found` reads low.

- **blocker — rolling back across a token format change is not safe.** Accepting the current and previous `v` protects upgrades only. Rolling back from a release that issues v2 to one that reads only v1 and v0 voids every Sign-in. Conversation tokens never expire, so Conversations started under v2 lose their Created objects for good.
- **gap — Workers Logs retention has no number.** The Cloudflare route under D-052 is undefined, and a Cloudflare Operator who needs longer retention is told neither the route nor the limit.
- **gap — the clean-checkout deferral is in prose only.** The Sign-in slice's done-condition (a fresh-clone run, and adding `.dev.vars.example`) is in no register entry, so slice-spec will not see it.
- **nit — some data-model numbers are not covered by D-058:** `redirect_uris` 1–5 entries, `client_name` 100 characters, the 10-minute Authorization request and the 60-second Authorization code.
- **nit — the lint's 'ceiling' finding is a false positive** on the T-SQL built-in `CEILING`. It needs an allowance in the lint, not a change to the artifact.

Revision 2, 2026-10-18:

- Rollback → format changes now ship across two releases: read `v+1` first, issue it one release later. A one-release rollback never voids a token. The cost of rolling back further is stated in data-model.md and in the rollback procedure above.
- Workers Logs → 3 days (Free) or 7 days (Paid), fixed, from Cloudflare's docs. An Operator needing longer deploys on AWS or Azure, because the off-Host routes break D-006 (superseded by the D-063 amendment below). The 256 KB line cap and the 1% daily-limit sampling are stated too.
- Clean checkout → registered as D-059.
- Data-model numbers → added to D-058.
- 'ceiling' → left as it is. `CEILING` is the T-SQL function's name, and the lint finding stays until the lint learns to skip code spans.

Gate 2, 2026-10-18, critique in fresh context. Verdict: pass (0 blockers, 0 gaps, 2 nits). All gate-1 findings confirmed resolved; 'ceiling' again judged a false positive.

- **nit — the local Hyperdrive binding was undocumented** → environments.md now names `localConnectionString`.
- **nit — the `offline_access` scope may not get a refresh token from Google** → environments.md flags it for the Sign-in slice to check.

Amended for D-063 on 2026-10-18. AWS removed throughout (CloudFormation, Secrets Manager, ALB). `DATABASE_URL` is now an Azure-only MS SQL Server connection string, and `ENGINE` must match the runtime. An Operator needing Audit record retention beyond Workers Logs' fixed window has no supported PostgreSQL Deployment this iteration. Private Deployments are deferred (D-064), and the MS SQL Server test Deployment is added (D-065). Re-gated with the slices.
