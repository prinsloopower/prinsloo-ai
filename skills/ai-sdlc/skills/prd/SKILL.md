---
name: prd
description: Write a product requirements document: what is in and out of scope, success metrics with a source, sequencing, and non-goals. Part of the software development pipeline; invoked by the sdlc skill.
---

Read `.sdlc/CONTRACT.md` and your phase's entry in `.sdlc/pipeline.json` first.
They give you the layout, the line formats, your inputs and output, and what to
do with anything you find wrong upstream.

Produces: `docs/prd.md`

Your inputs describe the problem. This artifact decides what to do about it.
Refer to upstream material by ID; do not explain it.

If you are about to write what `R-004` means, that is a signal to stop and check
which of two things is true: `R-004` is unclear, in which case raise a `Q-###`
against `discovery`, or it is clear and you are padding.

## What only this artifact decides

**Scope.** Which requirements this iteration addresses and which it does not — with
the declined ones named, not silently absent. *Out* with a reason is a decision;
*out* by omission is a defect the slicing phase inherits.

**Success metrics.** A number and where it is measured from. A metric with no
measurement source cannot be checked at the verification gate, which makes it
decoration. Every journey should be spoken to by at least one metric; a journey
no metric covers has nothing to verify against when its slice ships.

**Sequencing.** What has to work before what, and why. The slicing phase reads
this; without it, slice order becomes arbitrary and the walking skeleton gets
built around whichever slice came first alphabetically.

**Non-goals.** Specific enough to settle an argument. *"Not building a mobile
app"* settles one. *"Not over-engineering"* settles none and is worse than
nothing, because it looks like a boundary.

## What this artifact must not do

**No mechanism.** Storage engines, token formats, protocols, libraries. Naming
one here hands the architecture phase a decision as a given, and it never gets
recorded as a decision or examined as one — which is how security choices end up
made in a product document by nobody in particular. Where a constraint is real,
write the constraint (*"must work behind the customer's SSO"*), not the
implementation.

**No new user claims.** This is downstream of discovery. A statement about what
people will do either traces to `discovery.md` or is an assumption, and an assumption
gets a `D-###` marked `Decided by: model`.

**No restating.** Reference `R-###`, `J-###`, and the terms in
the domain model. Use those terms exactly — a renamed concept here is
inherited by every artifact after it.

## Structure

```markdown
# PRD — <product>

## This iteration
Two or three sentences: which problems from discovery.md are being addressed now,
and the shape of the response.

## Scope
In: R-001, R-002, R-004
Out: R-003 — deferred to iteration 2 pending the legal question in Q-007.
Out: social login — rejected, no revocation path (D-006).

## Success metrics
- Sign-in completion ≥ 92%, from the portal analytics funnel, step 3. Covers J-001.
- Reset tickets < 15/week, from Zendesk tag `pw-reset`. Covers J-002.

## Sequencing
Session revocation depends on sessions being server-side, so J-001 ships before
J-003. Nothing else is ordered.

## Non-goals
- No mobile application this iteration; responsive web only.
- No SSO or SAML; revisit when an enterprise customer requires it.

## Open
- Q-008 — session lifetime after a password change. Architecture to decide and
  record as an ADR.
```

## Deciding versus deferring

Where something is genuinely undecided, say so as a `Q-###` and name the phase
that will decide it. Deferring on the record is how this pipeline is meant to
work. Leaving it out entirely is what the gate exists to catch, and the gap will
be filled by whichever later phase notices first, without a decision being made
by anyone.

## Done when

Every requirement in `discovery.md` is either in scope or explicitly out with a
reason, every metric has a number and a source, every journey is covered by a
metric, non-goals would settle an argument, and `.sdlc/scripts/sdlc_lint.py` reports no
findings for `prd`.
