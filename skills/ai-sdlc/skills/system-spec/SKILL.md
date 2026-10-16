---
name: system-spec
description: Write the technical decisions that apply across a whole product — data model, environments and variables, security rules, deployment and operational limits. Part of the software development pipeline; invoked by the sdlc skill.
---

Read `.sdlc/CONTRACT.md` and your phase's entry in `.sdlc/pipeline.json` first.
They give you the layout, the line formats, your inputs and output, and what to
do with anything you find wrong upstream.

Produces: `docs/system-spec/data-model.md`, `docs/system-spec/environments.md`,
`docs/system-spec/security.md`, `docs/system-spec/operations.md`

What goes here is what every slice needs and no slice should decide alone. A
detail that concerns one feature belongs in that feature's own spec.

## Order of work

1. Turn the domain model into a data model. Every entity comes from a term that
   already exists; the fields and keys are yours.
2. Write the environments and every variable each one needs.
3. Write who may do what, and how it is enforced.
4. Write deployment, configuration, observability, and the limits the system
   runs under.

## Data model

`docs/system-spec/data-model.md`, one `##` section per entity, each carrying
`Traces:`:

```markdown
## Session
Traces: R-001, R-003
| field | type | notes |
|---|---|---|
| id | uuid | primary key |
| account_id | uuid | → Account, indexed; sessions are queried by account |
| issued_at | timestamptz | |
| revoked_at | timestamptz | null while active; set rather than deleted, so a
  revocation is auditable |

Retention: rows are kept 90 days past revocation, then deleted.
Migration: new table; no backfill.
```

Entity names come from the domain model. An entity that is not a term there is
either a term nobody agreed, or a table that exists to serve an implementation
choice — say which, and record it as a `D-###`.

Every entity states its retention and its migration. A model with neither
describes a system that has just been built and never one that has been running.

## Environments

`docs/system-spec/environments.md`. Name each environment, and for every
variable: what it does, an example value, whether it is a secret, and where it
comes from.

```markdown
| variable | purpose | example | secret | source |
|---|---|---|---|---|
| SESSION_TTL_MINUTES | idle expiry of a Session | 60 | no | config |
| DATABASE_URL | Postgres connection | postgres://… | yes | platform secret store |
```

A variable with no source is one that will be missing on first deploy, and a
secret not marked as one is a secret that ends up in a log.

State how a developer gets from a clean checkout to a running system, as
commands. If that has never been done from a clean checkout, say so.

## Security

`docs/system-spec/security.md`. Who may do what, expressed against the domain
terms — *an Account holder may end any Session whose account_id is their own* —
and where that rule is enforced. A rule enforced only in the interface is not
enforced.

Cover authentication, authorisation, what is logged and what must never be
logged, and how secrets are handled. Where a threat is accepted rather than
mitigated, record it as a `D-###` naming the risk.

## Operations

`docs/system-spec/operations.md`. Deployment steps, rollback, configuration per
environment, what is monitored and what triggers a human, and the limits the
system runs under — rate limits, payload sizes, timeouts, expected volumes.

Give the numbers. *Fast*, *scalable* and *reliable* cannot be built to or tested
against; a p95 under 200ms at 50 requests per second can.

## Done when

Every entity traces something and states retention and migration; every variable
has a source and a secret flag; every permission rule names where it is enforced;
every limit is a number; and `.sdlc/scripts/sdlc_lint.py` reports no findings for
`system-spec`.
