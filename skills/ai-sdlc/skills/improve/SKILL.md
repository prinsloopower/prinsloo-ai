---
name: improve
description: Propose changes to the skills, checklists, shared rules and automated checks that make up this development process, based on problems recorded more than once, as reviewable diffs with before-and-after evaluations rather than direct edits. Part of the software development pipeline; invoked by the sdlc skill.
---

Read `.sdlc/CONTRACT.md` first, then `.sdlc/reference/metrics.md` for what a
proposal must rest on and `.sdlc/reference/layout.md` for where the process
itself lives, which is what you propose changes to.

Produces: a file in `.sdlc/proposals/`

You propose. You do not apply. The files you would change live with the skill
install, not in the product repository, and a change to how work is done is
approved by the person whose work it is.

## The process is these files

All of them are yours to propose changes to. They sit alongside this skill;
`suite_lint.py` knows the layout and will tell you if a proposal breaks it.

| File | Changing it changes |
|---|---|
| a step's `SKILL.md` | how that step is carried out |
| a gate's checklist under `references/` | what that gate looks for |
| `assets/CONTRACT.md` | the shared rules — line formats, statuses, gate meanings |
| `assets/pipeline.json` | the order, the dependencies, the gates, the ceremony levels |
| `scripts/sdlc_lint.py` | what is checked mechanically in a product |
| `scripts/suite_lint.py` | what is checked mechanically in this suite |

Your own skill and checklist are included. A rule that has not worked here is as
proposable as one that has not worked anywhere else.

## Answer it at the cheapest layer

The same recurring problem can usually be answered in more than one of those
files, and they do not cost the same:

- **A check in a lint script** runs in milliseconds, never gets tired, and costs
  nothing per run. It can only decide what a script can decide.
- **An item in a checklist** costs model attention every time that gate runs.
- **Prose in a skill** costs context on every invocation of that skill, forever.

Prefer the cheapest layer that can actually catch the thing. Moving an existing
rule down a layer is usually a better proposal than adding a new one at the same
layer — and when you propose a new mechanical check, propose the matching
checklist change with it, so the gate stops spending attention on what the script
now owns and starts asking what the script cannot.

## What qualifies

An observation recorded under the same heading in **two or more** iterations of
`.sdlc/reflections.md`. `sdlc_lint.py next` lists the ones that qualify, and the
lint rejects a proposal resting on fewer.

You are not part of any iteration's phase list. You run when that list is
non-empty, whatever size the work was.

One iteration is one iteration. A problem that appeared once and cost real damage
can be raised with the human directly, as a question rather than a proposal — but
it does not become a change to the process, because a process shaped by single
incidents accumulates a rule for every bad day anyone ever had.

## Prefer removing

Every iteration, look first for what can come out: a checklist item that has never
produced a finding, a required line nothing reads, a gate that has caught nothing
across several iterations, a document no later phase opens.

Adding to a skill feels safe and removing feels risky, so the drift is one-way
unless something pushes back. Left alone, these files double in length and get
worse, and the cost of that lands on every run.

If you propose nothing to remove, say why. *Nothing has outlived its use yet* is
an acceptable answer once; twice is a sign nobody is looking.

## Check the cost before the cause

A gate that catches nothing might be a bad gate, or a well-aimed one at a phase
that rarely goes wrong, or a good gate with the wrong checklist. The metrics show
which gates catch what and what each phase costs; they do not show why. Read the
findings that gate did produce, and the ones that reached later phases and traced
back to it, before proposing to remove it.

Removing a gate that is working is more expensive than keeping one that is not.

## Every proposal

```markdown
## Slice specs written too far ahead of the build
Recurrence: Slice specs written too far ahead of the build
Target: the router's per-slice sequence
Change: specify a slice when it becomes next, rather than specifying all of them
after the backlog is approved.

Diff:
- `slice_phases` repeat per slice until every slice is verified.
+ `slice_phases` repeat per slice, one slice at a time; a slice is specified
+ only when the slice before it is verified.

Eval: router evaluation, 12 cases. Before: 12/12. After: 12/12, with the
sequencing case now asserting one spec exists rather than all of them.
Net lines: +1
Cost if wrong: slices are specified later than they could be, which delays
nothing but removes the option of specifying two in parallel.
```

`Target:` names the file and the part of it, so the diff can be found. Where a
proposal changes two files together — a new check and the checklist item it
replaces — write them as one proposal with both diffs.

`Recurrence:` names the reflection headings verbatim. `Diff:` is the actual
change, not a description of one — a described change is approved on its
plausibility rather than on its content.

`Eval:` is the target skill's evaluation run before and after. A change with no
evaluation is a change whose effect nobody measured, and this suite already has
one way of finding out whether an edit worked, which is to ship it and see.

## Budgets

Skills carry a line budget. A proposal that pushes one over it must remove
something or split the skill, and *raise the budget* is not a change to propose —
the budget exists because the alternative is a file nobody reads to the end.

## What you may not propose

A change to a check because it produced a finding you disagreed with. The check
being inconvenient in one instance is not evidence about the check; look at what
it caught across the iterations before deciding it is wrong.

## Done when

Every proposal names observations recorded in at least two iterations, carries a
real diff and an evaluation, states its net line change and what it costs if it
is wrong, and at least one proposal removes something or the artifact says why
none does.
