---
name: domain-model
description: Settle the vocabulary a product is described in: each term, what it excludes, and the competing names rejected for it. Part of the software development pipeline; invoked by the sdlc skill.
---

Read `.sdlc/CONTRACT.md` and your phase's entry in `.sdlc/pipeline.json` first.
They give you the layout, the line formats, your inputs and output, and what to
do with anything you find wrong upstream.

Produces: `docs/domain-model.md`

**One name per thing, one thing per name.** Write it to `docs/domain-model.md`.

This artifact is small and everything downstream is named from it. Its value is
not the definitions — a model can produce plausible definitions of anything. Its
value is the decisions: which of several competing words won, and which word was
doing two jobs and had to be split.

## Read first, invent nothing

The vocabulary is already in the discovery document and the journeys. Your job is
to collect the words already in use, not to supply the ones a product like this
usually has. A term appearing here for the first time, with no upstream use, is
almost always the model reaching for an industry-standard concept nobody asked
for — a `Tenant`, an `Aggregate`, a `Policy`. Those cost real money later, when
someone builds the abstraction the word implies.

Every term carries a `Source:` line pointing at where it is already used. A term
whose source is `assumed` needs a `D-###` and a reason it had to be introduced.

## The two jobs

**Collapse synonyms.** *Login*, *sign-in*, and *session* will all appear
upstream, meaning between one and three different things. Pick one name, and
record the others on the `Aliases:` line — they are rejected names, and recording
them is what lets the lint catch a later artifact quietly using one.

**Split homonyms.** One word doing two jobs is worse than two words doing one,
because code will conflate them and nobody will notice until the data model is
built. *Account* as the customer record and *Account* as the balance is the
classic. Split them, name both, and say in each definition what it is not.

## Structure

```markdown
# Domain model — <product>

## Session
An authenticated period of access. Held by exactly one Account; ends at expiry,
sign-out, or revocation. Not the act of signing in — that is Sign-in.
Source: discovery.md R-001, R-003; journeys.md J-001
Aliases: login, logged-in session
Relates to: an Account has many Sessions, zero or more of them current.

## Sign-in
The act of establishing a Session. Not the Session itself.
Source: journeys.md J-001
Aliases: none
Relates to: a successful Sign-in creates exactly one Session.
```

`Aliases: none` is a claim, not a formality — it says you looked for competing
names and found none. Make it true.

## Definitions

A definition that restates its own term is worse than absent, because it looks
complete. *"Session: a user's session"* passes a glance and teaches nothing.

Write what the thing **is**, what it **is not** where a neighbouring term could be
confused with it, and how it **relates** to other terms — including cardinality,
because the data model in the system spec is built from these lines and will
otherwise invent them.

Where a term has a lifecycle — created, changed, ended — say what starts and ends
it. Lifecycle boundaries are where the interesting requirements hide.

## Decisions

Choosing between competing names is a decision. Where the choice was not obvious,
append a `D-###` recording which won and why. Where the choice needs a human —
because it is the customer's word, or a regulated term, or a word the business
already uses differently — raise a `Q-###` rather than deciding quietly.

## Done when

Every term has a `Source:` and an `Aliases:` line, every definition says what the
thing is not where a neighbour could be confused with it, competing names are
recorded rather than discarded, and `.sdlc/scripts/sdlc_lint.py` reports no findings
for `domain`.
