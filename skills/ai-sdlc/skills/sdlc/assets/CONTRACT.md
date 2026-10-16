# SDLC Contract

The spine of the pipeline. `.sdlc/CONTRACT.md` is this file, and everything in it
is read by every skill; the rest is in `.sdlc/reference/`, listed at the bottom,
and pulled only by the steps that need it.

A product is built in **iterations**. An iteration runs an ordered list of
**phases**; each phase is one skill producing one artifact, followed by a **gate**
that passes it, holds it for a human, or sends it back for revision.
`pipeline.json` holds the order and the dependencies.

## Artifacts are the interface

Skills communicate through files on disk, not through conversation history. A
skill reads the paths it declares and writes the paths it declares — including
when the material is already in context.

## If you are a phase skill

Assume you are running in a context that has never seen this product and cannot
see any conversation about it. Everything you need is on disk.

- You are given your inputs and your output as paths. You do not need to know the
  layout to find them, and naming another phase's path directly couples you to a
  layout you do not own. Where you must refer to another artifact in prose, name
  it by **role** — the discovery document, the journeys, the domain model, the
  PRD, the designs, the slice backlog.
- Upstream artifacts have passed their gates. Use them as settled — do not
  re-derive them, and do not improve them in passing.
- Where an upstream artifact looks wrong, incomplete, or self-contradictory,
  raise a `Q-###` in `questions.md` naming it, and continue with the most
  defensible reading. Editing it silently rewrites a decision that was gated and
  attributes the change to nobody.
- Write your phase's output, and append to `decisions.md` and `questions.md`.
  Nothing else.

## Identifiers

| Prefix | Thing | Assigned by |
|---|---|---|
| `R-###` | Requirement | discovery |
| `J-###` | User journey | journey |
| `Q-###` | Open question | any skill |
| `D-###` | Decision or assumption | any skill |
| `ADR-###` | Architecture decision | architect |
| `S-###` | Vertical slice | slice |
| `T-###` | Task within a slice | spec |

An ID is **declared** by appearing in a markdown heading, and **referenced** by
appearing in a `Traces:` line. The lint parses both, so both forms are exact:

```
## R-012 — A revoked session stops working within 60 seconds
Traces: R-001, R-004
```

## Line tokens

Every element downstream of a requirement carries `Traces:`. Beyond that, each
token below belongs to one phase, which is where its format and the reason for it
are written. This table is the registry: what exists, and who owns it. A skill
requiring a token not listed here has invented one, and the suite lint says so.

| Token | Carried by | Says |
|---|---|---|
| `Traces:` | everything downstream of a requirement | what it derives from |
| `Source:` | requirements, domain terms | what it rests on, or `assumed` |
| `Exits:` | journeys | where the person leaves without the thing |
| `Depends on:` | journeys | what it assumes about the world outside |
| `Aliases:` | domain terms | the names rejected, forbidden downstream |
| `States:` | screens | every condition the screen must render |
| `Alternatives rejected:` | ADRs | what was not chosen, and why not |
| `Delivers:` | slices | what a person can now do that they could not |
| `After:` | slices | slices that must ship first |
| `Deferred:` | the slice backlog | what is not being built this iteration |
| `Verified by:` | tasks, deployments, the walking skeleton | the command or test that shows it is true |
| `manual —` | a `Verified by:` with no test | what a person checks instead |
| `Where:` | review findings | a `path:line` into the code |
| `Verdict:` | reviews and gates | pass, hold, or fail |
| `Rollback:` | deployments | how it is undone |
| `Try it:` | deployments | where a person goes to see the change |
| `Evidence:` | reflections | the figure or finding it rests on |
| `Recurrence:` | proposals | the reflection headings it answers |
| `Decided by:` | decisions | `human`, or `model` for an unconfirmed one |

Gate checklists are named after the **phase**, not the skill — `domain.md` for
the `domain` phase, whose skill is `domain-model`. One skill serves two phases
with different checklists, so these cannot always match.

## Artifacts add, they do not restate

Each phase refers to upstream material by ID and adds what only it decides.
Re-explaining an upstream artifact creates a second copy of the truth that no
process updates when the original changes. The lint flags sentences that re-tell
an upstream one, reworded or not; the gates catch what shares no vocabulary with
what it restates.

## Decisions register

Append to `decisions.md` every choice a later phase could reasonably have made
differently — including choices made in passing while drafting something else.

```
## D-007 — Sessions stored server-side, not in JWTs
Decided by: human | Date: 2026-07-27 | Phase: architect
Rationale: revocation requirement in R-012.
Alternatives rejected: stateless JWTs (no revocation path).
```

`Decided by: model` marks an assumption the human has not confirmed. Any blocking
gate lists the outstanding ones for confirmation. Open questions go in
`questions.md` as `Q-###`, in the same way.

## The rest

| Read | When you need |
|---|---|
| `.sdlc/reference/layout.md` | every file a product has, and where the process itself lives |
| `.sdlc/reference/state.md` | what `state.json` holds, statuses, staleness |
| `.sdlc/reference/gates.md` | what each gate returns, and ceremony levels |
| `.sdlc/reference/metrics.md` | what is measured, reflections, proposals |

Nothing writes `state.json` by hand. `sdlc_lint.py next` says what runs now and
`sdlc_lint.py gate` records a result; every field they set is a measurement, and
a model reporting a measurement is reporting a guess.
