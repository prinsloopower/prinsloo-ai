---
name: journey
description: Write user journeys: start-to-finish accounts of someone trying to get something done, including the points where they give up. Part of the software development pipeline; invoked by the sdlc skill.
---

Read `.sdlc/CONTRACT.md` and your phase's entry in `.sdlc/pipeline.json` first.
They give you the layout, the line formats, your inputs and output, and what to
do with anything you find wrong upstream.

Produces: `docs/journeys.md`

A journey runs **trigger to resolution**: it starts with something that happens
to a person outside the product, and ends with them having what they came for —
or having given up. Write them to `docs/journeys.md`.

Anything narrower is a screen flow. *"User is on the dashboard and clicks
Settings"* has no trigger and no resolution, and the slicing phase cannot build a
deployable slice out of it.

## Exits are the point

The sunny path is the easy half and the half that gets written. What determines
whether this product works is where people leave without the thing they came for
— and those exits become the success metrics in the PRD, the error paths in the
spec, and the support burden after launch.

An exit is what the *person* does, not what the system does. *"Shows an invalid
token error"* is system behaviour. *"The reset link has expired and they request
a third one, then call support"* is an exit.

Every journey names its exits. A journey whose only ending is success has not
been thought about.

## Structure

```markdown
# Journeys — <product>

## J-001 — Signing in on a new device
Traces: R-001
Trigger: they have replaced their laptop and want to get back to their account.
Resolution: they are signed in on the new device.

1. They open the portal and are asked to sign in.
2. They enter the address and password they remember.
3. The service is unfamiliar, so they are asked to confirm the new device.
4. They confirm, and land where they were going.

Exits:
- Password not remembered; they divert to J-002 and may not come back.
- Confirmation never arrives; they retry twice, then stop.

Depends on: they can receive mail at the address on file.
```

## Steps

Write what the person does and what they decide, not which screen they are on.
The step that matters is usually the one where they have to make a judgement with
incomplete information — that is where journeys fail and where design work will
concentrate.

Keep a journey to the size of one deployable thing. If it cannot be built and
put in front of a person as a single vertical slice, it is two journeys, or it is
an epic that needs splitting before the slicing phase inherits the problem.

## Naming

Use the terms from the domain model where it exists, and where it does not
yet, use the terms from the discovery document exactly. Renaming a concept between
artifacts costs a real decision later, when someone has to work out whether a
*session* and a *login* are the same thing.

## What you are inferring

Requirements arrive with a `Source:` line, so their provenance is settled. The
*steps* are yours — you are imagining what a person does. Most of that inference
is harmless. The load-bearing kind is anything the journey depends on outside the
product: a person can receive email, has their phone, has an account already,
speaks the language.

Put those on a `Depends on:` line. They are where integrations break and where
the architecture phase finds surprises.

## Done when

Every journey has a trigger, a resolution, a `Traces:` line, and an `Exits:`
line; every journey is one deployable thing; and `.sdlc/scripts/sdlc_lint.py` reports
no findings for `journeys`.
