# Review — S-005

## Review 1 (2026-11-01)

Reviewed: commit 8a2499d (6a323fd..9f74e3d) against the slice spec, on two axes in separate fresh contexts.
Tests: `npm test` → 45 files, 270 passed, 0 failed; `npm run typecheck` → clean.

Both reviewers found two of the same problems independently: the failed `secret list` and the uncaught failures. Each is listed once, under both axes. T-008, the live trial, is manual and follows deploy, so its absence is not a finding.

## blocker — a rerun can take over another Deployment's Database account with ALTER ROLE
Where: deploy/cloudflare/lib/setup.ts:115
Axis: spec and scope
`orphaned` is true whenever the Operator's file exists with no Hyperdrive config id and names the same role. The file is first written before the SQL is shown (D-108). Suppose the printed `CREATE ROLE` refused because the role belongs to another Deployment. Hyperdrive creation then fails on the wrong password. On the rerun, setup prints `ALTER ROLE` for that role and says this run made it. Running it changes another Deployment's password, possibly the project test Deployment's `sqlmcp_reader`. That breaks the spec's rule that the SQL never takes over an account another Deployment may use. An Operator who quit before running the SQL also gets an `ALTER ROLE` that fails, which contradicts "rerunning resumes".

## blocker — a failed `wrangler secret list` replaces SERVER_SECRET and signs everyone out
Where: deploy/cloudflare/lib/setup.ts:276
Axis: spec and scope; standards and naming
`secretNames` returns no names whenever `wrangler secret list` exits non-zero, and setup then puts a new `SERVER_SECRET` on a live Worker. A transient failure on a rerun voids every Sign-in and Conversation token, which is what step 6 exists to prevent. The bindings already read from Cloudflare list the Worker's secrets, so the separate call is redundant as well. The fake always succeeds, so no test can catch this.

## blocker — reusing an existing Hyperdrive config never sends the new password
Where: deploy/cloudflare/lib/setup.ts:126
Axis: standards and naming
`origin` never holds a password, so both branches of `password ? origin : withoutPassword(origin)` send none. When the Operator reuses a same-named config, setup prints `ALTER ROLE` with a new password's verifier but leaves Hyperdrive on the old one. The smoke checks then fail on every rerun. No test covers the reuse path.

## gap — reusing a same-named Hyperdrive config is untested, and its ALTER-or-CREATE choice is unrecorded
Where: deploy/cloudflare/lib/setup.ts:108
Axis: spec and scope
For a reused config, setup always prints `ALTER ROLE`, whether or not the role exists. With a new role, that SQL fails, and every rerun repeats it. No D-### records the choice, and no test answers the reuse question.

## gap — every failure that is not a SetupStopped escapes as a stack trace
Where: deploy/cloudflare/setup.ts:83
Axis: spec and scope; standards and naming
Several failures are not `SetupStopped`, and the entry point rethrows them:
- Cloudflare API errors outside a try (subdomain, Worker settings, Hyperdrive list), such as a 403, an expired token or a rate limit;
- `JSON.parse` of Wrangler's output, including `auth token --json`, whose SyntaxError message can quote part of the credential;
- a hand-edited `BOUNDARY`.

The Operator gets a Node stack trace instead of what failed and what to do. bench/run.ts catches everything and prints one line.

## gap — hidden input echoes the secret when stdin is not a TTY
Where: deploy/cloudflare/setup.ts:30
Axis: standards and naming
`ask` hides input by overriding readline's private `_writeToOutput`, and never checks `process.stdin.isTTY`. Under Git for Windows' mintty, stdin is a pipe, and the terminal itself echoes `IDP_CLIENT_SECRET`. The guide promises it is hidden as you type.

## gap — Boundary and Row limit parsing duplicate src/config.ts
Where: deploy/cloudflare/lib/setup.ts:66
Axis: standards and naming
Setup parses `BOUNDARY` twice with bare `JSON.parse` and its own shape, and hard-codes the 1–10,000 range, when src/config.ts already has `parseBoundary` and `ROW_LIMIT_MAX`. If the Server's rules change, setup accepts values the Deployment then rejects as `config: invalid`.

## gap — "sign-in" names the Operator's Cloudflare login beside the domain's Sign-in
Where: deploy/cloudflare/lib/setup.ts:250
Axis: standards and naming
`signedIn()` returns Cloudflare API credentials, and its messages say "Wrangler's sign-in". It sits next to `signin()`, which sets up Sign-in in the domain's sense, so a reader cannot tell which identity a name means.

## gap — the SQL prompt promises a listing that the ALTER ROLE does not have
Where: deploy/cloudflare/lib/setup.ts:119
Axis: standards and naming
On a reused Hyperdrive config, the printed SQL is `ALTER ROLE`, but the text still says "Its listing should show no rows".

## gap — a 2xx response with an unreadable body becomes undefined
Where: deploy/cloudflare/lib/cloudflare.ts:28
Axis: standards and naming
A body that does not parse is read as `{}`, so a successful response yields an undefined `result`, and the failure surfaces later, far from its cause, as a TypeError after the role was already created.

## gap — the child-process runner is written twice
Where: deploy/cloudflare/setup.ts:50
Axis: standards and naming
`runScript` copies `wranglerRunner` and already differs from it. Only one is tested, so a later Windows fix to one will miss the other.

## gap — database-account.sql restates the Server's Allow-list query by hand, and differs from it
Where: deploy/cloudflare/database-account.sql:18
Axis: standards and naming
The listing claims to show what the Allow-list would, but omits the Server's exclusion of tables owned by roles the account belongs to. Nothing ties the two together, so when the Server's query changes the listing will quietly differ.

## gap — setup_runs_steps_in_order does not check the SQL is waited on before Hyperdrive is created
Where: test/deploy/setup.test.ts:63
Axis: spec and scope
Pauses and requests are logged separately, so code that created Hyperdrive before pausing would still pass. On Cloudflare that order fails, because the role does not exist yet.

## gap — "a rerun after a stop at any step resumes" is tested at two stop points only
Where: test/deploy/setup.test.ts:178
Axis: spec and scope
Only stops at deploy and at Hyperdrive creation are tested. A stop at the SQL pause without the SQL being run, at `secret put`, or at the smoke checks is not. The first is the case where the code does not resume.

## gap — the monitoring test's threshold check passes trivially, and the entries omit the `$metadata.type` filter
Where: test/deploy/docs.test.ts:232
Axis: spec and scope
The threshold is searched across the whole section, so "any" matches "anyone" elsewhere. The guide's Workers Logs entries filter on `type` and `event` only. On an account shared with other Workers, those queries can match their lines.

## nit — the guide says the Operator's file is written at step 5
Where: deploy/cloudflare/guide.md:70
Axis: spec and scope
D-108 moved the first write to step 3.

## nit — the other forms ask for the Worker name even with one config on disk
Where: deploy/cloudflare/lib/setup.ts:162
Axis: spec and scope
The spec asks only when more than one config is on disk.

## nit — staff.md has no test
Where: test/deploy/docs.test.ts:168
Axis: spec and scope
T-007's title names the Staff guide, but no test reads it.

## nit — `message()` tests CloudflareError and Error, but one extends the other
Where: deploy/cloudflare/lib/setup.ts:307
Axis: standards and naming

## nit — `Session` names an opened Deployment
Where: deploy/cloudflare/lib/setup.ts:156
Axis: standards and naming
The Server already uses "session" for MCP and Sign-in.

## nit — `firstSetup` also runs every rerun and adoption
Where: deploy/cloudflare/lib/setup.ts:49
Axis: standards and naming

## nit — a validator that throws instead of returning a problem
Where: deploy/cloudflare/lib/setup.ts:63
Axis: standards and naming

## nit — the smoke-script path union is repeated three times
Where: deploy/cloudflare/lib/setup.ts:25
Axis: standards and naming

## nit — wrangler.ts imports its result type from setup.ts, the module that uses it
Where: deploy/cloudflare/lib/wrangler.ts:3
Axis: standards and naming

## nit — the test fixture rebuilds `operatorPath`
Where: test/deploy/world.ts:182
Axis: standards and naming

## nit — the docs test parses setup.ts's source and hard-codes call counts
Where: test/deploy/docs.test.ts:62
Axis: standards and naming
A harmless refactor breaks it, and its `escape` shadows a global.

## nit — new non-TypeScript kit files are not covered by the LF rule in .gitattributes
Where: deploy/cloudflare/database-account.sql:1
Axis: standards and naming

Verdict: fail (3 blockers, 12 gaps, 12 nits)
