---
name: architect
description: Choose the stack, structure and integrations for a product, record why, and prove the chosen path works by deploying a thin version of it end to end. Part of the software development pipeline; invoked by the sdlc skill.
---

Read `.sdlc/CONTRACT.md` and your phase's entry in `.sdlc/pipeline.json` first.
They give you the layout, the line formats, your inputs and output, and what to
do with anything you find wrong upstream.

Produces: `docs/architecture/overview.md`, `docs/architecture/components.md`,
`docs/architecture/adr.md`, `docs/architecture/skeleton.md`

This step is not finished when the documents are written. It is finished when a
thin end-to-end path is deployed and a command proves it works.

## Order of work

1. Collect the choices already made upstream. Anything naming a technology in
   the PRD or the designs arrived without an architecture decision
   behind it; each becomes an ADR here, adopted or overturned on the record.
2. Read the `Depends on:` lines across the journeys. Those are the external
   systems this product needs, and they set most of the integration work.
3. Write the components, each tracing the requirements or journeys it exists for.
4. Write the ADRs for every choice that could reasonably have gone another way.
5. Build and deploy the walking skeleton.

## Components

`docs/architecture/components.md`, one `##` section per component:

```markdown
## Session store
Traces: R-001, R-003, J-003
Holds active Sessions and answers "is this session still valid" on every request.
Server-side so that revocation takes effect immediately (ADR-002).
Talks to: the API, and nothing else.
```

Every component carries `Traces:`. A component that traces nothing exists because
it belongs in an architecture rather than in this one, and it will be built.

Size the component set to the requirements in front of you. Splitting a service
that one team deploys as a unit, adding a queue between two components that
always run together, or introducing a cache before anything is slow buys
operational cost immediately and value later, if ever.

## Decisions

`docs/architecture/adr.md`, one `##` section per decision, each carrying
`Traces:` and `Alternatives rejected:`:

```markdown
## ADR-002 — Sessions are held server-side, not in signed tokens
Traces: R-003
Decision: the API validates each request against the session store.
Alternatives rejected: stateless signed tokens — no revocation path inside the
sixty-second bound in R-003, short of a denylist that reintroduces the store.
Consequence: every request costs a session lookup; the store is on the critical
path and needs its own availability answer.
```

Write the rejected alternatives out. The choice is visible in the code forever;
the alternatives are recoverable only from here, and they are what a later
iteration needs when the constraint that decided it has changed.

Record the consequence you are accepting, including the one that will hurt.

## Tell the pipeline how to run the tests

The stack you choose decides how tests are run, and until that is written down
no gate can run them. Once the skeleton's stack is settled:

```
sdlc_lint.py commands --test "<whole suite>" \
    --test-one "<one test, with {test} where the name goes>"
```

`test_one` is what lets a task's test be recorded failing before its code
exists. Without it the build step can show only that tests pass, which a test
that asserts nothing also does.

## The walking skeleton

Build the thinnest complete path through the architecture and deploy it: one
route, one write to real storage, one deployed environment, running as the real
system would. Not a prototype and not a local demo — a production path with
almost nothing in it.

`docs/architecture/skeleton.md` records what runs, where, and the command that
proves it:

```markdown
## Deployed
Staging, from commit a1b2c3d. Route POST /sessions writes to the session store
and returns a session id; GET /healthz reports store connectivity.

Verified by: curl -sf https://staging.example.com/healthz && ./scripts/smoke.sh

## What this proved
Deploy pipeline, environment configuration, database migration, and the session
store round-trip.

## What it did not prove
Nothing has authenticated yet; the identity provider integration in ADR-004 is
still assumed to work as documented.
```

Say what the skeleton did **not** prove. The parts still assumed are where the
next surprise is, and naming them is what turns them into `Q-###` rather than
into a discovery during the third slice.

## Integrations

For each external system, record what it is trusted to do, what happens when it
is unavailable, and how it is configured per environment. An integration with no
failure answer becomes an outage the first time it is slow.

## Done when

Every component traces something, every ADR names its rejected alternatives and
its consequence, every technology named upstream has been adopted or overturned
on the record, the skeleton is deployed with a `Verified by:` command that
passes, and `.sdlc/scripts/sdlc_lint.py` reports no findings for `architecture`.
