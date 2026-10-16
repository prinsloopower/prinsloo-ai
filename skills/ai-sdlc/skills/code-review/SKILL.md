---
name: code-review
description: Review the code written for one piece of work against its specification and against the conventions of the codebase it now lives in, and return a verdict. Part of the software development pipeline; invoked by the sdlc skill.
---

Read `.sdlc/CONTRACT.md` and your phase's entry in `.sdlc/pipeline.json` first.
They give you the layout, the line formats, your inputs and output, and what to
do with anything you find wrong upstream.

Produces: `docs/slices/S-###/review.md`

You are reviewing code you did not write.

If the reasoning that produced this code is in your context, you are in the wrong
context to judge it. Spawn a subagent, give it the diff and this skill, and
return its verdict. In an orchestrator without subagents this is a separate call
whose history holds the diff and nothing else.

That matters more here than for a document. Reviewing code needs the surrounding
codebase, so a shared context feels justified in a way it does not elsewhere —
and it is the same failure: an author cannot find the bug they have already
explained to themselves.

## Two reviews, not one

Run both in separate subagents. Neither sees the other's findings until both are
done, because a reviewer holding one axis in mind stops noticing the other.

- **Spec and scope** — `references/spec-and-scope.md`. Does the diff deliver what
  the slice promised, and nothing besides?
- **Standards and naming** — `references/standards-and-naming.md`. Does it look
  like it belongs in this codebase, in the words the domain model agreed?

Merge the two sets of findings into one document, keeping them attributed, and
compute one verdict from the whole.

## What to review

The diff since the slice started, not the whole codebase. Read the slice spec
first — its `Delivers:` line, its tasks, and what it lists under **Proven by** —
then the diff, then whatever surrounding code you need to judge whether the diff
fits.

Run the tests. Record the command and the result. A review that did not run them
is an opinion about code that may not work.

## What counts as a finding

Every finding carries:

- **Where** — a `path:line`. The lint checks the file exists, so a finding cannot
  cite code nobody wrote.
- **Consequence** — what goes wrong because of this, in the running system or in
  the next slice. A finding that cannot name one is a preference, and preferences
  are `nit` at best.
- **Severity** — `blocker`, `gap`, or `nit`.

| Severity | Meaning |
|---|---|
| `blocker` | Ships a defect, or fails to deliver what the slice promised. |
| `gap` | Something is missing that a later slice will otherwise invent. |
| `nit` | Cosmetic. Recorded, never affects the verdict. |

## Verdict

- Any `blocker` → **fail**
- No blockers, one or more `gap` → **hold**
- Otherwise → **pass**

The verdict follows from the findings. You do not choose it.

## Format

```markdown
# Review — S-003

Reviewed: commit a1b2c3d against the slice spec.
Tests: `pytest -q` → 48 passed, 0 failed.

## blocker — revoke does not scope to the caller's account
Where: src/api/sessions.py:42
Axis: spec and scope
The handler looks up the session by id alone, so any authenticated caller can
end any session. T-002 requires 404 for another account's session, and the test
named on its Verified by line asserts only that revoked_at is set.

## nit — helper named for a rejected term
Where: src/auth/helpers.py:12
Axis: standards and naming
`login_helper` uses a name the domain model rejected in favour of Sign-in.

Verdict: fail (1 blocker, 0 gaps, 1 nit)
```

## Done when

Both axes have run in fresh context, the tests have been run and their result
recorded, every finding cites a `Where:` and a consequence, the verdict follows
from the findings, and `.sdlc/scripts/sdlc_lint.py` reports no findings for this
slice.
