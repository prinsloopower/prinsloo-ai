# ai-sdlc

A gated software development pipeline for Claude Code: discovery through to
deployment, with mechanical traceability checks between every step and a retro
that proposes improvements to the pipeline itself.

## Install

Try it in one session without installing. Open a terminal **in the repository
you want to work on**, not in this folder — the pipeline scaffolds itself into
whatever directory you start from:

```bash
# macOS / Linux
claude --plugin-dir ~/tools/ai-sdlc

# Windows, PowerShell or CMD, including the VS Code terminal
claude --plugin-dir C:\Users\you\tools\ai-sdlc
```

Point it at the folder containing `.claude-plugin`, not at the folder above it.

To keep it, add the directory containing this plugin as a marketplace, or copy
it under `~/.claude/plugins/`. Plugin skills are namespaced, so the entry point
is `/ai-sdlc:sdlc`.

Run `claude plugin validate /path/to/ai-sdlc` before distributing it.

`USER-GUIDE.md` covers running it: what your job is, how to answer a hold, what
to do when an artifact goes stale, and how to check on the pipeline yourself.

## Use

```
/ai-sdlc:sdlc
```

That one skill holds the baton and hands off to the other fifteen. The rest are
model-invoked and are not meant to be called directly — calling them out of
order skips the gate that makes their inputs trustworthy.

On first run in a repository it lays down `.sdlc/`, which holds the contract,
the phase graph, the scripts and the registers. Everything the pipeline needs at
runtime lives in the repository from that point on, so the work survives this
plugin being updated or uninstalled.

## Sizes

| Size | Runs |
|---|---|
| `patch` | one named slice: spec, build, review, deploy, verify |
| `feature` | discovery and a slice backlog first, then the build loop, then a retro |
| `product` | the full pipeline, journeys through architecture, before slicing |

Below `feature` there is no phase that writes a backlog, so name the slice
yourself when asked.

## What the scripts do

`.sdlc/scripts/sdlc_lint.py` is the pipeline's state machine, not a linter with
a side job. It answers what runs next, records gate results, hashes upstream
inputs to detect staleness, observes tests failing before their code exists, and
reports traceability gaps. Nothing else writes `.sdlc/state.json` — the fields
it holds are measurements, and a model reporting a measurement is guessing.

```
sdlc_lint.py                                   the checks
sdlc_lint.py next                              what runs now
sdlc_lint.py gate PHASE --result R --by W      record a gate, advance
sdlc_lint.py red T-### --test N --slice S      observe a test failing
sdlc_lint.py init --product NAME               lay down .sdlc/
sdlc_lint.py size feature                      set the ceremony level
sdlc_lint.py slice S-### --title "..."         declare a slice to build
sdlc_lint.py commands --test "..."             tell the gates how to run tests
```

`scripts/suite_lint.py` checks this plugin's own skills against the contract.
It is a development tool and plays no part in running the pipeline.

## Status

The pipeline mechanics are exercised end to end. The sixteen skills' prose is
not — no skill here has been invoked by a model in anger. Expect the first real
run to surface problems in what the phases write rather than in whether the
pipeline advances. `BUILDLOG.md` records every design decision and the reasoning
behind it.
