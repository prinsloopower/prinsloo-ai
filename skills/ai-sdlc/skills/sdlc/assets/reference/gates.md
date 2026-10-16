# Gates

What each gate returns, what a blocking one requires, and how much pipeline a
change gets. Read by the router and by the gate itself.

Every artifact phase ends at a gate, which returns `pass`, `hold`, or `fail`.

- **Fresh context.** The critique runs in a subagent — or a separate call, in a
  non-Claude-Code orchestrator — that sees the artifact and its checklist and not
  the reasoning that produced it. A model reviewing its own work in the same
  context approves it.
- **Mechanical first.** Coverage, orphan, and staleness checks run as a script.
  Reserve model judgement for what a script cannot decide.
- **`fail`** returns the artifact to `draft` with the findings appended to it.
- **`hold`** stops for a human. Each finding is resolved by revising the artifact
  or by the human dismissing it — and a dismissal is an *edit*, written into the
  artifact as a `Q-###` or `D-###`, not a flag set on the gate. On re-gate the
  finding no longer fires because the content is now deferred on the record.

**Blocking gates require `by: "human"`.** The script refuses a `pass` on one
without `by: human` and a `--quote` of what the person actually said, so a
blocking gate cannot be satisfied by a model deciding the human would have
agreed.

Every gate names a type, and `gates` in `pipeline.json` says what runs:

| Type | What runs | Verdict from |
|---|---|---|
| `model`, `critique` | the critique skill, in a fresh context | its `Verdict:` line |
| `human` | the critique skill, then the person | the person, quoted |
| `tests` | `commands.test` from `pipeline.json` | exit status |
| `smoke` | the `Verified by:` command in the phase's own output | exit status |
| `verdict` | nothing further; the phase is itself the check | its own `Verdict:` line |

`verdict` is not self-approval. It marks a phase whose whole output is a
judgement on someone else's work — the code review — so gating it with another
review would only add a second opinion about the first. No phase gates its own
artifact.

Recording is not gating. Every `Verdict:` line this phase produces — `fail`
included — still goes through `sdlc_lint.py gate review --result <verdict>`
the moment it is stated, before any fix is made. A `fail` here rolls the slice
back two phases the same as any other `fail` does, to the one before whichever
produced the reviewed artifact — typically `build` — which is where the fix
belongs. Fixing the finding and re-running the same critique without ever
calling the script skips the phase past its own gate silently: the round was
real, but `metrics.jsonl` shows a phase that never failed, and the slice's
recorded state never actually returned to `build`.

A `human` gate on a phase whose `skill` is `null` — `verify` is the only one —
skips the critique step. Nothing authors that phase's artifact in advance for
critique to check; the human's own statement is the content, not something
written ahead of them and then reviewed. There is deliberately no checklist
for it under `critique/references/` — go straight to the person.

`commands` holds `test` (the whole suite), `test_one` (a single test, with
`{test}` where its name goes) and `lint`. `test_one` is what records a test
failing before its code exists; without it the build step cannot show that its
tests check anything. It starts empty and is filled at the architecture phase, alongside the
walking skeleton — that is the point where a command to run the tests first
exists. A gate whose command is unset is a gate that does not run, so the lint
says so once a slice reaches `built`.

## Ceremony levels

`size` in state.json selects how much pipeline a change deserves: `patch`,
`feature`, or `product`. The phase list and gap policy for each live in
`pipeline.json`.

At `gap_policy: "auto_defer"`, a gate returning `hold` instead records each gap
as a `D-###` marked `Decided by: model` and passes. The blocking-gate rule below
brings them back: the human verification gate lists every outstanding
model-decided entry before it can be satisfied. One interruption at the end
rather than several along the way.
