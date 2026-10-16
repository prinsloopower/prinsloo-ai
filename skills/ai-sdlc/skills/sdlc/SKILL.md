---
name: sdlc
description: Run or resume the software development pipeline, from discovery through to deployment and review. Start here.
disable-model-invocation: true
---

You hold the **baton**. Exactly one skill runs at a time; when it finishes,
control returns here. The graph lives only in this file and in `pipeline.json` —
no skill in the suite names another.

## Every run starts the same way

1. If `.sdlc/` does not exist, run:

   ```
   python3 "${CLAUDE_PLUGIN_ROOT}/skills/sdlc/scripts/sdlc_lint.py" init --product NAME
   ```

   If that path does not resolve, use this skill's own directory — the script
   finds the files it copies relative to itself. It lays down the contract, the
   references, the graph, the scripts and the empty registers, so everything the
   pipeline needs at runtime lives in the repo and no later phase depends on
   this plugin being installed.
2. Read `.sdlc/CONTRACT.md`, then `.sdlc/reference/state.md`,
   `.sdlc/reference/gates.md` and `.sdlc/reference/metrics.md`. You are the only
   step that needs all three: you report position, run gates, and record what
   each phase cost.
3. Run `.sdlc/scripts/sdlc_lint.py next`. It returns what runs now, the paths
   that phase reads and writes, its gate, and the current findings.

   Invoke it with whichever Python the machine has — `python3` on macOS and
   Linux, usually `python` or `py` on Windows. Establish which one works on the
   first call and use it for every call after; a phase that stalls on a missing
   interpreter looks exactly like a phase that failed.
4. Report position in three lines: current phase, findings, what is blocking.
   Then hand off the baton.

Do not read `state.json` to work out where you are, and never write it. It holds
measurements — hashes, elapsed times, revision counts — and a model that reports
a measurement has invented one. `next` and `gate` are the only two ways the
pipeline moves.

## Sizing

Before the first phase of an iteration, set `size` with
`sdlc_lint.py size patch|feature|product`. If the human has not said, propose one
from the scope of what they asked for and confirm before setting it. `next` asks
for it when it is missing.

## The pipeline

`next` resolves the order, the per-slice repetition and the ceremony level. Hand
the baton to the `skill` it names, give that skill the `output` and `inputs` it
returns, then run the gate named in `gate_spec`.

`inputs_not_produced` lists dependencies this size skips. Pass it on. A phase
told only what it is missing can say so in a `D-###`; a phase given a path to a
file that will never exist tends to imagine its contents instead.

Three actions are not a phase. `action: size` wants the ceremony level set.
`action: slice` means the size is below the one that writes a backlog, so the
single slice has to be named before anything can be built:
`sdlc_lint.py slice S-### --title "..." --traces R-###`. At this size there is
no discovery phase to record what the human actually asked for, so pass it as
`--brief "..."` — the observable problem, what fixed looks like, where it
lives, what must not change — and the script writes it to `inputs/`, where a
resumed context can find it. `action: commands`
means the gates have no way to run the tests — normally recorded during
architecture, which the smaller sizes skip. Ask the human for the project's test
commands rather than guessing them from the repository.

## Gate handling

Report every gate through the script:

```
sdlc_lint.py gate <phase> --result pass|hold|fail --by human|model|script \
    [--slice S-###] [--quote "..."] [--note "..."]
```

- **pass** — the script records it, hashes the upstream, appends the metrics
  line, and returns the next step. A blocking gate is refused unless `--by
  human` and `--quote` carry something the person actually said.
- **fail** — append the findings to the artifact under a `## Critique findings`
  heading before reporting, then hand the baton back to the same skill. Findings
  go in the file; the revising skill may be running in a fresh context.
- **hold** — stop and bring the gaps to the human, one at a time, with the
  downstream consequence each one names. Their answer either directs a revision
  or becomes a `Q-###`/`D-###` written into the artifact. Then re-gate.

Two **failures** on the same artifact means the fault is upstream. The script
counts them; when `rework_count` reaches two, stop, say so, and name the
upstream artifact you suspect. Holds do not count; a well-made artifact holds on
its first gate as a matter of course.

## Timing

`duration_s` is meant to be the phase's own working time, not the time spent
waiting on the human. The instant you end a turn with nothing left to do until
they answer, approve, or merge something — call `sdlc_lint.py wait` before you
stop. Whatever you call next, whenever that is, closes it automatically; there
is no separate call to resume. A turn that ends because you are mid-build, or
a command is still running, is not a wait — only call it when the next move is
theirs, not yours.

## Resuming, and entering mid-pipeline

The human may enter at any phase — "pick up where we left off", "just do the
retro", "we already have a PRD, start from design". Honour it, reporting first
any upstream artifact the findings mark absent or stale, then let them choose.
Log an explicit skip as `D-###`.

If an artifact exists on disk but not in the state, adopt it: gate it as a fresh
draft rather than assuming it passed.

## Improving the process

`improve` is in no size's phase list. It runs when there is something to run it
on: `next` reports `improve_available` at the end of an iteration, listing the
observations recorded under the same heading in two or more iterations. An empty
list means nothing qualifies. A non-empty one is worth offering, whatever size
the iteration was — a small change surfaces process problems as readily as a
large one, and tying the proposal step to the largest ceremony level means it
almost never runs.

## When context runs long

Stop mid-iteration rather than pushing through. Everything needed to resume is
on disk, so the next context recovers by running `next`; there is nothing to
carry across in conversation.

## What belongs to the human

Sizing, blocking gates, decisions marked `Decided by: model` awaiting
confirmation, and every skill diff `improve` proposes. Bring these directly and
wait.
