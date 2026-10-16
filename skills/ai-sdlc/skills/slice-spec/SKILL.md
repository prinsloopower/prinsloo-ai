---
name: slice-spec
description: Write the specification for one deployable piece of work — what it delivers, the interface and data it touches, what proves it works, and the tasks to build it. Part of the software development pipeline; invoked by the sdlc skill.
---

Read `.sdlc/CONTRACT.md` and your phase's entry in `.sdlc/pipeline.json` first.
They give you the layout, the line formats, your inputs and output, and what to
do with anything you find wrong upstream.

Produces: `docs/slices/S-###/spec.md` for the slice you were given.

Write this when the slice is about to be built, not before. Everything here is
specific to one slice; anything that would be true of the next slice as well
belongs to the whole system and is already written.

## Start with what it delivers

`Delivers:` states what a person can do after this slice that they could not
before, in one sentence, observable from outside the system.

If you cannot write that sentence, the slice is horizontal — an API with no
caller, a schema with no behaviour, a screen with no data. Stop and raise a
`Q-###` against the slice backlog rather than specifying it. A slice that
delivers nothing observable cannot be verified by the person at the end of it,
and the whole shape of this pipeline assumes it can.

## Structure

```markdown
# S-003 — Ending a session

Delivers: an account holder can see their active sessions, end one, and that
session stops working within a minute.
Traces: J-003, R-001, R-003

## Screens
Session list: populated, empty, loading, revoke failed.
Revoked-own-session redirect is out of scope for this slice — see below.

## Interface
GET  /sessions            → the caller's own sessions, newest first
POST /sessions/{id}/revoke → 204; 404 when the session is not the caller's,
                             so that existence is not disclosed

## Data
No new tables. Sets Session.revoked_at rather than deleting the row.

## Proven by
- A revoked session's next request is rejected, within sixty seconds (R-003).
- Revoking another account's session returns 404 and changes nothing.
- The list shows only the caller's sessions.

## Out of scope
Admin-initiated revocation (Q-007). The redirect when a person ends the session
they are currently using — deferred to S-004, which needs the sign-in flow.

## Tasks

### T-001 — List endpoint returns only the caller's sessions
Verified by: test_list_sessions_scoped_to_account

### T-002 — Revoke sets revoked_at and rejects other accounts' sessions
Verified by: test_revoke_sets_timestamp, test_revoke_foreign_session_404
```

## Screens and their states

For every screen this slice touches, list the states from the designs that it
builds. Any state you do not build goes under **Out of scope** by name.

A state that appears in neither list is the one that ships broken: it was
designed, nobody built it, and nothing recorded the decision.

## Proven by

Write what someone would check to believe the slice works, in terms of the
system's observable behaviour. Each line should be true or false when run —
including the numbers from the requirements, which is where limits like *within
sixty seconds* stop being aspirations.

## Tasks

Each `T-###` is an outcome with a `Verified by:` line naming the test that shows
it. *Write the controller* is a step and has no verification; *revoke sets
revoked_at and rejects other accounts' sessions* is an outcome and does.

Where a task genuinely cannot be verified by a test — a configuration change, a
manual migration — say what someone would look at instead, and say that it is
manual.

## Done when

`Delivers:` names something observable, every screen state is built or listed out
of scope, every line under **Proven by** is checkable, every task has a
`Verified by:`, and `.sdlc/scripts/sdlc_lint.py` reports no findings for this
slice.
