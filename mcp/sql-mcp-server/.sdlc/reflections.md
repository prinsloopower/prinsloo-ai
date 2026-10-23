# Iteration 1 — 2026-10-20

Size product. Phases discovery through slices, then one slice (S-001, Sign-in) built, reviewed, deployed and verified. Figures come from `metrics_report.py` and `metrics.jsonl` unless stated otherwise. Finding counts come from the `Critique findings` sections in `docs/`, `docs/slices/S-001/review.md` and `.sdlc/verification/S-001.md`.

## The defect count measures nothing
Evidence: metrics `defects_found` is 0 on all 42 gate lines. The documents hold 15 blockers and 59 gaps written there by their gates: discovery 7/13, domain 4/6, journeys 2/11, prd 1/8, system-spec 1/2, slices 0/5, S-001 spec 0/14. The code review added 18 more gaps in two rounds. `count_findings` in `sdlc_lint.py` matches only headings (`### blocker`), while every gate wrote bullets (`- **gap — …**`). The domain model's section is `# Critique findings`, which the `^##+` split never finds anyway.
Cost: the one figure meant to show where defects were caught is blank for the whole iteration, so `improve` has no measured basis for any gate. Every "which gate works" judgement below is a hand count.
Candidate change: make `count_findings` and the critique skill's output format agree (count `**blocker`/`**gap` bullets, or have the critique write headings), and accept `#`-level section headings. This is proposed on one occurrence because it silently removed a whole metric, and the damage is real.

## Holds are counted as rework
Evidence: gates.md says "Holds do not count; a well-made artifact holds on its first gate". Yet `rework_count` rises on every hold: discovery reached 5 after 4 fails and 1 hold, slice-spec S-001 reached 3 after 3 holds and no fails, and review S-001 reached 2 after 2 holds. The report's TOTAL rework of 65 also sums the cumulative counters line by line, so discovery shows 20.
Cost: the "two failures means the fault is upstream" rule reads a hold-heavy phase as failing. Here it would have fired on slice-spec S-001, which never failed. The headline rework figure overstates by roughly three times.
Candidate change: none yet. Write the observation and let a second iteration confirm.

## Duration measures the calendar, not the work
Evidence: `duration_s` for architecture's hold is 530,733 (6.1 days), system-spec's fail is 44,937 (12.5 hours) and deploy is 6,998. Each spans sessions with nobody working. Sixteen of 42 lines have no duration, because a re-gate has no `next` to time from.
Cost: the report's 9,843-minute total is mostly idle time, and phase costs cannot be compared.
Candidate change: none yet.

## Re-approving the backlog discards declared slices
Evidence: the slices gate passed at 2026-10-19 (D-063/D-064 amendment) and again at 2026-10-20 (after the S-001 second review). The second time, `state.json` lost S-001, which was then at build-passed and review-hold. The gate refusals on record read "no slice 'S-001' in state". S-001 was re-declared and its slice-spec, build and review gates were recorded again (commit 318ca63).
Cost: one round of four gate re-recordings and a re-run of the full suite. Worse, it forced a choice to *avoid* fixing the system spec when it was found stale: three wording corrections are parked in Q-026 (D-072 loopback rule, D-073 Google, the refresh wording that was fixed) rather than re-gating.
Candidate change: re-gating an unchanged slice list should keep declared slices, or a slice should be dropped only when its line in the backlog changed. Proposed now, because it happened within this iteration and has already shaped decisions.

## Upstream corrections cascade into re-gates
Evidence: D-063 (scope narrowed to two pairings) amended the PRD, four ADRs, the overview, the components and the system spec, and all were re-gated in one approval. Two later corrections were deferred instead of applied: Q-026 (security.md's redirect rule; the slice list's and ADR-004's Google wording), and D-070's note on environments.md, applied only at the second review.
Cost: three known wording defects in gated documents now outlive the iteration. They were left in place because the honest fix costs a re-gate cascade.
Candidate change: none yet. It overlaps the previous observation, and the next iteration will show whether it stands alone.

## Each critique round found a deeper layer
Evidence: the S-001 slice-spec held three times, with 6 gaps, then 5, then 3. None repeated, and each was one level further into OAuth: refresh bindings, then ID token on refresh, then the authorize error page. The code review held twice, with 13 gaps then 5. Gate 3 was passed on the product owner's word to stop the regress. The defect that mattered most, loopback redirect ports (RFC 8252, D-072), passed all five of those reviews and was caught only in live verification.
Cost: five critique and review rounds on one slice, about 18 subagent runs across the iteration. The live-only defect cost a fix, a re-review and a redeploy after verification had started.
Candidate change: none yet. One slice is one occurrence. Watch whether S-002 shows the same deepening. If it does, the checklists may need a "known protocol pitfalls" item rather than more rounds.

## The live check caught what the gates could not
Evidence: verification found the loopback-port refusal (D-072) and the Google requirement being dropped (D-073). It also confirmed two things every gate had to assume: Entra's refresh response carries an ID token, and Claude prefers Client ID Metadata Documents. The live sign-in smoke check also caught nothing wrong because it reached Entra's own page. That check was written at deploy, not specified earlier.
Cost: one redeploy. Without the live run, ChatGPT desktop would have shipped broken.
Candidate change: none yet.

## Tests guarding existing behaviour cannot be recorded red
Evidence: seven tests passed on their first run because the behaviour was already right: two from the walking skeleton at build, four guards the review asked for, one at the second review. Each was recorded failing only against a deliberate, reverted break (D-070 records it). Separately, four tests edited after their first record had to be re-recorded the same way.
Cost: about 11 extra red recordings by mutation, each a code edit and a revert that the process does not track except in prose.
Candidate change: none yet. If it recurs, `red` could accept a named mutation and record it, rather than leaving it to D-### prose.

## The lint fails on Windows
Evidence: `sdlc_lint.py red` crashed with UnicodeDecodeError. `test_body` walks every `test` folder under `node_modules`, and `read()` cannot decode a binary file found there, under either cp1252 or UTF-8. Running in UTF-8 mode instead made seven gated documents read as stale, because their stored hashes were taken under cp1252. All recording since S-001's build has gone through a scratchpad wrapper that only tolerates undecodable bytes.
Cost: the build stopped until the wrapper existed. Every later lint call depends on a file outside the repository.
Candidate change: `read()` should tolerate undecodable bytes, and `test_body` should skip `node_modules`. Proposed now, because the pipeline cannot run on Windows without it.

## A rejected alias collides with a SQL keyword
Evidence: "ceiling", rejected as a name for Boundary, matches T-SQL's `CEILING` function in security.md. It has been reported on every lint run since the system spec (gates 1 and 2 of system-spec judged it a false positive), and it is still present.
Cost: a standing finding that every gate has to explain away, which trains readers to ignore lint output.
Candidate change: none yet beyond the obvious one, which is to skip code spans when checking rejected names. The improve step can take it if it recurs.

## What nobody decided
Evidence: no `D-###` is left `Decided by: model`. But several were confirmed as a batch in a single word: "Confirmed" for D-050 to D-059 at the system-spec gate, and D-070 at verification, which covers 20 build choices.
Cost: none measured. A batch confirmation records consent, not scrutiny.
Candidate change: none.

## What stayed open
Evidence:
- Q-007 (the cost of the analyst queue) has been open since discovery and blocks nothing.
- Q-015 (an Allow-list carried in managed configuration) has been open since journeys. It is now overtaken by Q-027 (request headers), which blocks S-002's spec.
- Q-022 (the Azure SQL test environment) blocks S-006.
- Q-024 (workerd cold start) and Q-026 (deferred wording) are open.

Cost: Q-007 has lived the whole iteration without blocking anything.
Candidate change: none.

## Shell quoting on Windows breaks commands
Evidence: the Bash tool's wrapper failed on four heredocs, and one of them lost the critique findings, so the system-spec gate-1 fail was recorded before its findings were written. PowerShell 5.1 split arguments containing quotes three times: two commit messages and a gate `--quote`. These are environment problems, not process ones.
Cost: one gate recorded out of order, and about eight retried commands.
Candidate change: none for the process. Running Python and git through files (`-F`, message files) avoided it.

# Iteration 2 — 2026-10-22

The D-074–D-081 amendment (the Allow-list became the Database account's grants) re-gated discovery through slices. Then one slice, S-002 (listing tables from grants), was specified, built, reviewed, deployed and verified. Figures come from the 17 `metrics.jsonl` lines after iteration 1's retro, which the script still labels iteration 1 (Q-028). Finding counts come from the documents, `docs/slices/S-002/review.md` and `.sdlc/verification/S-002.md`.

## The defect count measures nothing
Evidence: `defects_found` is 0 on all 17 iteration-2 lines. The S-002 spec alone holds 3 blockers and 6 gaps written by its gates. The code review found 1 blocker and 3 gaps across two rounds, but `review.md` writes findings as `### ` headings without a severity word at the start, so the counter misses those too. This is the same cause as iteration 1: the counter and the critique's output format disagree.
Cost: for two iterations, no gate's catch rate has been measured, so `improve` can argue only from hand counts.
Candidate change: make `count_findings` read the critique's bullet format (`- **blocker —`, `- **gap —`) and the review's, and accept `#`-level sections. It recurs, and the damage is real.

## Holds are counted as rework
Evidence: slice-spec S-002 shows rework 2 after one fail and one hold. Review S-002 shows rework 2 after one fail and one hold. Re-gated upstream phases also carry iteration 1's counters into iteration 2, so discovery reads rework 5 on a pass in which nothing failed.
Cost: the "two failures means the fault is upstream" rule would have fired on both S-002 phases, which each failed once. Rework figures cannot be compared between iterations.
Candidate change: count only fails in `rework_count`, and reset counters when an iteration opens (see Q-028). It recurs.

## Duration measures the calendar, not the work
Evidence: slice-spec S-002's fail shows 29,051 s (8.1 h, overnight) and its hold 4,118 s. Nine of the 17 lines have no duration at all: re-gates, and passes recorded right after a hold.
Cost: nothing in iteration 2's cost can be read from duration.
Candidate change: time from the phase's first `next` to the gate within one session, or record active time from the orchestrator. It recurs.

## Re-approving the backlog discards declared slices
Evidence: the slices gate passed on 2026-10-21 after D-074. `next` then answered "a product-sized iteration builds one slice and none is declared", and S-001's verified record was gone from `state.json`. This is the third time across two iterations.
Cost: smaller than in iteration 1, because S-001 was finished. It again shaped decisions, though: six wording corrections were parked in Q-030 so that the slice list would not be re-gated while S-002 was declared.
Candidate change: keep declared slices whose backlog line is unchanged when the backlog is re-gated. It recurs.

## Upstream corrections cascade into re-gates
Evidence: D-074 amended 16 files and re-gated 8 phases in one approval. Afterwards, Q-030 collected six wording corrections owed by S-002 and the review: the domain's Typed tool, `unsafe_account` in data-model.md, Hyperdrive caching in environments.md, D-080's mapping, and D-081's four rules. None was applied, to avoid another cascade.
Cost: the system spec and domain model now trail eight decisions (D-078–D-081). S-003, which builds on them, will be specified against documents that are knowingly behind.
Candidate change: allow a recorded "erratum" amendment that edits a gated document without staling its dependants when only wording traceable to an approved D-### changes. It recurs.

## Each critique round found a deeper layer
Evidence:
- The amendment's consistency critique: fail (3 blockers), fail (2 major), then a focused pass.
- S-002 spec: fail (3 blockers), then hold (2 gaps).
- S-002 code review: fail, then hold.

The review's blocker, column types naming hidden schemas and tables through `format_type`, came in with the spec's own Visibility text and passed both spec critiques. Its second-round gap, the account check judged for `current_user` rather than the login role, passed three reviewers before the fourth reproduced it.
Cost: 7 critique and review rounds for one slice plus one amendment, about 10 subagent runs. Two security defects reached code.
Candidate change: give the slice-spec checklist a "protocol and engine semantics" item. For a security boundary, the spec names the engine behaviour it relies on (privilege inheritance, type printing, `SET ROLE`), and the critique checks each against the engine. It recurs: the S-001 OAuth layers in iteration 1, the PostgreSQL privilege layers here.

## Tests guarding existing behaviour cannot be recorded red
Evidence: in S-002, `no_audit_for_initialize_or_tools_list` and `sort_is_code_point_not_collation` passed on their first run, and were recorded failing only against deliberate, reverted breaks. Three tests edited after their first record were re-recorded the same way: two because the fake hidden table `staff` collided with the `staff` field. That makes 5 mutation records, after 11 in iteration 1.
Cost: 16 extra recordings over two iterations, tracked only in D-070 and D-078 prose.
Candidate change: let `sdlc_lint.py red` take a named mutation (a file and a replacement), apply it, run the test, record the failure with the mutation, and revert, so the record shows what was broken. It recurs.

## The lint fails on Windows
Evidence: all 37 S-002 red records, and every `next` call since S-001's build, ran through the scratchpad wrapper. Without it, `test_body` still crashes on binary files under `node_modules`.
Cost: the pipeline depends on a file outside the repository, which another machine or session would not have.
Candidate change: `read()` tolerates undecodable bytes, and `test_body` skips `node_modules`. It recurs.

## A rejected alias collides with a SQL keyword
Evidence: "system-spec: uses 'ceiling'" was reported on every lint run in iteration 2, and every gate and reviewer prompt had to say it was a false positive.
Cost: a standing finding that teaches everyone to skim lint output.
Candidate change: skip code spans (backticks and fenced blocks) when checking rejected names. It recurs.

## Shell quoting on Windows breaks commands
Evidence:
- PowerShell 5.1 split quoted arguments in two commit messages and one gate `--quote`.
- `${s}` was interpolated inside a search string, and a backtick one-liner was mangled.
- Each was redone through a file (`git commit -F`, a `.cjs` script, the Edit tool).

Cost: about six retried commands. These are environment problems, not process ones.
Candidate change: none for the process.

## Secrets passed as arguments land in logs
Evidence: during S-002's T-007, the generated `sqlmcp_reader` password was passed to `wrangler hyperdrive update` as an argument through `npx`. npm's debug log for that run (`npm-cache/_logs/…-debug-0.log`) recorded it in plain text, and it was found and deleted (deploy.md).
Cost: a database password on disk for about two minutes. It was found only because it was looked for.
Candidate change: the deploy skill's guidance should pass secrets on standard input or through environment variables, never as arguments, and check npm's logs after any command that handled one. Proposed now on one occurrence, because the damage was real.

## Bulk edits to documents by script are fragile
Evidence: a scripted section replacement in `domain-model.md` deleted its whole `# Critique findings` history (72 lines), because the single-`#` heading was not a section boundary. It was restored from git. The same pass left `adr.md` with mixed line endings (127 CRLF, 10 LF) until it was normalised. The architecture documents are CRLF and every other document is LF.
Cost: two repairs, and a deletion of gated history that a diff check happened to catch.
Candidate change: none yet. If it recurs, normalise every document's line endings once and have edits go through a tool that edits by anchor rather than by section split.

## Cross-cutting critiques leave no gate record
Evidence: the D-074 amendment's three consistency critiques (fail, fail, focused pass) appear nowhere in `metrics.jsonl`. They covered no single phase, so the only record is the 8 passes logged afterwards with one quote.
Cost: the costliest review of iteration 2 is invisible to the metrics, and to any `improve` argument about it.
Candidate change: none yet. If amendments recur, the pipeline needs an `amendment` gate kind that records against the decision.

## What nobody decided
Evidence: no `D-###` remains `Decided by: model`. D-077 was confirmed in the amendment approval, and D-078 to D-080 in one sentence at S-002's verification.
Cost: none measured. Batch confirmation recurs, which records consent rather than review.
Candidate change: none.

## What stayed open
Evidence:
- Q-007 (the cost of the analyst queue) has been open since discovery, through both iterations, and blocks nothing.
- Q-022 (the Azure test environment) blocks S-006.
- Q-029 (Created-object ownership on SQL Server) blocks S-012.
- Q-024, Q-028 and Q-030 are open process or wording items.

Cost: Q-007 has blocked nothing for two iterations.
Candidate change: close Q-007 as "no metric this release" by a D-###, at the next PRD revision.
