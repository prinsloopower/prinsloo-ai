# Using ai-sdlc

A working guide. For what the plugin contains, see `README.md`; for why it is
built this way, `BUILDLOG.md`.

## What it does to your repository

On first run it creates `inputs/`, `docs/` and `.sdlc/`. The last one holds the
contract, the phase graph, the scripts and the registers — a copy, not a link,
so the process travels with the repository and survives this plugin being
updated or removed.

Commit all three. The pipeline's memory *is* those files; a colleague who clones
the repo can pick up mid-iteration, and so can you in a fresh session.

## Install

```bash
claude --plugin-dir /path/to/ai-sdlc
```

That loads it for one session. To keep it, run
`claude plugin validate /path/to/ai-sdlc`, then add the parent directory as a
marketplace.

## Starting

```
/ai-sdlc:sdlc
```

The skill name is namespaced by the plugin, so plain `sdlc` will not resolve.

That one skill runs everything. The other fifteen are invoked by it and are not
meant to be called directly — each assumes its inputs have passed a gate, and
calling one out of order hands it material nothing has checked.

## Sizing, which you choose first

| Size | Runs | Use when |
|---|---|---|
| `patch` | one slice: spec, build, review, deploy, verify | a fix or a small change to something that exists |
| `feature` | discovery, a slice backlog, the build loop, retro | a new capability in an existing product |
| `product` | everything, journeys through architecture, before slicing | a new product, or a rebuild |

If you are unsure, size down. A `patch` that turns out to need more can be
stopped and re-run larger; a `product`-sized run on a small change costs a day
of review before anything is built.

At `patch` size nothing writes a backlog, so you will be asked to name the one
slice you are building. You will also be asked for the commands that run your
test suite and a single test, since the phase that normally records those is
part of the larger sizes only. It asks once per repository.

## Starting a patch

A patch has no discovery phase and no PRD to lean on, so everything the work
needs has to come from what you say when you start it. Say four things:

- **What is wrong, or what is missing.** The observable behaviour, not your
  theory about the cause.
- **What "fixed" looks like**, in terms someone could check.
- **Where it lives**, if you know — a file, an endpoint, a module.
- **What must not change.** Existing callers, a public interface, a schema.

A worked example:

> Revoked sessions still work for up to 15 minutes. `revoke()` deletes the
> session from the store, but the API gateway caches session lookups and never
> checks whether the underlying session is gone, so a logged-out user keeps
> making authenticated calls until the cache entry expires.
>
> Fixed means: after `revoke()`, the next request with that session is rejected,
> and in any case within 60 seconds. Everything is in `src/sessions.py` and
> `src/gateway/auth.py`.
>
> Don't change the shape of the session object — three other services read it.
> Tests run with `pytest -q`.

That is enough for the spec phase to write tasks and for the review phase to
have something to check the code against. The thing to avoid is a one-line
request like "fix the session revocation bug", which leaves the pipeline to
invent both the problem and the definition of done, then verify the code
against its own invention.

Say it when you set the slice — it is written to `inputs/` rather than kept
only in conversation, so a session that runs long and resumes fresh can still
find it.

## What actually happens

The router asks the script what runs next, hands control to one skill, and that
skill writes one document. Then a gate runs — usually a *separate* instance that
did not write the document and reads only the document. It returns one of three
things:

- **pass** — the artifact is approved and the pipeline advances.
- **fail** — findings are written into the artifact and the same phase runs
  again to revise it. You are not involved.
- **hold** — something is genuinely undecided and needs you.

Nothing advances past a `hold`, and seven phases require your explicit approval
regardless of what the gate says: discovery, PRD, design, architecture, system
spec, the slice backlog, and final verification.

## Your job

Four things, and nothing else is worth your attention:

**Size the work.** Above.

**Answer holds.** The gate found a gap it cannot close by reasoning. It will
name the gap and what depends on it.

**Approve blocking gates.** Read the artifact and say yes or no. The script
records what you said, verbatim — it refuses to accept a blocking approval
without it, which is a weak defence against rubber-stamping but makes waving
something through a deliberate act.

**Approve process changes.** After enough iterations, the pipeline proposes
changes to its own skills as diffs. Nothing edits itself.

### Answering a hold well

The temptation is to say "use your judgement." That is a real answer and the
pipeline will record it as an assumption with your name on it — but assumptions
compound downstream, which is the failure this whole design exists to prevent.

If you do not know, say you do not know. It becomes a `Q-###` in
`.sdlc/questions.md` and the phase proceeds on the most defensible reading
rather than a confident guess. That is better than a decision you did not
actually make.

## When something looks wrong

**The same artifact fails twice.** The pipeline stops on its own and names the
upstream artifact it suspects. Two failed revisions usually means the phase was
given bad inputs, not that it is writing badly. Go up a level.

**An artifact goes stale.** When you edit a document, everything derived from it
is flagged automatically — the script stores a fingerprint of each phase's
inputs at approval and compares. Stale does not mean wrong; it means nobody has
checked since the change. Re-gate the downstream artifact.

**You want to skip a phase.** Say so. It is recorded as a decision with your
name on it rather than silently omitted.

**You already have a PRD, or a design.** Say that too. If a document exists on
disk but the pipeline has no record of it, it is gated as a fresh draft rather
than assumed good.

**A session runs long.** Stop and start a new one. Everything needed to resume
is on disk, and the pipeline recovers by asking the script where it is — there
is nothing to carry over in conversation. This is the whole point of the design;
use it rather than pushing a long context further.

## Checking on it yourself

```bash
python .sdlc/scripts/sdlc_lint.py
```

Use whichever Python your machine has: `python3` on macOS and Linux, `python`
or `py` on Windows.


Runs outside any session and reports traceability gaps, stale artifacts,
requirements nothing downstream picks up, and restatements between documents.

The summary line is worth reading closely:

```
requirements: 14 (2 untraced, 9 assumed)
```

`assumed` counts requirements with no source in `inputs/`. It is not an error —
on a solo build it is often most of them. It is there so that a clean report
does not start to feel like evidence the product is right. It is evidence the
paperwork is consistent.

For what an iteration cost:

```bash
python .sdlc/scripts/metrics_report.py
```

Duration, rework, and defects caught, per phase. There is no token count;
nothing in the pipeline can observe one, and a made-up number in a table that
drives process decisions is worse than a missing one.

## Between iterations

The retro reads the metrics and writes observations to `.sdlc/reflections.md`,
each with a figure attached. It does not change anything.

Changes come later. When the same observation has appeared in two separate
iterations, the pipeline offers to propose a fix, as a diff, for you to approve.
One bad run never changes a skill — that is how a process accumulates rules
nobody can justify six months later.

## Applying an approved proposal

The proposal in `.sdlc/proposals/` is a diff against this plugin's own files —
never applied automatically, and never written into your product repository.
Approving it is a human gate like any other: it means you agree the diff is
right. Making it real is a separate, manual step after that, and it differs by
how you run the plugin.

**Running via `--plugin-dir`.** Edit the diff into that folder directly. The
next `claude --plugin-dir ...` picks it up — nothing else to do.

**Installed from a marketplace.** A persistent install is a copy, not a live
link to your source. `claude plugin install` copies the plugin into a
versioned cache (`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`),
and `claude plugin update` only refreshes that copy when `.claude-plugin/
plugin.json`'s `version` field has actually changed — edit the plugin's
content with no version bump and `update` reports it already at the latest
version and does nothing, even though the source is different now. So: apply
the diff to your marketplace source (not the installed cache directly — an
edit there works until the next `update` silently overwrites it back), bump
`version`, run `claude plugin update ai-sdlc`, and restart Claude Code to pick
it up.

Either way, the change lives with the plugin install, never in a product
repository — the same `.sdlc/` scaffold works unchanged against whichever
version of the plugin is currently running.

## What this does not do

It does not review its own code with the same instance that wrote it, does not
let a model report its own token usage or approve its own blocking gates, and
does not claim a test works because it passes. Tests are run and observed
failing before their code exists, and the test's source is fingerprinted so an
implementation that edits the test rather than the code is caught.

It also cannot tell you whether you are building the right thing. Every check in
here is about internal consistency. The `assumed` count is the closest it comes
to admitting that, and it is why discovery is a blocking gate.

## Commands

Mostly the router's business, but useful directly:

```
sdlc_lint.py                                   the checks
sdlc_lint.py next                              what runs now, as JSON
sdlc_lint.py init --product NAME               lay down .sdlc/
sdlc_lint.py size patch|feature|product        set the ceremony level
sdlc_lint.py slice S-### --title "..." --brief "..."  declare a slice
sdlc_lint.py commands --test "..." --test-one "... {test}"
sdlc_lint.py gate PHASE --result R --by W      record a gate, advance
sdlc_lint.py red T-### --test N --slice S      observe a test failing
```

## Current state

The mechanics are exercised end to end from an empty directory. The sixteen
skills' instructions are not — nothing here has been run by a model on a real
project. Expect the first run to surface problems in what the phases write
rather than in whether the pipeline advances, and read the early artifacts
harder than you otherwise would.
