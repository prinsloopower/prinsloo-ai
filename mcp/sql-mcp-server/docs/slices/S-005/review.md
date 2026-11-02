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

Reworked in commit 5f0d8c8 (D-109).

## Review 2 (2026-11-01)

Reviewed: commit 5f0d8c8, review 1's rework, and the whole slice (6a323fd..5f0d8c8), on two axes in separate fresh contexts.
Tests: `npm test` → 45 files, 276 passed, 0 failed; `npm run typecheck` → clean.

Every review-1 finding is resolved. Two are only partly resolved: the "expect no rows" prompt, which now misleads on the `password` form (below), and the docs test, which still scans setup's source but now asserts that the scan found calls. Both reviewers raised the role mark naming only the Worker. It is listed once, as a gap.

## gap — adoption asks its questions before reading the Worker, so the defaults widen the Boundary and reset the Row limit
Where: deploy/cloudflare/lib/setup.ts:80
Axis: spec and scope
With the config file lost, every question's default is a fresh install's: no Boundary schemas, Row limit 500 and role `sqlmcp_reader`. They are not the adopted Worker's values, which setup reads a moment later. An Operator who presses Enter deploys with no Boundary schemas, so the Agent sees every schema the role reaches. `setup_adoption_restores_worker_vars` itself expects the Worker's Row limit of 100 to go back to 500. The defaults should come from the Worker's bindings and its Hyperdrive config's origin.

## gap — changing the Database account on a rerun or adoption moves Hyperdrive to the new role without its SQL or a password
Where: deploy/cloudflare/lib/setup.ts:136
Axis: spec and scope
When the Hyperdrive config exists, step 3 is skipped, but the update still sends this run's role as the user, with the old role's password. Either Cloudflare refuses, and the stop message wrongly blames the host, port or project ref. Or the file records a role it did not make, and `remove` then prints `DROP ROLE` for it, possibly the project test Deployment's `sqlmcp_reader`. No test changes the role on a rerun.

## gap — the passed spec was rewritten in rework, and its Proven-by now contradicts D-109
Where: docs/slices/S-005/spec.md:159
Axis: spec and scope
The rework changed the human-passed spec under a model decision. Proven by still says "a second run, or a run naming an existing role, changes nothing", and T-006's title says it "refuses an existing one". The code and its test now reset the password for the same Deployment's role. Verification and the trial would check against a spec that says two things.

## gap — the role's mark names a Deployment by its Worker name alone
Where: deploy/cloudflare/lib/database-account.ts:22
Axis: standards and naming; spec and scope
A Worker name is unique only within one Cloudflare account. Two Deployments in different accounts with the same Worker and role name on one Database would pass each other's mark check. The second would then reset the first's password. Q-039's trial by a new engineer could do exactly that if it reuses the trial's names. The mark should carry the account id as well.

## gap — Ctrl-C at a prompt exits with Node's unsettled top-level await warning, not one line
Where: deploy/cloudflare/setup.ts:49
Axis: standards and naming
With `terminal: true` and no SIGINT handler, Ctrl-C closes readline and the question never settles. Node exits with code 13 and a warning naming the source line, skipping the entry point's one-line catch. The fixture's comment says its thrown abandonment is what Ctrl-C does, so the test models a path that never happens.

## gap — the hidden-prompt stop advises `winpty npm run setup`, which cannot start npm in Git Bash
Where: deploy/cloudflare/setup.ts:30
Axis: standards and naming
Under Git Bash, `npm` is a shell script, and winpty needs `npm.cmd`. The message also drops the form that was running (`-- signin`). An Operator following it meets a second, unexplained failure.

## gap — every printed Database account SQL says "expect no rows", including a password rotation
Where: deploy/cloudflare/lib/setup.ts:264
Axis: standards and naming
By the time of `npm run setup -- password`, the Database administrator has normally granted tables, so the listing shows rows. An Operator told to expect none may think something leaked, or put a Boundary on a live Deployment.

## gap — any 404 on the Worker's settings reads as "no Worker", which leads to a new SERVER_SECRET
Where: deploy/cloudflare/lib/cloudflare.ts:38
Axis: standards and naming
`absent` turns every 404 into "no such Worker", without checking Cloudflare's script-not-found code. A 404 for any other reason on a live Deployment makes step 6 put a fresh `SERVER_SECRET`, signing everyone out: the failure D-109 set out to remove.

## nit — readline is forced into terminal mode when stdin is not a TTY
Where: deploy/cloudflare/setup.ts:34
Axis: standards and naming

## nit — the fake still implements `wrangler secret list`, and a test stubs a failure of a call setup never makes
Where: test/deploy/world.ts:77
Axis: standards and naming

## nit — database_account_sql_refuses_existing_role also proves the reset, which its name does not say
Where: test/deploy/database-account.int.test.ts:65
Axis: standards and naming

## nit — a test hard-codes the mark text instead of using `roleMark`
Where: test/deploy/setup.test.ts:312
Axis: standards and naming

## nit — "Update Wrangler with npm ci" when `npm ci` reinstalls the locked version
Where: deploy/cloudflare/lib/setup.ts:306
Axis: standards and naming

## nit — `fresh` exists only to narrow a type
Where: deploy/cloudflare/lib/setup.ts:126
Axis: standards and naming

## nit — the entry point restates `message()`
Where: deploy/cloudflare/setup.ts:78
Axis: standards and naming

## nit — lines far beyond the codebase's width
Where: deploy/cloudflare/lib/setup.ts:264
Axis: standards and naming
Sixteen lines exceed 165 characters, against a longest of 161 elsewhere.

## nit — "logged in" echoes Sign-in's rejected alias "log in"
Where: deploy/cloudflare/lib/setup.ts:271
Axis: standards and naming

## nit — two `ALTER ROLE` assertions cannot fail, because the template always contains it
Where: test/deploy/setup.test.ts:311
Axis: spec and scope

## nit — the Cloudflare account is asked last, not fourth as the spec orders it
Where: deploy/cloudflare/lib/setup.ts:88
Axis: spec and scope

## nit — the port defaults to 5432, which the spec does not give
Where: deploy/cloudflare/lib/setup.ts:68
Axis: spec and scope

## nit — a stop between creating Hyperdrive and writing its id gets a rerun that defaults to "no"
Where: deploy/cloudflare/lib/setup.ts:123
Axis: spec and scope

## nit — the guide's SERVER_SECRET rotation prints the secret to the terminal
Where: deploy/cloudflare/guide.md:155
Axis: spec and scope

## nit — `wrangler delete --force` also overrides Wrangler's dependents check, which D-108 does not record
Where: deploy/cloudflare/lib/setup.ts:243
Axis: spec and scope

Verdict: hold (0 blockers, 8 gaps, 14 nits)

The product owner answered: "Fix all, then one last check". Reworked in commit 85624a3 (D-110).

## Review 3 (2026-11-01)

Reviewed: commit 85624a3 only (8c649f7..85624a3), review 2's rework, on two axes in separate fresh contexts.
Tests: `npx vitest run test/deploy` → 4 files, 41 passed; the full suite passed 278 before commit; `npm run typecheck` → clean.

Review 2's findings are resolved, apart from those named below: the "expect no rows" gap, which the template's own comment still carries; the `fresh` variable; and long lines, now 7 over 165 characters, the longest 182. Both reviewers found the adoption tests' missing user. It is listed once.

## gap — the adoption tests never read the Database account from the Hyperdrive user
Where: test/deploy/setup.test.ts:355
Axis: spec and scope; standards and naming
Both adoption fixtures give the Hyperdrive config no `user`, so only the fallback that asks for the role runs. The test asserts that the role was asked, just under a comment saying none is. A wrong parse of `<role>.<project ref>` would name the wrong role in the rebuilt file, and later rotation and removal SQL would target it, with no test failing. The spec also never mentions the fallback.

## gap — the spec's Rerunning section still says step 3 is skipped whenever the Hyperdrive config exists
Where: docs/slices/S-005/spec.md:94
Axis: spec and scope
A rerun that changes the Database account now runs step 3 (D-110), so the spec says two things again.

## gap — a rotation still prints "Expect no rows", and the test that says it does not checks the wrong case
Where: deploy/cloudflare/database-account.sql:28
Axis: standards and naming
The printed SQL carries the template's own comment, "Expect no rows", under a prompt that now says the listing shows what was granted. The test's `not.toContain("expect no rows")` is case-sensitive, so it cannot fail.

## nit — no test covers a rerun after a stop between creating Hyperdrive and writing its id
Where: deploy/cloudflare/lib/setup.ts:259
Axis: spec and scope

## nit — the spec's question table omits the adopt question and lists the account fourth while calling it last
Where: docs/slices/S-005/spec.md:71
Axis: spec and scope

## nit — after a role change, nothing says to drop the old role
Where: deploy/cloudflare/lib/setup.ts:257
Axis: spec and scope

## nit — "only code 10007 means no Worker" is checked only against the fake
Where: deploy/cloudflare/lib/cloudflare.ts:65
Axis: spec and scope
The T-008 trial is its first real check. A wrong code fails safe: setup stops at step 2.

## nit — the adopted Database account skips the role-name check and the postgres refusal
Where: deploy/cloudflare/lib/setup.ts:203
Axis: standards and naming

## nit — the removal SQL blames a missing role on the mark
Where: deploy/cloudflare/lib/database-account.ts:127
Axis: standards and naming

## nit — the interruption test asserts the fake's own message
Where: test/deploy/world.ts:61
Axis: standards and naming

## nit — a bare `boundaryOf(config)` call whose purpose is unstated
Where: deploy/cloudflare/lib/setup.ts:208
Axis: standards and naming

Verdict: hold (0 blockers, 3 gaps, 8 nits)

The product owner answered: "Fix all, then deploy". The fixes, in the commit that records this:
- **Adoption tests:** both fixtures now give the Hyperdrive config a pooler user. The tests assert the Database account read from it and that no question is asked. A config connecting as `postgres` is not adopted, and an adopted role passes the same name check as an asked one.
- **The spec's Rerunning section** now says a changed Database account runs step 3. The question table lists the adopt question second and the account last, as asked. The guide says to drop the old role after a change.
- **Rotation:** the SQL template's comment no longer says "Expect no rows", and the test checks without regard to case.
- **Nits:**
  - a rerun after a stop between creating Hyperdrive and writing its id is tested;
  - the removal SQL reports a missing role as nothing to drop;
  - the interrupted message is one function, shared by the prompt and the fake;
  - the `boundaryOf` check and the `fresh` const have comments;
  - code 10007 is noted as first checked live by T-008.

  The long lines are left: 7 lines over 165 characters, the longest 182.

Tests after the fixes: `npm test` → 45 files, 278 passed; `npm run typecheck` → clean. On the product owner's answer the review is recorded as passed on these fixes, without a fourth review. T-008's live trial is the next check.

The remaining nit is the long lines.

Verdict: pass (0 blockers, 0 gaps, 1 nit)

## Review 4 (2026-11-01): T-009, the clean copy

Reviewed: commits d367be9..2fc3da6 and the clean copy's commit 7d630dd, against T-009 and D-111, on two axes in separate fresh contexts.
Tests: `npx vitest run test/export test/deploy` → 5 files, 46 passed; in `../sql-mcp`, `npm run typecheck` → clean and `npx vitest run` → 37 files, 239 passed. A fresh export matched the committed copy exactly.

Both reviewers raised four of the same problems, each listed once below: the failed export, the benchmark's dependency, and the scrub's two broken comments.

## blocker — the settings reference has no Limits table
Where: docs/settings.md:31
Axis: spec and scope
T-009 requires the settings reference to match the system spec's variables, limits and monitoring tables. With no Limits table, the clean copy has no record of the request-body, Request text and query-text limits, the connect and fetch timeouts, the Audit line cap, the absence of a statement timeout, or the absence of a rate limit.

## gap — a failed check leaves the rejected copy written into the committed folder
Where: release/export.ts:62
Axis: spec and scope; standards and naming
The export writes every file before checking. When the check fails, the refused tree stays in `../sql-mcp`, where the next `git add` stages it. Nothing checks that no file outside the list got in, either.

## gap — prepare decides a folder is an earlier copy from the LICENSE's holder
Where: release/export.ts:124
Axis: standards and naming
`release/` itself passes the check, so exporting into it would delete the export script.

## gap — prepare deletes the target's ignored local files
Where: release/export.ts:126
Axis: standards and naming
`.dev.vars`, `.wrangler/` and any Operator file written while trying the copy are lost without warning.

## gap — the check skips any file whose extension is not on its list
Where: release/export.ts:48
Axis: standards and naming

## gap — the process check cannot see process words without an ID, and some remain
Where: .dev.vars.example:25
Axis: spec and scope
"later slices", "the design reviews", and test files named for review rounds remain in the copy.

## gap — export_includes_only_listed_files is a denylist
Where: test/export/export.test.ts:30
Axis: spec and scope
A file outside the include list would pass, unless it held a reference.

## gap — settings_reference_matches_system_spec compares names alone
Where: test/export/export.test.ts:83
Axis: spec and scope
A changed default, secret flag or threshold source would pass. The test should compare the columns that must stay equal, and record which may differ.

## gap — no test pins the guide's clone path, and T-009 still says "public repository"
Where: deploy/cloudflare/guide.md:25
Axis: spec and scope

## gap — the export tests swallow the export's error, under a comment that misdescribes it
Where: test/export/export.test.ts:22
Axis: standards and naming

## gap — nothing tests prepare's refusal or what it keeps
Where: test/export/export.test.ts:20
Axis: standards and naming

## gap — setup tells the Operator to run from the sql-mcp-server folder
Where: deploy/cloudflare/setup.ts:22
Axis: standards and naming
In the clean copy, that folder is `sql-mcp`.

## gap — the markdown table helper is duplicated across two test files
Where: test/export/export.test.ts:12
Axis: standards and naming

## nit — the scrub left "--." in the SQL the Operator pastes, and "*." in a comment
Where: deploy/cloudflare/database-account.sql:29
Axis: spec and scope; standards and naming
The comment is src/audit.ts:53.

## nit — the benchmark's dependency ships in the clean copy
Where: package.json:32
Axis: spec and scope; standards and naming

## nit — `npm run deploy` survives against a placeholder Hyperdrive id
Where: release/wrangler.public.jsonc:23
Axis: spec and scope

## nit — SERVER_INFO's version and the package's are set separately
Where: src/mcp.ts:15
Axis: spec and scope

## nit — section names of absent documents remain as citations
Where: src/engine/database.ts:86
Axis: standards and naming
The others are "(MCP endpoint)", "(Redaction rule)" and "(Visibility resolver)".

## nit — a hand-joined doc comment runs to 154 columns
Where: src/engine/postgres-structure.ts:6
Axis: standards and naming

## nit — the process patterns miss four-digit IDs, some document names and other workers.dev hosts
Where: release/export.ts:33
Axis: standards and naming

## nit — tsconfig is parsed as plain JSON
Where: release/export.ts:78
Axis: standards and naming

## nit — the .gitattributes comment claims more than its rules cover
Where: release/export.ts:85
Axis: standards and naming

## nit — settings.md describes Azure and a container template the copy lacks
Where: docs/settings.md:25
Axis: standards and naming

## nit — terms capitalised as if domain terms, and four questions the copy never lists
Where: docs/settings.md:46
Axis: standards and naming

## nit — the test's temporary parent folder is never removed
Where: test/export/export.test.ts:27
Axis: standards and naming

Verdict: fail (1 blocker, 11 gaps, 13 nits)

Reworked in the next commit (D-112).

## Review 5 (2026-11-01): T-009, last check of review 4's rework

Reviewed: commit db24ccd (2fc3da6..db24ccd) and the clean copy's commit 4784109, on two axes in separate fresh contexts.
Tests: `npx vitest run test/export test/deploy` → 5 files, 48 passed; in `../sql-mcp`, typecheck clean and 37 files, 239 passed. The clean copy matches the source file for file, apart from the six files the export writes.

Every review-4 finding is resolved, except:
- the benchmark's dependency, accepted in D-112;
- the Azure example in settings.md;
- the long doc comment, now 152 columns.

Both reviewers raised the refusal test's fixture. It is listed once.

## gap — the refusal test cannot tell which condition refused the folder, and never tries .git or .sdlc
Where: test/export/export.test.ts:88
Axis: spec and scope; standards and naming
The fixture lacks `src/worker.ts` and also holds `release/`, so it fails both conditions. The half that stops an export into this folder, or into a clone holding `.git`, is untested.

## gap — KEEP duplicates the kit's Operator-file pattern
Where: release/export.ts:36
Axis: standards and naming

## gap — the word check misses gate, critique and amendment, and the copy still carries them
Where: test/query/probe.int.test.ts:73
Axis: standards and naming

## nit — T-008 still says the trial clones the public repository T-009 publishes
Where: docs/slices/S-005/spec.md:210
Axis: spec and scope

## nit — the slice pattern would refuse dependency names such as slice-ansi
Where: release/export.ts:43
Axis: standards and naming

## nit — the NUL-byte binary rule is never exercised
Where: release/export.ts:134
Axis: standards and naming

## nit — the swap can leave the target half-replaced if a file is locked
Where: release/export.ts:78
Axis: standards and naming

## nit — git ls-files output is not NUL-delimited
Where: release/export.ts:67
Axis: standards and naming

## nit — more-edge-cases.test.ts names a round, not what it tests
Where: test/signin/faults.test.ts:12
Axis: standards and naming
The file has since been renamed faults.test.ts; the line cited is in it.

## nit — the planted-file regex escapes only the first dot
Where: test/export/export.test.ts:64
Axis: standards and naming

## nit — settings.md's DATABASE_URL example still names an Azure host
Where: docs/settings.md:15
Axis: standards and naming

## nit — a doc comment line runs to 152 columns
Where: src/engine/postgres-structure.ts:7
Axis: standards and naming

## nit — .gitattributes does not cover LICENSE, .gitignore or .gitattributes
Where: release/export.ts:85
Axis: standards and naming

## nit — .dev.vars.<env> and .env are not kept on a re-export
Where: release/export.ts:36
Axis: standards and naming

Verdict: hold (0 blockers, 3 gaps, 12 nits)

Reworked in the next commit (D-112, review 5 additions). The product owner chose "Fix all, then one more check".

## Review 6 (2026-11-02): T-009, final check of review 5's rework

Reviewed: commit c6bb38b (db24ccd..c6bb38b) and the clean copy's commit 04f7977, on two axes in separate fresh contexts.
Tests: `npx vitest run test/export test/deploy` → 5 files, 48 passed; in `../sql-mcp`, typecheck clean and 37 files, 239 passed. No `.previous-*` folder was left behind.

Every review-5 finding is resolved but the swap, whose rework introduced the first gap below. Both reviewers found that gap. It is listed once.

## gap — the swap's rollback deletes old files it never moved aside, then says the target was put back
Where: release/export.ts:101
Axis: spec and scope; standards and naming
If moving the old copy aside fails partway, as a locked file on Windows makes it, the catch deletes every staged name from the target, old files not yet moved included. Only the moved ones come back. A failure inside the catch leaves the old files in `<to>.previous-*` inside the repository, and loses the original error. No test reaches this path, so D-112's promise is unproven and false in the case it was written for.

## gap — keep() also matches `.dev.vars.example`, so the check stops reading that shipped file
Where: release/export.ts:39
Axis: standards and naming
`listTree` skips kept names, so a process reference planted in `.dev.vars.example` passes the check. Before the rework, only the exact name `.dev.vars` was kept.

## gap — the copy's .gitignore does not cover the secret files a re-export now keeps
Where: release/export.ts:130
Axis: standards and naming
`.dev.vars.<env>` and `.env` are kept as local secrets, but only `.dev.vars` is ignored, so `git add .` would commit them.

## nit — of the newly caught wording, only "Gate N" is planted in the test
Where: test/export/export.test.ts:61
Axis: spec and scope

## nit — the slice lookarounds let hyphenated process prose through, and gate misses "Gate-2"
Where: release/export.ts:47
Axis: standards and naming

Verdict: hold (0 blockers, 3 gaps, 2 nits)

Reworked in the next commit (D-112, review 6 additions). The product owner chose "Fix all, then a seventh check". One run of the clean copy's suite after the rework had the Workers runtime fail to start in two workerd tests; they passed alone, and the next full run passed, 239 of 239.
