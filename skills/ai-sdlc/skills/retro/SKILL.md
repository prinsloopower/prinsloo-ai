---
name: retro
description: Review a completed round of work against what was actually recorded — what it cost, what needed redoing, where problems were caught — and write down what should change, without changing anything. Part of the software development pipeline; invoked by the sdlc skill.
---

Read `.sdlc/CONTRACT.md` first, then `.sdlc/reference/metrics.md` for what was
measured and what an observation must carry, and `.sdlc/reference/layout.md` —
you read across the whole record rather than from named inputs, so you need to
know what is in it.

Produces: an appended entry in `.sdlc/reflections.md`

Everything you write comes off disk. You were not present for most of this
iteration, and the parts you were present for are the parts you will remember
selectively.

## Read first

1. `.sdlc/scripts/metrics_report.py` — how long each phase took, how much
   rework it needed, and which gate caught how many problems. Every figure
   there was measured. There is no token count, because nothing can observe
   one; where the report shows `tokens` it was supplied by a person and says
   so, and it carries exactly the weight of the person who typed it.
2. The `## Critique findings` sections still sitting in the documents, and every
   `docs/slices/*/review.md`.
3. `questions.md` — which `Q-###` are still open, and how long they have been.
4. `decisions.md` — every `D-###` marked `Decided by: model`. Those are choices
   nobody confirmed.
5. The previous entries in `.sdlc/reflections.md`.

## Write observations, not impressions

Each observation is a `##` heading naming a pattern, with an `Evidence:` line
citing what you read — a metrics figure, a finding, a `Q-###`, a review. An
observation with no evidence is a recollection, and recollections are how a
process improves in the direction of whatever went wrong most recently.

Name the pattern the same way it was named in an earlier iteration if it is the
same pattern. Recurrence is what distinguishes a process problem from a bad day,
and it can only be counted if the name is stable.

```markdown
# Iteration 2 — 2026-08-14

## Slice specs written too far ahead of the build
Evidence: S-004 and S-005 specified in week one; both revised before build
(metrics rework_count 2 and 3). Q-014 opened against S-005 during build.
Cost: two revisions plus a blocked build; slice-spec rework 2 and 3 against
a median of 0.
Candidate change: specify a slice only when it is next.

## The design gate caught nothing
Evidence: metrics defects_found 0 for design across both iterations, while
three review findings traced to missing screen states.
Cost: the longest-running gate in the iteration for no detections; three
defects reaching code.
Candidate change: none yet — same observation as iteration 1, but two
occurrences of "caught nothing" may mean the checklist is aimed wrong rather
than that the gate is useless.
```

## The questions worth answering

**What did this cost, and where?** Give the numbers from the report. A phase
taking a large share of the iteration while catching nothing is the pipeline's
most expensive habit. Where you want to say a phase was expensive, say which
measured figure says so — duration, rework, output size — rather than an
impression of how long it felt.

**Where were defects caught, and where were they introduced?** A finding caught
at its own gate cost one revision. A finding caught at code review that traces to
an ambiguous requirement crossed four gates that were meant to catch it, and that
is the number worth knowing — the gates in between are the ones not working.

**What was decided by nobody?** Every `D-###` marked `Decided by: model` that
reached production is a choice made by default. Some are fine. The ones that are
not tend to be the same kind each time.

**What stayed open?** A `Q-###` open across a whole iteration is either not
blocking anything, in which case it should be closed, or it is blocking something
quietly.

**What did the process cost that it did not need to?** Rework counts, gates that
never failed anything, documents nothing downstream read.

## What you do not do

You do not edit skills, checklists, the contract, or the pipeline. Improving the
process is a separate step with a separate approval, and a retro that edits the
thing it is assessing has no record of what it changed or why.

You do not propose a change on a single occurrence unless it caused real damage.
One bad iteration is a bad iteration. Write the observation, name the pattern,
and let the second occurrence decide.

## Done when

Every observation has an `Evidence:` line and a cost, recurring patterns carry
the names they had last time, and nothing outside `.sdlc/reflections.md` has
changed.
