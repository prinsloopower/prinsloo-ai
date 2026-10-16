---
name: critique
description: Review one pipeline document against its checklist and return a verdict: pass, send back for revision, or stop for a human decision. Invoked by the sdlc skill after each step.
---

Read `.sdlc/CONTRACT.md` first, for the line tokens, and
`.sdlc/reference/gates.md` for what your verdict means and what the ceremony
level does to it. Assume you have never seen this product.

You are reviewing an artifact you did not write.

If you can see in your context the reasoning that produced this artifact, you are
in the wrong context to judge it. Spawn a subagent, give it the artifact path and
this skill, and return its verdict. In an orchestrator without subagents, this is
a separate call whose message history contains the artifact and nothing else.

## Run

1. Read the artifact. Read `references/<phase>.md` for its checklist. Take
   `size` and its `gap_policy` from `sdlc_lint.py next`. If no
   checklist exists for this phase, say so and stop — a checklist you invent on
   the spot is not a gate.
2. Run `.sdlc/scripts/sdlc_lint.py` first if it has not already run this phase, and
   treat its output as findings you do not need to repeat. Coverage, staleness,
   and orphan checks belong to the script; spending model attention on them is
   waste.
3. Answer **every** checklist item explicitly, in order. An item you leave
   unanswered is recorded as `gap: checklist item N unanswered`.
4. Write the findings into the artifact under `## Critique findings`, then state
   the verdict.

## What counts as a finding

Every finding carries three things:

- **Evidence** — a quote from the artifact, or the exact location where the
  missing thing should have been.
- **Downstream consequence** — the specific wrong work a later phase will
  produce because of this. Name the phase.
- **Severity** — `blocker`, `gap`, or `nit`.

A finding that cannot name a downstream consequence is not a finding. Drop it.
This is the filter that separates *"R-004 is ambiguous about whether sessions
survive a password change, so the architecture phase will pick one and the
system spec will encode it as fact"* from *"R-004 could be clearer."*

| Severity | Meaning |
|---|---|
| `blocker` | A later phase will produce wrong work, not merely incomplete work. |
| `gap` | Content is missing, so a later phase will invent it. |
| `nit` | Cosmetic. Recorded, never affects the verdict. |

Missing content is **not** a gap when the artifact defers it explicitly, with a
`Q-###` or a `D-###`. Deferring a decision on the record is how this pipeline is
meant to work; deciding by omission is what this gate exists to catch.

## Verdict

The verdict follows from the findings. You do not choose it.

- Any `blocker` → **fail**
- No blockers, one or more `gap` → **hold**
- Otherwise → **pass**

`fail` is yours to hand back: the authoring skill revises without a human.

`hold` belongs to a human — unless `pipeline.json` gives this `size` a
`gap_policy` of `auto_defer`, in which case write each gap into the artifact as a
`D-###` marked `Decided by: model`, append it to `decisions.md`, and return
`pass`. Nothing is waved away: the human verification gate at the end of the
slice lists every outstanding model-decided entry before it can be satisfied.

On `hold`, each gap is resolved one of two ways — the artifact is revised to fill
it, or the human dismisses it. A dismissal is written into the artifact as a
`Q-###` (acknowledged, deferred) or a `D-###` (accepted as-is, with the reason).
On re-gate the finding no longer fires, because deferred-on-the-record content is
not a gap.

Write the deferral only from something the human said in response to being asked,
and record `Decided by: human`. A deferral you write on your own behalf is marked
`Decided by: model`, and every blocking gate downstream will surface it again for
confirmation.

## Format

```markdown
## Critique findings — <phase>, <date>

### blocker — R-004 is silent on session lifetime after a password change
Evidence: "Users can reset a password" (discovery.md, R-004)
Consequence: architecture will choose invalidate-all or keep-alive with no
basis, and system-spec will encode that choice as a requirement.

### gap — no success metric for the sign-in journey
Evidence: prd.md "Success metrics" lists three metrics, none covering J-001.
Consequence: the slice for J-001 has nothing to verify against at the human
verification gate.

Verdict: fail (1 blocker, 1 gap, 0 nits)
```

With no blockers, that same result would read `hold (0 blockers, 1 gap, 0 nits)`
and go to a human rather than back to the authoring skill.

Report the verdict line in your response so the router can act on it.
