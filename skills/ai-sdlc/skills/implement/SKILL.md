---
name: implement
description: Build one piece of work from its specification, writing the tests that prove each task before the code that satisfies them. Part of the software development pipeline; invoked by the sdlc skill.
---

Read `.sdlc/CONTRACT.md` and your phase's entry in `.sdlc/pipeline.json` first.
They give you the layout, the line formats, your inputs and output, and what to
do with anything you find wrong upstream.

Produces: code and tests. No document — the record of what happened lives in the
commits, in `decisions.md`, and in `questions.md`.

Build the tasks in the slice spec you were given, and nothing else.

## Order of work

1. Take the next `T-###` in the spec.
2. Write the test named on its `Verified by:` line, with exactly that name.
3. Record it failing:

   ```
   sdlc_lint.py red T-### --test <name> --slice S-###
   ```

   The script runs the test itself and refuses to record anything if it passes.
   You do not report the failure; it is observed.
4. Write the smallest code that makes it pass.
5. Run the tests for the files you touched.
6. Repeat until every task in the slice is done, then run the whole suite once.

A test that passes the first time is testing something other than what you think.
A test that asserts nothing passes from the moment it is written and can never be
recorded, which is why the record is the check: it catches the assertion written
afterwards and the assertion that checks nothing with the same evidence.

The record holds a digest of the test's source. If the test changes after the
failure was observed, the lint says the failure belonged to a different test —
so when a test fails and the implementation is hard, change the implementation.
Changing the test to match what the code already does is the one move this
records rather than prevents.

Where a task's `Verified by:` line begins `manual —`, do what it says instead and
record the result in the commit message.

## When the task proves an absence

Some tasks exist to prove a deliberate gap stays exactly as wide as decided — an
accepted authorization hole, a limit deliberately left unenforced. That task's
test is true the moment the surrounding code exists, before you write anything
for this task specifically, so it cannot fail on its own: there is no version of
the code, prior to this task, where it would have failed.

Prove it the same way anyway. Temporarily add the check the test exists to show
is absent, confirm the test now fails against it, record red, then remove what
you added. The record holds a digest of the test's source, not the
implementation, so this is not a different or weaker technique — it is the same
one, pointed at a regression instead of a bug: the test is shown able to catch
the exact thing it exists to catch.

## Names come from the domain model

Modules, classes, tables, columns, functions, and test names use the terms in the
domain model. This is the last place naming can be corrected cheaply: a document
can be rewritten, and a column name migrated across a deployed system cannot.

The lint checks slice specs for names the domain model rejected. It does not
check your code, so this one is on you.

## Scope

Build the tasks in the spec. Leave adjacent code alone — its formatting, its
comments, its structure. Where your change makes something unused, remove that;
where you find pre-existing dead code, say so and leave it.

Every changed line should trace to a task in this slice. A change that does not
is either a task nobody wrote down or work that belongs to a different slice.

## When the spec is wrong

You will find things the spec did not anticipate: a field it needs and does not
name, an error case with no defined behaviour, an interface that cannot work as
written.

Do not decide quietly. Raise a `Q-###` in `questions.md` naming the slice and
what is undecidable, and where the answer is small and obvious, take it and
record a `D-###` marked `Decided by: model`. The next blocking gate will surface
it for confirmation.

The failure this avoids is a system whose behaviour and whose specification
diverged one small sensible choice at a time, with no record of where.

## What you are not deciding

Anything the next slice would also need — an error format, a logging convention,
an authentication approach, a directory structure. Those belong to the whole
system. If one is missing, that is a `Q-###` against the system spec, not a
choice to make here and have the next slice make differently.

## Done when

Every task's named test exists, has been seen to fail, and now passes; the full
suite passes; every changed line traces to a task; deviations from the spec are
recorded as `Q-###` or `D-###`; and the work is committed.
