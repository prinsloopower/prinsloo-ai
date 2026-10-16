---
name: slice
description: Cut a product into an ordered backlog of deployable pieces, each delivering something a person can use, with everything not being built this time recorded as deferred. Part of the software development pipeline; invoked by the sdlc skill.
---

Read `.sdlc/CONTRACT.md` and your phase's entry in `.sdlc/pipeline.json` first.
They give you the layout, the line formats, your inputs and output, and what to
do with anything you find wrong upstream.

Produces: `docs/slices.md`

Cut by what a person can do, not by what a developer builds. *Sign-in works* is a
slice. *The API layer*, *the database*, *the front end* are layers, and a backlog
of layers has nothing to show anyone until the last one lands.

## Order of work

1. List every requirement and journey. Each one ends up in a slice or on a
   `Deferred:` line — there is no third option, and the lint enforces it.
2. Group them into pieces that each deliver something observable.
3. Order them, using the sequencing in the PRD and the dependencies between
   slices.
4. Check the first slice against the walking skeleton: it should extend a path
   that already deploys, not open a new one.

## Structure

```markdown
# Slices

## S-001 — Signing in
Delivers: an account holder can sign in on a new device and stay signed in.
Traces: J-001, R-001, R-005

## S-002 — Recovering a forgotten password
Delivers: an account holder who cannot sign in can set a new password by email.
Traces: J-002, R-002
After: S-001

## S-003 — Ending a session
Delivers: an account holder can see their active Sessions and end one.
Traces: J-003, R-003
After: S-001

Deferred: R-004, R-009 — admin-initiated revocation, pending the legal question
in Q-007. J-005 — bulk device management; no evidence yet that anyone wants it.
```

## Cutting

Each slice delivers something observable end to end. If you cannot write a
`Delivers:` line without describing a layer, the cut is in the wrong place.

Prefer thin and boring over complete. A slice that signs a person in with an
email and password, with no remember-me and no device confirmation, delivers
something and can be extended; a slice that delivers all of sign-in is three
slices that cannot be deployed separately.

Where a journey is too large to deliver at once, split it along the journey's own
steps and say what the earlier slice leaves a person unable to do. That sentence
is the honest description of a partial delivery, and it belongs in the slice's
`Delivers:` line rather than in a note.

## Ordering

`After:` names slices that must ship first, and a slice named there is declared
earlier in the backlog. If two slices each need the other, the cut is wrong —
they are one slice, or the shared part is a third that comes before both.

The first slice extends the walking skeleton. Starting with a slice that needs a
path the skeleton never deployed means the first thing built is also the first
thing whose deployment has never been tested.

## Deferring

Everything upstream that is not in a slice goes on a `Deferred:` line, with a
reason and, where the decision is not yours, a `Q-###`.

Deferring is a normal outcome and a recorded one. A requirement that is simply
absent from this document is indistinguishable from one nobody noticed, and it
will be discovered when someone reads the discovery document six weeks later.

## Done when

Every slice has `Delivers:` and `Traces:`; every requirement and journey is in a
slice or on a `Deferred:` line; every `After:` names a slice declared before it;
the first slice extends the skeleton; and `.sdlc/scripts/sdlc_lint.py` reports no
findings for `slices`.
