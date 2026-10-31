# Review — S-004

## Review 1 (2026-10-30)

Reviewed: commits d57c8b5 to 0aacb67 (9378dd3..0aacb67) against the slice spec, on two axes in separate fresh contexts.
Tests: `npm test` → 40 files, 223 passed, 0 failed; `npx tsc --noEmit -p .` → clean.

The spec-and-scope reviewer also checked every Question's reference SQL against its stated definitions, with read-only spot checks on Docker, and found no expected answer wrong.

## gap — The live run (T-010) has not been made, so the Delivers measurement does not exist yet
Where: docs/slices/S-004/spec.md:236
Axis: spec and scope
No commit satisfies T-010 or the "Live, on the project test Deployment" Proven-by lines. There is no `bench/reports/` report, and the spec records no correctness, give-up or cost figures. The code path for it is all in place: run.ts → signIn → connectServer → runBenchmark → buildReport → writeReport. T-010 is a manual task made after deploy, so it stays outstanding for verification.

## gap — README's "from the repository root" fails from a clean checkout
Where: bench/README.md:22
Axis: spec and scope
README lines 13 and 22 say to run `npm install` and `npm run benchmark` from "the repository root". The git root is `prinsloo-ai`, which has no package.json; the package is `mcp/sql-mcp-server`. Following T-011's check from a clean checkout gives an npm error.

## gap — Keeping the fixtures as `sqlmcp_test_s003`, and loading the sample in compact form, are not in the register
Where: docs/slices/S-002/deploy.md:19
Axis: spec and scope
D-092 and the spec say the sample replaces the S-002/S-003 fixtures. The connector declined `DROP SCHEMA`, so the fixtures were renamed to `sqlmcp_test_s003` in the shared Supabase project, and the sample's two large INSERTs were sent compactly. Both are recorded only in commit 38654c0 and the deploy-record notes, not as a D-###. A later slice, or a cleanup of the test Database, won't know why that schema exists.

## gap — The version test bypasses the Worker adapter, so the `VERSION_METADATA` mapping is untested
Where: test/bench/version.test.ts:14
Axis: spec and scope
`server_version_names_worker_version` injects `serverVersion` into `createApp` directly and never runs `src/worker.ts:28`, where `env.VERSION_METADATA.id` is read. If the adapter read the wrong field or dropped the spread, the test would still pass and every report would name the bare package version. That is the release-identity defect the spec's gate 1 raised.

## gap — The no-secrets test cannot fail if run.ts stops passing the real secrets, and run.ts misses some
Where: bench/run.ts:91
Axis: spec and scope
`report_holds_no_tokens_or_keys` hands `buildReport` its own secrets and proves only that the redactor works. run.ts passes `ANTHROPIC_API_KEY` and the issued tokens. It does not pass the cache's `clientId`, or a credential that came from an `ant auth login` profile or `ANTHROPIC_AUTH_TOKEN`, which the spec allows. If an API error echoed one of those, it would reach the committed report.

## gap — A failed reconnect during token renewal makes every later Question an error
Where: bench/run.ts:50
Axis: standards and naming
Renewal closes the old connection (line 50) and moves `expires` forward (line 52) before `connectServer` succeeds (line 53). If that throws, `connection` is the closed client and `expires` looks fresh, so renewal never retries. Every remaining tool call fails as "Server failure", and one transient fault becomes a run of errors in the report.

## gap — The browser Sign-in can wait forever, including part-way through a run
Where: bench/src/signin.ts:69
Axis: standards and naming
`await loopback.result` has no timeout. When a cached Refresh token is refused (line 38), signIn falls through to a browser Sign-in without saying why. The renewal in run.ts can therefore open a browser in the middle of a paid run and block indefinitely if nobody is watching.

## gap — The Judge is more lenient than the spec's rules
Where: bench/src/judge.ts:61
Axis: standards and naming; also raised as a nit on spec and scope
The spec says text compares ignoring case, "surrounding spaces" and a trailing full stop, and that Markdown is removed "around the line and the value". `text()` removes every whitespace character, so `OliveOil5L` matches `Olive Oil 5L`, and line 17 deletes every `` ` ``, `*` and `_` anywhere in the line. No current answer is misjudged, but the correctness figure the PRD metric reads rests on a looser rule than the one agreed, untested and undocumented.

## gap — Tool names and the refusal prefix are copied as literals, not taken from the Server
Where: bench/src/harness.ts:19
Axis: standards and naming
`REFUSED` and the literals `"list_tables"` and `"query"` (lines 127–128) duplicate `LIST_TABLES`, `QUERY` and the Refusal sentences in src/tools. The harness tests use their own copies too. If the Server renamed a tool or reworded the prefix, the tests would stay green, while a live run counted no queries and no refusals and reported a 0% give-up share.

## gap — `close()` in the build script checks ties and closes nothing
Where: bench/build-sample.ts:21
Axis: standards and naming
In a script that also holds a pg client and ends it, `close()` reads as connection teardown. It actually returns the Questions whose tie check fails. A name such as `failedTieChecks` would say what it does.

## nit — Two error outcomes the spec doesn't list
Where: bench/src/harness.ts:116
Axis: spec and scope
`max_tokens` with a tool call pending, and an exception from `tools/call`, both end a Question as an error, which the spec doesn't name. A `max_tokens` reply with no tool call is judged instead, and counts as incorrect. None of this is recorded, and the split decides how failures are triaged.

## nit — Exit 0 when the token ceiling stops the invocation
Where: bench/run.ts:97
Axis: spec and scope
The interface says exit 0 means every run completed. A run cut short by the ceiling still exits 0, so a calling script can't tell it from a full one.

## nit — The `,`/`=` rule isn't checked on product categories
Where: test/bench/sample.int.test.ts:69
Axis: spec and scope
The check covers `.name` only. `products.category` supplies B-17's map keys and B-32's answer, so a reseed could break map parsing without failing the test.

## nit — Stop messages hard-code the cap values
Where: bench/src/harness.ts:57
Axis: standards and naming
"8,000,000 input tokens per run", "400,000 input tokens" and "20 model turns" restate the constants as text. Change a constant and the report names the old cap.

## nit — Role setup and the array-mode row reader are duplicated
Where: bench/build-sample.ts:18
Axis: standards and naming
The `CREATE ROLE sqlmcp_reader` block and the `rows` helper appear both here and in test/bench/sample.int.test.ts. They will drift from `as()` in test/query/pg-fixture.ts.

## nit — One value, two names
Where: src/mcp.ts:144
Axis: standards and naming
`Deps.serverVersion` in src/app.ts becomes `workerVersion` in `handleMcp`. They are the same value, and `workerVersion` is the accurate name.

## nit — The Windows browser command relies on the URL holding no `"`
Where: bench/src/signin.ts:142
Axis: standards and naming
`cmd /c start "" "${url}"` with verbatim arguments is safe only while the origin has no `"`, `&` or `%`. A crafted Deployment URL is stopped today only because the registration fetch runs first and fails. Using `rundll32 url.dll,FileProtocolHandler`, or rejecting such origins, would remove the reliance.

## nit — The cache file's 0600 mode applies only at creation, and never on Windows
Where: bench/src/signin.ts:111
Axis: standards and naming
On POSIX an existing file keeps its mode; on Windows the mode is ignored. The 30-day Refresh token is only as private as the checkout folder, though the code reads as owner-only.

## nit — An invalid Deployment URL crashes with a stack trace
Where: bench/run.ts:27
Axis: standards and naming
`new URL(url)` runs outside the usage checks, so a typo gives an uncaught TypeError rather than the usage message and exit 2.

## nit — The progress counter never reaches its total
Where: bench/run.ts:70
Axis: standards and naming
Only final replies count as "answered". Questions that end given up, in error or not reached never increment it, so the counter looks as if the run stopped early.

Verdict: hold (0 blockers, 10 gaps, 10 nits)
