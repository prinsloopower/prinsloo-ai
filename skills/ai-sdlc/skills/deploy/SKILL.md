---
name: deploy
description: Release one finished piece of work to a running environment, confirm it works there, and record how to undo it and where a person can go and see it. Part of the software development pipeline; invoked by the sdlc skill.
---

Read `.sdlc/CONTRACT.md` and your phase's entry in `.sdlc/pipeline.json` first.
They give you the layout, the line formats, your inputs and output, and what to
do with anything you find wrong upstream.

Produces: `docs/slices/S-###/deploy.md`

Deploy the commit that was reviewed, not the working tree. If they differ,
something was changed after review and has not been reviewed.

## No running environment

Some products have nowhere to deploy to — a library, a script, a CLI tool
with no server, no package registry, no CI. Check for one before working
through the rest of this skill: a system spec with an environments doc, CI
config, or anything else naming a target distinct from the repository
itself. Where none exists, the reviewed commit reaching the trunk *is* the
deployment, and the phase's job is to confirm that — same commit, no drift —
rather than to invent a staging environment, variables, or a migration step
that have nothing to check against. Say so plainly in `deploy.md` rather than
working through the checklist below as if a target existed. `Verified by:`
still runs something real — call the changed code the way a consumer would
and check its output against `Delivers:` — and `Try it:` becomes the command
that does that, not an invented URL.

## Before deploying

Check the review verdict. A `fail` is not deployable and a `hold` belongs to a
human, not to you.

Check the target has every variable the system spec lists for it, including any
this slice added. A variable that only exists on a developer's machine is
discovered at the moment of deployment, which is the worst moment available.

Check the migrations. Run them where they are meant to run — before the code that
needs them, or alongside it, as the system spec says — and know which are
reversible before you start. A migration that drops a column is a decision to
stop being able to roll back, and it needs saying out loud rather than
discovering.

## Smoke

The smoke command exercises what the slice delivers. A check that only reports
the process started proves the process started; it does not prove that ending a
session ends it.

Take the `Delivers:` line from the slice, and make the smoke check do that thing
against the deployed system, end to end. Where a requirement carries a number,
the smoke check is where the deployed system either meets it or does not.

If the smoke check fails, roll back. Do not investigate a broken deployment while
it is serving people; put the previous version back and investigate that.

## Record it

```markdown
# Deployment — S-003

Deployed commit a1b2c3d to staging at 14:20. Migration 004 ran first, adding
Session.revoked_at as a nullable column.

Verified by: ./scripts/smoke-sessions.sh staging
Rollback: redeploy a1b2c3d~1. Migration 004 stays — it is additive and the
          previous version ignores the column.
Try it: https://staging.example.com/account/sessions — sign in on two devices,
        then end the other one from here.

## Not covered by the smoke check
The sixty-second bound in R-003 is asserted in the test suite against a local
clock, not against the deployed system.
```

`Rollback:` says what happens to data as well as to code. *Redeploy the previous
version* is only true if nothing this deployment did was one-way.

`Try it:` is a URL and the steps to see the change, written for someone who has
not read the slice. The verification gate after this one depends on it, and a
person who cannot find the change verifies that nothing appears to be broken,
which is a different thing.

State what the smoke check did not cover, for the same reason the walking
skeleton does: the parts still taken on trust are where the next surprise is.

## Done when

The reviewed commit is running in the target environment, the smoke command
passes there, and `deploy.md` records the command, the rollback including its
data consequences, and where a person can go and see the change.
