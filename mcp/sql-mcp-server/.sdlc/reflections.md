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
