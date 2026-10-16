# Layout

The files a product accumulates, and where. Phase skills do not need this:
`sdlc_lint.py next` returns the paths they read and write. It is here for the
steps that walk the whole record — the router when it scaffolds, and the two
that read across an iteration.

```
.sdlc/
  CONTRACT.md      the spine, read by every skill
  reference/       this file and its siblings, pulled on demand
  pipeline.json    phase order, dependencies, outputs, gates, commands
  scripts/
    sdlc_lint.py     the mechanical checks; run it rather than reimplementing it
    metrics_report.py  what each phase cost and which gate caught what
  state.json       where the iteration is; the only file needed to answer "what next?"
  decisions.md     append-only decision + assumption register (D-###)
  questions.md     open questions blocking progress (Q-###)
  reflections.md   append-only retro log; the evidence base for skill changes
  red.jsonl        every test observed failing before its code existed
  metrics.jsonl    one line per phase
  verification/    human sign-off notes, one file per slice
  proposals/       proposed changes to the pipeline itself, awaiting approval

inputs/            the raw material discovery was written from — notes,
                   transcripts, exports, screenshots. Nothing generated.

docs/
  discovery.md         problems, needs, requirements (R-###)
  journeys.md      user journeys (J-###)
  domain-model.md  ubiquitous language; the naming every later artifact uses
  prd.md
  design/
    screens.md     one section per screen, each carrying Traces: and States:
    style-guide.md concrete tokens — values, not adjectives
  architecture/
    overview.md    stack, boundaries, third-party integrations
    components.md  one section per component, each carrying Traces:
    adr.md         ADR-### decisions, each with its rejected alternatives
    skeleton.md    what was deployed end to end, and the command that proves it
  system-spec/
    data-model.md  entities and fields, each carrying Traces:
    environments.md  environments, variables, and which are secret
    security.md    who may do what, and how that is enforced
    operations.md  deployment, configuration, observability, limits
  slices.md        the vertical-slice backlog (S-###)
  slices/S-###/
    spec.md        written just-in-time, ends in a task list (T-###)
    review.md      code review findings
    deploy.md      what was deployed, how to undo it, and where to go and see it
```

## The process itself

The layout above is the product's. The process that builds it is a second set of
files, living with the skill install rather than in this repository: one
`SKILL.md` per step, gate checklists under `references/`, this contract and
`pipeline.json` under `assets/`, and under `scripts/` the two lint scripts —
`sdlc_lint.py`, which checks a product, and `suite_lint.py`, which checks the
process. Only the first is scaffolded here, because only the first has anything
to say about a product.

Changing any of those files changes how work is done, and is proposed rather than
edited. Nothing in a product repository is the right place to record that.
