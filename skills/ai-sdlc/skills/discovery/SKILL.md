---
name: discovery
description: Turn discovery notes into problem statements and numbered requirements, each recording where it came from. First step of the software development pipeline; invoked by the sdlc skill.
---

Read `.sdlc/CONTRACT.md` and your phase's entry in `.sdlc/pipeline.json` first.
They give you the layout, the line formats, your inputs and output, and what to
do with anything you find wrong upstream.

Produces: `docs/discovery.md`

Everything in this artifact is either **heard** or **inferred**, and the file says
which for every line. Write it to `docs/discovery.md`.

You produce plausible user needs fluently, and a plausible invented need is
indistinguishable from a real one three artifacts later, when the architecture
has been built around it. The `Source:` line is what keeps the two apart.

## Before writing anything

Take stock of the discovery material actually available — interview notes,
support tickets, analytics, existing docs, whatever the human has given you.

If it is thin, **ask rather than fill**. A one-line brief does not become a
requirements document by elaboration. Ask about the people affected, what the
problem costs them today, what they do instead right now, and what would have to
be true for this to be worth building. Ask in small batches and stop when the
answers stop changing the requirements.

Filling a thin brief is the cheapest thing you can do here and the most
expensive thing the iteration will pay for.

## Structure

```markdown
# Discovery — <product>

## Sources
- 2026-07-14 interview, ops lead — notes in docs/discovery/ops-lead.md
- support tickets tagged `login`, Jan–Jun 2026 (n=214)

## Problems

### Account holders cannot end a session they no longer trust
Who: account holders on shared or lost devices.
Cost: ~40 support tickets a month; two escalations to legal in 2026.
Today they: call support, who reset the password to force a logout.
Source: support tickets tagged `login`; ops-lead interview 2026-07-14.

## Requirements

### R-001 — An account holder can end any of their own active sessions
Source: ops-lead interview 2026-07-14 ("they ring us to force a logout")

### R-002 — A revoked session stops working within a minute
Source: assumed (D-003)

## Open questions

- Q-001 — Does session revocation need to cover API tokens, or only browser
  sessions? Blocks the data model at the architecture phase.
```

## Requirements

State the need, not the mechanism. *"Account holders sign in without creating a
new password"* is a need; *"authenticate via OAuth"* is a mechanism, and writing
it here removes a decision the architecture phase should be making on the record.

Each requirement gets a `Source:` line. Where nothing in the discovery material
supports it, the source is `assumed`, and you append the assumption to
`decisions.md` as a `D-###` with `Decided by: model`. Assumed requirements are
allowed. Unmarked assumed requirements are the failure this skill exists to
prevent.

Write the observation that would show a requirement unmet clearly enough that
someone who was not in the discovery conversation could make it.

## Problems

Each problem names who has it, what it costs them, and what they do instead
today. A problem with no cost attached cannot be prioritised against another one.

## Open questions

Real discovery leaves questions. If you are about to write none, look again at
what you inferred rather than heard — the questions are usually there, already
answered by you. Each `Q-###` names the phase it blocks.

## Done when

Every requirement has a `Source:`, every assumed one has its `D-###`, every
problem has a cost, and `.sdlc/scripts/sdlc_lint.py` reports no findings for `discovery`.
