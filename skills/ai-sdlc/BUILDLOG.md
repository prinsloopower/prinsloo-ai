# Build log — an AI-SDLC skill suite

A running record of designing and building the suite. Kept for a write-up, so it
records rejected alternatives and open questions, not just what shipped. The
rejects are the interesting part.

---

## Session 1 — Design critique and foundations

### Starting point

A 25-step pipeline, one skill per step, running discovery → deployment → retro,
with the retro feeding improvements back into the skills. Constraints: usable
from Claude Code first, portable to LangChain/n8n/CrewAI later; skills must not
reference each other by name; a master instruction controls the process; token
consumption must stay manageable.

### Nine challenges raised

1. **One skill per step is a granularity failure.** Ten of the 25 steps were
   variants of "validate X" — the same operation on different inputs. One skill
   per *durable artifact*, not per *verb*. Twenty-five always-loaded descriptions
   also make skill selection unreliable, because near-identical descriptions
   compete.
2. **Self-validation in the same context is theatre.** A model approves its own
   PRD. Gates only bite with fresh context, mechanical checks where possible, and
   a fail branch that routes somewhere.
3. **Don't rebuild what's installed** — superseded by the decision below.
4. **The pipeline is waterfall with a faster typist.** The real risk is
   compounding fabrication: a wrong assumption in discovery gets elaborated,
   formalised, and specified until you hold sixty pages of internally consistent
   documents describing a product nobody validated.
5. **No sizing gate.** Every change paying the full tax means the suite gets
   abandoned for anything under a week of work.
6. **Without stable IDs, validators are vibes.** IDs make coverage a script.
7. **The self-improvement loop is a sediment generator.** Adding to a skill feels
   safe, removing feels risky. Five cycles in, the skills are twice as long and
   worse — killing the token budget the loop was meant to protect.
8. **Thin steps hiding real work.** "Deploy/push" bundles CI, environments,
   migrations, rollback, observability. No register for decisions the model
   invents silently and later treats as fact.
9. **No measurement.** Token cost was a stated goal with nothing capturing it.

### Decisions

| # | Decision | Rejected alternative |
|---|---|---|
| 1 | ~15 skills: one per durable artifact, plus a router | 25 skills, one per step |
| 2 | Duplicate and improve the existing execution skills into the suite | Wire the suite into the installed `implement`/`tdd`/`code-review` as-is |
| 3 | Thin system spec + walking skeleton + per-slice specs | One monolithic spec upfront |
| 4 | Retro proposes skill diffs with evals; human approves each | Auto-editing skills after each cycle |
| 5 | The contract lives in the product repo (`.sdlc/CONTRACT.md`), not the skill install | Contract bundled inside the router skill |
| 6 | Artifacts on disk are the sole interface between skills | Passing state through conversation |
| 7 | No numeric filename prefixes; ordering lives only in the router | `01-frame.md`, `02-journeys.md`… |
| 8 | Staleness detected by hashing upstream inputs | Asking the model whether downstream docs are still accurate |
| 9 | Walking skeleton is the *completion criterion* of the architecture phase, not its own skill | A separate `skeleton` skill |
| 10 | `tdd` and `prototype` become reference files inside `implement` and `design` | Standalone skills — which would force lateral skill references, breaking the router-only-graph rule |

### Notes worth keeping for the write-up

**Router-reached skills need cheap descriptions.** A skill invoked only by name
from a router doesn't need rich trigger phrasing — it needs a reach clause. One
clipped line each. Across 14 skills that is a large, permanent context saving
that nobody talks about.

**The most valuable component is a lint script, not a skill.** Coverage, orphan,
and staleness checks are deterministic, near-free, and immune to the model's
optimism about its own output. Everything a script can decide should be taken
away from the model.

**Two-strike rule.** Two failed gates on one artifact means the fault is
upstream. Without it, an agent will happily polish the third revision of a PRD
built on wrong requirements.

### Open questions

- Does the PRD earn its place between `frame` + `journeys` and `system-spec`, or
  is it a human-communication artifact the pipeline doesn't need? Flagged for the
  first retro rather than settled by argument.
- Is `journey` a real phase or a section of `frame`?
- What is the right line budget per skill before an `improve` diff must prune
  rather than append?

### Built this session

- `.sdlc/CONTRACT.md` — layout, IDs, statuses, gate semantics, ceremony levels,
  decision register, metrics format
- `sdlc` router skill — state machine, gate handling, resume/mid-entry behaviour

---

## Session 2 — Pruning the foundations

Challenge from the human: are explanatory comments earning their place in a
skill, or are they just the designer talking to the reader?

Mostly the latter. But the answer isn't "cut all rationale" — `skill-creator`
explicitly prefers explaining *why* over piling up MUSTs. The usable test:

> **Rationale earns its place when it guards a costly instruction** — when
> following the rule is slow or expensive, and the agent would otherwise find a
> plausible reason to skip it. It fails when it justifies the design to a human.

Worked example, same file, opposite verdicts:

- *"A model reviewing its own work in the same context approves it."* **Keeps.**
  Spawning a subagent is slow; without the why, an agent rationalises reviewing
  inline (*I already have full context, that's strictly better*). The sentence is
  the only thing standing in front of an attractive shortcut.
- *"Grinding a third revision out of a PRD whose requirements are wrong is how a
  cycle burns a day…"* **Goes.** "Two failures means go upstream" is already
  checkable. Counting to two needs no motivation.

Three further patterns found while pruning:

1. **Duplication is the bigger cost than verbosity.** The fresh-context rule was
   in both the router and the contract. Rule adopted: *the contract defines, the
   router sequences.* If a skill needs to know what a gate is, it reads the
   contract; the router only decides which gate runs when.
2. **Replace rationale with a sharper criterion, not with nothing.** The
   decisions register was motivated by *"agents invent decisions silently."*
   Cutting it left "log decisions" dangerously vague, so it became *"log every
   choice a later phase could reasonably have made differently, including
   choices made in passing."* Cheaper than the motivation and strictly more
   useful — the fix `skill-this` recommends for a fuzzy completion criterion.
3. **Prohibitions rewrote as positives.** *"Do not re-read upstream artifacts to
   get oriented"* names the behaviour it forbids and makes it more available.
   Became *"Orient from `state.json` and the lint output alone."*

Result: router 869 → 610 words, contract 844 → 655. No rule removed from either.
Roughly 28% of both files was the designer talking to the reader — in files
loaded on every run.

**Reframe worth keeping for the write-up:** a skill isn't a program, so it
doesn't need all the instructions. The model already knows how to write a PRD. A
skill is only the *deltas from the model's defaults*; anything the model would do
anyway is pure context load.

Also added while pruning: the exact `Traces:` line format (the lint script parses
it, so it can't be loose prose), and a definition for `defects_found`.

---

## Session 3 — The lint script, and a graph that had to move

Writing `sdlc_lint.py` immediately exposed a flaw in the two files just
approved. The script needs the dependency graph — which artifact goes stale when
which upstream changes — and that graph existed only as prose, in two places:
the router's markdown table and the contract's layout block. Hardcoding it in
the script would have made three definitions of the pipeline.

That drift was not hypothetical. The contract had already lost
`docs/domain-model.md` within one message of both files being written, while
domain modelling sat in the router's table as a full phase.

**Decision 11:** `pipeline.json` becomes the single machine-readable source of
truth for phase order, dependencies, outputs, and gate blocking. The router's
table is deleted; the router now reads the graph. Rejected: hardcoding the graph
in the lint script, and keeping the table as "the readable version" — a readable
copy of a machine-readable truth is just a copy that goes stale.

Side benefit for the portability goal: an n8n or CrewAI graph can be built
directly from `pipeline.json` without re-deriving the pipeline from prose.

### What the lint checks

Staleness by upstream hash, requirement coverage, orphaned `Traces:` references,
outputs missing for their declared status, slices with no requirements, and
contract-versus-pipeline drift.

### Verification

Fixture with three planted defects — a stale PRD, an untraced requirement, a
trace to a nonexistent ID. All three caught. Two further checks run
deliberately:

- **A check that never fires is not a verified check.** The contract-drift rule
  found nothing on the first run, which looked like a pass but only proved the
  contract was currently correct. Deleting a layout line made it fire.
- **Can it reach zero?** A linter that always finds something gets ignored.
  Fixing the fixture produced a clean exit.

### Notes for the write-up

**The lint is the only honest component in the pipeline.** Every other part is a
model assessing work a model did. Staleness in particular cannot be delegated to
judgement: a model asked whether a downstream document is still accurate after an
upstream edit says yes, because it has no memory of the earlier version to
compare against. A hash does.

**One open judgement call:** the lint flags an artifact whose status is `draft`
but whose file does not exist. Correct by the contract's status definitions, but
it may prove noisy in practice if phases get marked `draft` on entry rather than
on first write. Left in, flagged for the first retro.

---

## Session 4 — critique, the gate everything else runs through

The risk with this skill is specific: a model asked to review something produces
three minor suggestions and approves. Prose telling it to be tough does not fix
that. Three mechanisms instead of motivation:

**1. The verdict is computed, not chosen.** The model produces findings with
severities; a rule maps them to pass/fail. Any `blocker` or `gap` fails. There is
no moment where the model gets to be agreeable.

**2. Every finding must name a downstream consequence.** Not *"R-004 could be
clearer"* but *"R-004 is silent on session lifetime after a password change, so
architecture will pick one and system-spec will encode it as fact."* This single
rule does two jobs — it kills invented nitpicks, because a fabricated finding
cannot name a plausible consequence, and it forces real ones to be specific.

**3. Skipping costs you.** An unanswered checklist item is recorded as a `gap`,
which fails the artifact. Silence is not a cheap way out.

Also adopted: **checklists never re-check what the lint checks.** Coverage,
staleness, orphans, ID uniqueness are the script's job, and spending model
attention on them is waste. Each checklist opens by saying so.

And: missing content is not a gap when the artifact defers it explicitly with a
`Q-###` or `D-###`. Deferring on the record is how the pipeline is meant to work;
deciding by omission is what the gate exists to catch. This makes the registers
load-bearing rather than bureaucratic.

### The discrimination test

A gate that fails everything is as useless as one that passes everything, so both
a deliberately bad PRD and a deliberately good one were run through the
checklist.

| | blockers | gaps |
|---|---|---|
| bad PRD | 2 | 6 |
| good PRD | 0 | 1 |

The test found a hole in the checklist that review had not. The bad PRD specified
JWTs in localStorage and Postgres — a *mechanism* failure — and no checklist item
caught it, because the item covering that case existed only on the frame
checklist. Added as prd item 1: a PRD that settles implementation choices is a
blocker, since architecture inherits them as given and never records why. Notably
this is where security decisions get made in a product document by nobody in
particular.

**Caveat for the write-up:** this was a self-run — same context, and the author of
the skill grading it. It is a sanity check, not an evaluation. The real test is a
subagent run in Claude Code against the same two fixtures, which is also the only
way to confirm the fresh-context instruction is honoured rather than
rationalised away.

### Open question raised by the test

With *any gap → fail*, the good PRD still failed, on one legitimate finding
(sessions on account deletion, an unstated scope edge). So a well-made artifact
fails its first gate. That may be correct — first-pass fail is cheap, the
findings get fixed, the second pass is clean — but it gives the verdict low
resolution, and the router's two-strike rule now sits one failure closer to
firing than intended.

**Resolved (session 4a):** gaps get explicit human dismissal rather than
blocking. Verdict becomes three-valued — `fail` on any blocker, `hold` on
gaps-only, `pass` otherwise.

The implementation detail is the whole decision. A `dismissed: true` flag would
have been an agreeable escape hatch: give a model a way to wave a finding away
and it will use it. So **dismissal is an edit to the artifact, not an override of
the gate.** The human's dismissal is written in as a `Q-###` or `D-###`, and on
re-gate the finding stops firing mechanically — because `critique` already treats
deferred-on-the-record content as not-a-gap. The dismissal path and the deferral
rule turned out to be the same mechanism, so nothing new had to be tracked and
there is no state the model can fudge.

Second-order effect: `hold` is not a failure, so the router's two-strike rule now
counts only `fail`. A well-made artifact holding on its first gate is normal and
no longer nudges the pipeline toward a spurious upstream escalation. That was the
actual defect behind the open question.

**Resolved (session 4b):** at `patch` ceremony, gaps auto-defer as `D-###` marked
`Decided by: model` and resurface at the human verification gate.

Nothing new had to be built for the resurfacing. The contract already said that a
blocking gate lists outstanding model-decided entries before it can be satisfied,
and the verification gate is a blocking gate. The rule composed rather than
accreted — the third time in this build that a new requirement landed on
machinery already present (`hold` reused the deferral rule, dismissal reused the
registers, this reused the blocking-gate rule).

That is worth stating as a design signal for the write-up: **when a new
requirement needs no new mechanism, the existing mechanisms are probably at the
right level of abstraction.** When it needs a flag, they probably are not.

**Decision 12:** the ceremony table moves out of `CONTRACT.md` into
`pipeline.json` as `sizes[<size>].{phases, gap_policy}`.

This one was embarrassing. Decision 11 removed the pipeline table from the router
because a readable copy of a machine-readable truth is just a copy that goes
stale — and the same table was sitting in the contract, in prose, unnoticed,
while I wrote the rule that condemned it. The contract now keeps only what
`pipeline.json` cannot carry: what `auto_defer` means.

Generalisable: **the duplication you introduce is easier to see than the
duplication you already live with.** A rule adopted mid-build does not
retroactively sweep the files written before it. Worth a pass over every earlier
artifact each time a structural rule is adopted — or a lint check, which is
cheaper.

---

## Session 5 — frame, and making invention visible

The head of the pipeline has one hard problem: the model produces plausible user
needs fluently, and a plausible invented need is indistinguishable from a real
one three artifacts later, once the architecture has been built around it.

**Decision 13:** every requirement carries a `Source:` line — a pointer into the
discovery material, or the word `assumed` with the `D-###` recording it.
Provenance stops being something the model holds in its head and becomes text in
a file, which means a script can check it. Leading word for the skill: everything
here is either **heard** or **inferred**, and the file says which.

**Decision 14:** the authoring skill does not read the gate's checklist.

An author writing to an adversarial checklist turns the gate into a rubber stamp
— compliance gets performed rather than the work done. So the split is: *format
rules live in the contract, adversarial questions stay private to the gate.*
`frame` learns the `Source:` format from `CONTRACT.md` and never sees the
checklist it will be judged against. This also killed a duplication that was
about to happen, since the alternative was restating checklist items inside the
authoring skill.

### The checklist item that had to move

Adding the lint check made `frame` checklist item 4 obsolete as written — it
asked the model to verify that unattributed claims were marked, which is now
mechanical. Rewritten to ask something a script cannot: **is the cited source
laundering an inference?** A ticket volume showing people contact support about
logins does not establish *why* they do. An inference dressed as a citation is
now a `blocker`, and rated worse than `assumed` — because `assumed` is honest and
gets confirmed later, while a laundered assumption has been promoted to evidence
and no downstream phase will question it.

General pattern, third time it has appeared: **when a mechanical check lands, the
model-judged item covering the same ground should not be deleted — it should be
raised to whatever the script cannot reach.** The script checks presence, the
gate checks substance.

### Verification

Three states, as with the earlier checks: fires on all three requirements when
none carry a source; fires on exactly one when two of three are sourced; reaches
clean when all are. Discrimination, not just detection.

### A tension worth flagging for the first retro

`frame` tells the model to interview the human when discovery material is thin,
and to stop when answers stop changing the requirements. That stopping criterion
is the weakest thing in the skill — it is judgement, not a check, and an eager
model will either interrogate the human to exhaustion or accept the first thin
answer. No mechanical fix suggested itself. Left as prose, flagged, and worth
watching in the first real cycle.

---

## Session 6 — journey, and the half that never gets written

Journeys have a different failure mode from requirements. Provenance is already
settled upstream — requirements arrive carrying `Source:` lines — so the risk is
not invented needs. It is that the model writes the sunny path, which is the easy
half, and stops.

**Decision 15:** journeys carry an `Exits:` line, checked by the lint. An exit is
where the person leaves without the thing they came for. These become the success
metrics in the PRD, the error paths in the spec, and the support burden after
launch, so they are not a nicety at the end of a journey — they are most of its
information content.

The distinction that had to be spelled out: an exit is what the *person* does,
not what the system does. *"Displays an invalid token error"* is system
behaviour, and a model will write that and consider the unhappy path handled.
*"The link has expired, they request a third one, then call support"* is an exit.
The checklist rates the first as a `gap` for exactly that reason.

**Decision 16:** a journey runs **trigger to resolution** — starting outside the
product, ending with the goal met or abandoned. This is a granularity rule
disguised as a narrative one, and it is what makes journeys sliceable later.
*"User is on the dashboard and clicks Settings"* has neither end, and the slicing
phase cannot make a deployable slice from it.

Also carried over from `frame`: a `Depends on:` line for everything the journey
assumes about the world outside the product. Steps are inference — that is fine
and unavoidable — but the load-bearing inferences are the external ones, and they
are where architecture finds surprises late.

### Refactor, deliberately

The `Source:` check was written as a one-off for `frame`. Adding two more line
tokens for `journeys` would have meant a second near-identical loop, so the check
became data-driven: a `BLOCK_RULES` table mapping phase to prefix and required
line tokens. Three phases' worth of rules now fit in four lines, and later phases
add a row rather than a loop.

Worth noting as a discipline point, since the guidelines this build runs under
say not to refactor what is not broken: the trigger was a *second* instance, not
a hypothetical third. The regression test below exists because the refactor
touched working code.

### Verification

- **Regression:** the `frame` `Source:` check still fires after the refactor.
- **Fires:** both journeys flagged when neither carries `Exits:`.
- **Discriminates:** exactly one flagged when one has exits and one does not.
- **Reaches clean:** whole lint back to zero once both are complete.

### Note for the write-up

Checklist item 4 is the journey version of source laundering — a journey citing a
requirement it never actually exercises. It is worse than an omission, because
the lint will report that requirement as covered and nothing downstream looks
again. The same shape has now appeared at two consecutive phases, which suggests
**every traceability mechanism creates a matching way to fake it**, and the gate
item that catches the fake is worth writing at the same time as the mechanism.

---

## Session 7 — domain-model, and turning drift into a grep

Open problem from the previous session: naming drift was only *detectable*, by a
checklist item asking a model to read two artifacts and notice they disagree.
That is exactly the kind of judgement this build has been moving into scripts.

**Decision 17:** domain terms carry an `Aliases:` line recording the names
**rejected** for that term, and the lint treats those names as forbidden in every
artifact downstream of the domain model.

Recording the losing names is what makes prevention possible. A domain model that
only records winners tells a script nothing — *Session* being correct does not
tell it that *login* is wrong. Listing *login* as rejected turns drift from a
reading comprehension task into a whole-word search. The check found
`prd: uses 'login', a name the domain model rejected` in the fixture on the first
run.

Design note worth the write-up: **the artifact of a decision is usually the
rejected options, not the chosen one.** The chosen option is visible everywhere
downstream anyway; the rejected ones vanish unless written down, and they are
what let you detect a later drift back toward them. The same shape appears in
`decisions.md`, which has carried an `Alternatives rejected:` field since the
first session without me noticing it was the same idea.

**Decision 18:** `Aliases: none` is a claim, not a formality. Checklist item 6
exists because an unfound alias does not merely omit information — it silently
disables the drift check for that term everywhere downstream. A mechanism that
can be switched off by writing "none" needs a gate item pointing at exactly that.

### The lint grew a second declaration style

`BLOCK_RULES` previously keyed on ID prefix, but domain terms have no IDs — the
word *is* the identifier, and inventing `TERM-004` would have been ID machinery
for its own sake. So `declares` now accepts either an ID prefix or `hN`, meaning
every heading at depth N. One branch, and it kept the ID scheme from growing a
seventh prefix nobody would want to write.

### Verification

- **Regression:** `frame` and `journeys` checks both still fire after the change.
- **Fires:** both required lines flagged on an incomplete term.
- **Fires:** rejected name caught in a downstream artifact.
- **Discriminates and reaches clean:** replacing the rejected name with the
  chosen one returns the whole lint to zero.

### Known limitation

The drift check is a case-insensitive whole-word match, so a rejected name used
in ordinary prose — *"users log in"* against a rejected *"login"* — will be
flagged. False positives are cheap here, since a human reads the lint output and
the fix is a wording change, but a product whose rejected names are common
English words will see noise. Left as-is, flagged for the first retro; the
obvious mitigation, only matching capitalised uses, would miss the real drift
case of a lowercased rejected term.

---

## Session 8 — prd, and the doubt from session one

Session one flagged the PRD as possibly not earning its place: with `frame`
holding requirements, `journeys` holding flows, `domain-model` holding vocabulary
and `system-spec` holding the technical cross-cutting, what is left?

Scoping the skill answered it. **`frame` says what is true; the PRD says what we
are going to do about it.** Scope in and out, success metrics with a measurement
source, sequencing, non-goals — none of those live anywhere else, and all four
are decisions rather than descriptions. Frame is the world; the PRD is the
commitment. It stays.

That distinction also names its failure mode, which is the reason the doubt
existed: a PRD that *describes* instead of *deciding* becomes a prose
recapitulation of everything upstream. Twice the tokens, a second source of
truth, stale within the cycle.

**Decision 19:** artifacts add, they do not restate — enforced pipeline-wide.
The lint now flags any sentence of twelve or more words appearing verbatim in a
phase and in any of its transitive upstream phases.

Notes on the implementation: metadata lines (`Traces:`, `Source:`, `Exits:`,
`Aliases:`, `Depends on:`, `Relates to:`) and fenced code blocks are stripped
before comparison, since those are supposed to repeat. The twelve-word floor
keeps short shared phrasing — headings, standard labels — from tripping it.

It catches copy-paste, not paraphrase, so checklist item 9 was written at the
same time to catch the reworded kind. This is now deliberate practice rather than
a discovery: the mechanical check and the gate item covering what it cannot reach
get written together, because the previous three sessions each found the gap a
session late.

### Housekeeping

The PRD checklist had two items numbered `2`, from inserting the mechanism item
in session 4 without renumbering. Corrected, and worth recording rather than
quietly fixing: a numbered list edited by insertion is exactly the kind of drift
this pipeline is built to catch in *product* artifacts, and it went unnoticed for
four sessions in the pipeline's own files. The lint checks the product's
documents, not the suite's.

### Verification

- **Regression:** `frame`, `journeys` and `domain` line checks all still fire.
- **Fires:** PRD copying a sentence out of `frame.md` is caught.
- **Discriminates and reaches clean:** a PRD that decides rather than describes
  returns the lint to zero.

---

## Session 9 — the assumed-context defect

Review caught the PRD intro preaching again — *"it is the most common way this
artifact becomes worthless"* is design justification, not instruction. But the
sentence underneath it was the real finding: `prd` opened with *"frame.md says
what is true"* and never told the agent to read anything explaining what
`frame.md` is, why it is authoritative, or what `R-###` means.

**All five skills built so far had this hole.** None instructed the agent to read
the contract. They were written by someone with eight sessions of shared context,
for a reader who has none — and the normal case is precisely a reader with none,
since gates spawn subagents and `handoff` exists to replace contexts entirely.

**Decision 20:** every skill opens by reading `.sdlc/CONTRACT.md` and its own
phase entry in `.sdlc/pipeline.json`.

Worth separating two things that look alike: duplicating *content* across files
is the sin this build has been chasing since session 2. Duplicating a *pointer*
is not — a reference has to appear at every entry point or the entry point does
not work. The same three-line orientation now opens five skills and that is
correct.

**Decision 21:** the contract gains an *If you are a phase skill* section — what
a cold agent needs and cannot infer:

- inputs and output come from `pipeline.json`, not from the conversation
- upstream artifacts have passed their gates; use them, do not re-derive them
- an upstream artifact that looks wrong gets a `Q-###`, not a quiet edit — that
  rule did not exist anywhere before, and the default behaviour it prevents is a
  model helpfully correcting a gated decision and attributing the change to
  nobody
- write your own output and the registers, nothing else

And two sentences at the top saying what a cycle and a phase are. The contract
defined every part of the pipeline without once saying what the pipeline was.

### Descriptions rewritten

From trigger phrasing to reach phrasing: *"Use when a cycle needs its commitments
settled"* became *"Invoked by the pipeline router at the prd phase."* These
skills are reached by name from a router, not selected from an ambient
description, so the description's job is to say what the skill does and where it
sits — not to compete for attention with thirteen siblings.

### Note for the write-up

This is the failure mode of writing skills conversationally with someone. Every
session built shared vocabulary — *gate*, *hold*, *baton*, *trace*, *exit*,
*rejected name* — and each one silently became a thing the skill assumed rather
than stated. The files read fluently to both authors and would have run badly for
anyone else. **The test is not whether the skill reads well; it is whether it
reads well to something that has never seen the project.**

---

## Session 10 — the suite lints itself

Two sessions ago the suite drifted twice and both times it was caught by luck.
Last session's cold-read fix was asserted rather than checked. Both problems have
the same answer: `scripts/suite_lint.py`, which checks the skills the way
`sdlc_lint.py` checks a product's documents.

Checks: the pipeline graph and the skill folders agree; every gated phase whose
skill exists has a checklist; every size names phases that exist; frontmatter
names match folders; every skill tells the agent to read the contract; every path
a skill points at is declared in the contract; every line token a skill uses is
defined in the contract; and no skill exceeds a line budget.

### It found real defects on the first run

**`scripts/sdlc_lint.py` was referenced by six skills and declared nowhere.** A
cold agent instructed to run it had no way to know where it was.

Following that thread by hand found a worse one the lint could not see: **the
router's scaffold copied `CONTRACT.md` into `.sdlc/` but never copied
`pipeline.json`** — which step 2 of the same skill then reads. The runtime files
were not self-contained, so the claim that any orchestrator can drive this from
the repo was false. Scaffold now copies the contract, the pipeline and the lint,
and every skill points at `.sdlc/scripts/sdlc_lint.py` rather than a
skill-relative path.

**`Depends on:` was invented in the `journey` skill and never added to the
contract.** Exactly the drift the token check exists for, sitting undetected for
four sessions.

### Unbuilt is not broken

The first run produced 24 findings, 16 of which were phases not yet written.
Noise of that kind buries the two findings that mattered. The lint now separates
**findings** from **pending**, and only findings affect the exit code — so it is
usable during the build and afterwards, and the pending list doubles as a
progress report.

Generalisable: **a check that reports absence and defect in the same channel gets
ignored during exactly the period when it is most useful.**

### The line budget exists now

Session one promised a size budget to stop `improve` growing skills without
bound. It is real as of this session: 150 lines, and the message says *split it
or prune it, do not raise the budget*, because raising the budget is what the
model will otherwise propose. Current largest is `critique` at 104.

### Verification

Five negative tests, one per check: orientation removed, invented line token,
undeclared path, deleted checklist, skill bloated past budget. Four fired
immediately. The fifth appeared not to — and the test was wrong, not the check:
the `sed` targeted a path that skill does not contain, so nothing was corrupted.
Retested against a path it does have, it fired.

Worth recording, since it is the more interesting failure: **a negative test that
does not fire is ambiguous between a broken check and a broken test**, and the
instinct is to assume the check. Verifying the test actually changed the file
costs one command and settles it.

---

## Session 11 — design, the first phase that could have produced theatre

Two things made this phase different from every earlier one.

**Its output is a directory, not a file.** The block-rule machinery read a
phase's whole output, which for `design` would have meant every heading in the
style guide needing a `Traces:` line. `BLOCK_RULES` entries can now name a
specific file, so the screen rules apply to `docs/design/screens.md` and leave
`style-guide.md` alone. Three lines, and it is the shape any later
directory-output phase will need.

**It is the first phase where a model can produce something that looks like work
and is useless downstream.** A wireframe image cannot be traced to a journey,
diffed when it changes, or read by the phase that has to build it. So the skill's
first instruction is that everything it produces is text a later phase can read —
layout in fenced blocks, decisions in prose, tokens in a table.

**Decision 22:** screens carry a `States:` line, and *populated* is one state
rather than the default.

This phase is the first with an upstream source for its unhappy paths. Journeys
already carry `Exits:` — where people leave without what they came for — and
every one of those exits happens on a screen. The skill therefore says to design
the exits first and the working path second, and checklist item 1 asks the gate
to name the screen and state handling each exit.

Worth noting for the write-up: this is the first time a mechanism introduced for
one phase paid off in a later one without being extended. `Exits:` was added to
solve a journeys problem; two phases later it is the coverage obligation for
design. **Mechanisms that name real things tend to be reusable; mechanisms that
name process steps tend not to be.**

**Decision 23:** style tokens are values, not adjectives. *Calm professional
green* cannot be implemented; `#1B4D3E` can. The failure this prevents is not
ugliness — it is that the build makes the choice silently and no decision is ever
recorded as one. Same shape as mechanism-in-the-PRD, one phase later.

### The suite lint earned its place again

Having written the skill, `suite_lint.py` immediately reported that `design` was
gated with no checklist. That is the second consecutive session where the suite
lint caught something I would otherwise have discovered a session later, and the
first where it caught an omission *during* the work rather than after.

### Verification

- **Fires:** a screen with no `States:` line.
- **Correctly scoped:** style-guide headings are not subject to the screen rules,
  confirming the new `file` key works rather than merely not crashing.
- **Reaches clean:** completed screens return the product lint to zero.

---

## Session 12 — functional language, and what "preaching" actually means

Review again: the `design` skill was explaining its own design rather than
instructing. Same failure as session 9, and the cause is the same — these skills
are written conversationally, so the justification that belongs in this log leaks
into the file.

Auditing it produced a sharper rule than "cut the rationale", because two
passages that read identically failed differently:

- *"an image cannot be traced to a journey, diffed when it changes, or read by
  the phase that has to build it"* — **cut.** It justifies an instruction that
  costs nothing to follow. A model was not going to emit images here anyway, so
  there is no attractive shortcut for the rationale to guard.
- *"calm, professional green cannot be implemented, `#1B4D3E` can"* — **kept.**
  It reads like justification but it is definition by worked contrast. Remove it
  and "value, not adjective" is ambiguous.

So the session-2 rule refines to: **rationale earns its place when it guards a
costly instruction, and an example earns its place when it disambiguates a rule.
Everything else is the author talking to the reader.**

Result: 652 → 539 words, and the procedure became a numbered order of work rather
than prose describing an order.

**Decision 24:** every phase skill states `Produces:` immediately after the
orientation line.

This duplicates `pipeline.json` on purpose. The alternative — a cold agent
resolving its own output through an indirection — is worse than one line of
controlled duplication. What makes it safe is that `suite_lint.py` now checks the
stated paths against the graph, which is the same answer this build gave to the
contract-drift problem in session 3: *duplication is acceptable exactly when it
is checked.*

### A defect found by accident

Piping the lint into `head` produced a `BrokenPipeError` traceback. Not a logic
bug, but a real usability defect in a tool whose entire purpose is to be piped
into `head` and `grep`. Fixed in both lints.

Worth recording because of how it surfaced: it appeared in the stderr of a test
that was checking something else entirely. **The incidental output of a test is
worth reading**, which is an argument against tests that only assert and report
a boolean.

### Verification

- Produces pointing outside the declared output: fires.
- Produces missing entirely: fires.
- Both lints clean, exit 0, and no traceback when piped.

---

## Session 13 — the description is read before everything else

> **Naming note.** From this entry onward, the phase called `frame` above is
> called `discovery`, and a `cycle` is called an `iteration`. Earlier entries are
> left as written; rewriting them would falsify the record of how the names were
> arrived at.

Review: *"'Frame for a cycle' sounds like a bicycle frame. What kind of cycle?
You are starting to lose even me, and I am the one who will ultimately be
invoking the skills."*

The diagnosis underneath that is sharper than "too much jargon". **The
description field is the only text read before any file is opened.** Every other
line in a skill can lean on the contract, which has defined *cycle* and *phase*
since session 9. A description can lean on nothing — and every one of them had
been written in a vocabulary that exists only inside this project.

**Decision 25:** descriptions may not use any term the contract defines, enforced
by a vocabulary blacklist in `suite_lint.py`.

Writing that check produced an unintended result worth keeping: it rejects the
word **frame** in the frame skill's own description. A skill that cannot name
itself without using undefined jargon has a naming problem, and that turned an
opinion into a finding.

**Decisions 26 and 27:** `frame` → `discovery`, and `cycle` → `iteration`.

Every other phase was already self-describing — journeys, domain model, PRD,
design, architecture, system spec, slices. `frame` was the only coined noun, and
it was the first thing anyone touched.

### The renames were the cheapest test of the lints so far

Nine files changed across skills, checklists, the contract, the pipeline graph,
both lint scripts and the fixture. Both lints were clean afterwards, and the
negative tests still fire under the new names. That is the whole argument for
building the checks before the content: **a rename is cheap while the tooling can
verify it and expensive once it cannot.** Doing this after the remaining nine
skills would have been a different kind of job.

One incidental confirmation: editing `discovery.md` during the regression test
cascaded `journeys`, `domain` and `prd` to `STALE` automatically. The staleness
mechanism from session 3 has never been exercised by a real upstream edit until
now, and it behaved correctly without being touched.

### Note for the write-up

Three sessions in a row have now been review-driven rather than build-driven —
preaching, assumed context, jargon. All three were the same underlying fault:
**skills written in conversation inherit the shared vocabulary of that
conversation.** The mechanical fixes that came out of it are the durable part,
because they work on the eight skills not yet written, and none of them would
have been found by testing the skills against their own author.

### Session 13a — the rename was not complete, and the check said it was

Asked directly whether the rename had reached every skill. It had not.

`design/SKILL.md` was genuinely clean — it never used either word — so its
absence from the changed-files list was correct. But `discovery/SKILL.md` still
contained `# Frame — <product>` in the document template it instructs the agent
to write. Every discovery document the suite produced would have been titled
*Frame*. Two more stale references survived in the test fixture.

The substitutions were case-sensitive. **So was the residue check run immediately
afterwards**, which reported "none" and proved nothing, because it shared the
exact blind spot of the operation it was verifying.

That is the same failure as the negative-test lesson in session 10, one level up:
**a verification built on the same assumption as the thing it verifies cannot
fail.** Case sensitivity here; it could as easily be a path convention, an
encoding, or a regex that both the writer and the checker got wrong the same way.
The fix is not care — it is making the check differ from the operation in the
dimension most likely to be wrong. A case-insensitive grep after a
case-sensitive rename takes one flag.

Headings are where this bites, because headings are where title case lives, and
templates inside skills are headings that become the first line of every artifact
the pipeline produces.

Neither lint caught it, and neither reasonably could — `# Frame` inside a fenced
example block in a skill file is not a contract violation, a missing line token,
or an undeclared path. Worth stating plainly for the write-up: **the lints check
structure, and a rename is semantics.** No amount of mechanical checking removes
the need to read the thing afterwards, or to be asked a direct question by
someone who has not stopped paying attention.

---

## Session 14 — architecture, the first step writing cannot finish

Every phase so far could be completed by producing good text. This one cannot.

**Decision 28:** the architecture step is complete when a thin end-to-end path is
deployed and a command proves it, not when its documents are written.
`docs/architecture/skeleton.md` carries a `Verified by:` line — a command anyone
can run — and the lint refuses to let the step past `critiqued` without one.

That is the first check in the suite that reaches outside the documents. It does
not run the command, which is the honest limit of a text linter, but it makes the
absence of one a finding rather than an omission nobody notices.

The skill also requires a **"what this did not prove"** section. A skeleton that
deploys a route and a database write has tested the deploy pipeline and the
storage round trip and nothing else, and the integrations still taken on trust
are where the next surprise is. Named, they become `Q-###`; unnamed, they surface
during the third slice.

**Decision 29:** architecture output becomes a directory, mirroring `design` —
`overview.md`, `components.md`, `adr.md`, `skeleton.md`. Two element types with
different required lines could not share one file under the block-rule machinery,
so `BLOCK_RULES` values became lists of rules. Components require `Traces:`; ADRs
require `Traces:` and `Alternatives rejected:`.

### The bans upstream only work if this phase checks the handoff

The PRD and design checklists both forbid naming technologies, on the grounds
that architecture decides them. That is only true if someone verifies the handoff
happened. Checklist item 1 makes it explicit: search the upstream artifacts for
every technology named, and require an ADR here adopting or overturning each. A
choice that arrived from an earlier phase with no ADR was never made by anyone.

Worth stating generally: **a prohibition in one phase creates an obligation in
another, and the obligation is the half that gets forgotten.** Three phases
carried the ban for several sessions with nothing on the receiving end.

### Rejected alternatives, third appearance

`Alternatives rejected:` on ADRs is the same mechanism as `Aliases:` on domain
terms and `Alternatives rejected:` in `decisions.md`. The rationale is identical
each time: the chosen option is visible in the artifact forever, and the
alternatives are recoverable only from the record. Checklist item 2 guards the
predictable cheat — a strawman alternative that makes a decision look examined
while leaving the real trade-off unrecorded.

### Verification

Four negative tests: missing skeleton, skeleton with no `Verified by`, component
with no `Traces:`, ADR with no rejected alternatives. All fired. Completed
architecture returns both lints to clean.

One self-inflicted error worth recording: patching the lint by string-index
splice left a stray brace and a syntax error. The fix was to view the file rather
than reason about what the edit had done. **An edit applied by arithmetic needs
reading afterwards; an edit applied by matching does not** — which is an argument
for `str_replace` over index manipulation whenever the file matters.

---

## Session 15 — three kinds of coupling, and a graph that was lying

Challenge: the skills were supposed to be independent, but `architect` names
`CONTRACT.md` and `journeys.md`. Is the expectation unreasonable?

It is reasonable, but it needs splitting, because only one of the three kinds of
coupling here is a problem:

| Coupling | Status |
|---|---|
| skill → skill | forbidden, and does not occur — the router holds the graph |
| skill → contract | intended; the shared spine is what keeps skills independent of each other |
| skill → sibling artifact path | the real issue |

The third kind already cost real work: renaming `frame` in session 13 meant
editing every skill that mentioned `docs/frame.md`.

### Auditing it found two defects

**`architect` read `docs/journeys.md` and `docs/design/` while declaring
dependencies only on `domain` and `prd`.** Staleness is computed from
`depends_on`, so a change to the journeys or the designs would never have marked
the architecture stale. The session-3 mechanism had a hole in it that nothing
would have surfaced except reading the two things side by side.

**`journey` references `docs/domain-model.md`, which is produced after it.**
Deliberate — on a second iteration the vocabulary already exists — but it cannot
go in `depends_on` without creating a cycle. It now has an honest name:
`reads_if_present`, a soft input that does not participate in staleness.

**Decision 30:** every artifact path a skill names must be its own output, a
declared dependency, or a `reads_if_present`. Enforced in `suite_lint.py`.

### Why the paths stay rather than being removed

The obvious decoupling — replace `docs/journeys.md` with "your inputs" — was
considered and rejected for now. It trades a known cost against a speculative
one. Sessions 9, 12 and 13 were all caused by skills being *less* legible to a
cold reader than their authors believed, and `Produces:` deliberately duplicates
`pipeline.json` for exactly that reason. Adding indirection now would undo that
lesson to buy portability across pipeline reconfigurations that have not happened
yet.

The position this build keeps landing on: **coupling, like duplication, is
acceptable exactly when it is checked.** What was wrong here was not that
`architect` read the journeys — it must — but that nothing verified the graph
knew about it.

Worth revisiting if the pipeline is ever reconfigured for a different product
shape, which is the point at which the trade reverses.

### Verification

- Graph fix: both lints clean afterwards.
- Negative: pointing `architect` at `docs/slices.md` fires immediately.
- The product lint is unaffected by the wider `depends_on`, though architecture
  now correctly goes stale on a journeys or design change.

### Session 15a — the sweep

Reversed after seeing the scope: sibling artifact paths replaced with role names.
Fifteen references across nine files. A skill still names its own output by path;
everything else is *the discovery document*, *the journeys*, *the domain model*,
*the PRD*, *the designs*, *the slice backlog*. Roles resolve through
`pipeline.json` — the role is the phase, the file is its `output` — and the
contract now says so, because a cold agent otherwise cannot follow the
indirection.

**Decision 31:** artifacts are referenced by role, not path.

### Two problems the substitution exposed

**Role names collide with ordinary English.** *"the requirements"* appeared in
five places that were never references — *"Size the component set to the
requirements in front of you"*. Since the phase is now `discovery`, the
unambiguous role is *the discovery document*. General rule: **a role name has to
be distinctive enough that a checker can tell a reference from a sentence.** That
constraint is invisible until something mechanical depends on the word.

**Mechanical substitution produces grammar nobody would write.** `design` came
out with *"every journey in the journeys"*. The sweep replaced strings correctly
and the result was still wrong, which is the session-13 lesson in a new costume:
structural correctness is not semantic correctness, and reading the diff is not
optional.

### The check survived, in a better form

The worry raised before the sweep was that it would delete the check that had
just caught a real bug. It did — and a stronger one replaced it. The new check
reads role words rather than paths, and flags one only when the role's phase sits
**upstream** in the pipeline order and is not declared. That distinction matters:
`journey` mentions *the PRD* while explaining why exits matter, and the PRD is
produced later, so it cannot be a read. A forward mention is explanation; an
undeclared upstream mention is an unpinned dependency.

Verified three ways: dropping `journeys` and `design` from `architecture`'s
`depends_on` reproduces the original bug and fires; reintroducing a hardcoded
sibling path fires; and `journey`'s forward mention of the PRD stays quiet.

Net effect: a phase rename now touches `pipeline.json`, the contract, and the
role lexicon in `suite_lint.py` — not eight skill files.

---

## Session 16 — spec was two skills

`spec` was to serve both the `system-spec` and `slice-spec` phases. Building it
made clear it should not, and the checker had already broken on the assumption.

`suite_lint.py` builds `{p["skill"]: p for p in phases}`. With one skill on two
phases that dict silently keeps the last, so the role audit was validating
`slice-spec`'s declared dependencies against `system-spec`'s text. **A design
choice was corrupting a check, quietly, and neither lint could report it because
the corruption was in the checker's own model of the world.**

**Decision 32:** `spec` splits into `system-spec` and `slice-spec`.

The two jobs share nothing but the word. One writes cross-cutting technical
decisions once per iteration from the architecture and the domain model; the
other writes what a single slice does, just in time, and ends in a task list.
Different inputs, different lifecycle, no overlapping content. A single skill
would have been a disguised `if phase == …`, with every invocation carrying the
half that did not apply — the granularity failure `skill-this` warns about,
arrived at from the opposite direction from session 1.

**Decision 33:** `docs/system-spec/` becomes a directory — `data-model.md`,
`environments.md`, `security.md`, `operations.md` — the third phase to need this,
after `design` and `architecture`. Entities carry `Traces:`.

### A false positive worth keeping rather than suppressing

The role check fired on the system-spec checklist, which said *"the same failure
as adjectival tokens in the designs"*. That is an **analogy, not a read**, and
the check cannot tell the difference.

The fix was to reword the analogy, not to weaken the check — but the limitation
is real and belongs in the record: **a lexical check on role words cannot
distinguish a reference from a comparison.** The constraint it imposes is that
role words stay out of non-referential prose, which is a genuine cost to how
these documents are written and the second time this has come up, after *"the
requirements"* in session 15a.

The alternative — dropping the check because it has false positives — would have
cost the thing that caught the `architect` dependency bug. A check with a known,
cheap false-positive mode beats no check, as long as the mode is written down
rather than rediscovered.

### Verification

- Entity with no `Traces:` fires; adding it returns the product lint to clean.
- Suite lint clean after the split, with `slice-spec` correctly listed as pending
  rather than as a defect.

`slice-spec` is deliberately not built in the same session. It is a different
skill with a different checklist, and writing both at once was how `spec` came to
look like one job in the first place.

---

## Session 17 — slice-spec, and the checks reaching past the phase graph

**Decision 34:** every slice spec carries `Delivers:` — what a person can do
afterwards that they could not before, observable from outside the system.

This is the verticality test, and it is deliberately a sentence rather than a
category. A slice that cannot fill it is horizontal: an endpoint with no caller,
a schema with no behaviour, a screen with no data. The skill's instruction in
that case is to stop and raise a `Q-###` against the slice backlog rather than
specify it, because the human verification gate at the end of the slice would
have nothing to verify.

Tasks carry `Verified by:` — reused from the walking skeleton rather than
invented. Fourth reuse of a line token across phases, and the pattern from
session 11 holds: tokens naming real things travel, tokens naming process steps
do not.

### Slice specs sit outside the phase graph

Their path contains a placeholder — `docs/slices/{slice}/spec.md` — so they are
absent from the lint's `texts` map and were escaping the naming-drift and
restatement checks entirely. That matters more here than anywhere: **the slice
spec is the last document before code, so a rejected domain name that survives it
becomes a table name.**

They are now read by glob and checked for all four: `Delivers:`, `Verified by:`
on each task, rejected domain names, and sentences copied from upstream. The
fixture caught `uses 'login', a name the domain model rejected` inside a slice
spec on the first run.

The placeholder also broke two suite checks that compared paths literally —
`{slice}` was being stripped to produce `docs/slices//spec.md`. Both now compare
against the prefix before the placeholder.

### The vocabulary check caught its own skill

`suite_lint` rejected the `slice-spec` description for using the word *slice*.
Unlike `frame` in session 13, the name is not the problem — vertical slicing is
ordinary industry vocabulary — but the *contract's* meaning of `S-###` is not,
and a cold reader has neither. The description now says *one deployable piece of
work*, which is clearer regardless. **A skill does not need to name itself in its
own description**, and the constraint produced better wording than I would have
chosen unprompted.

### A test that lied, again

The restatement check appeared not to fire on slice specs. It had not run: the
test script raised `IndexError` looking for a long sentence in a file that had
none, and the error went to stderr while `DID NOT FIRE` printed on stdout.
Re-run against a sentence that exists, it fired immediately.

Third time in this build that **a negative test failing to fire was the test's
fault, not the check's** — sessions 10, 15a and now. The pattern is consistent
enough to be a rule: when a negative test does not fire, prove the corruption
landed before touching the check.

---

## Session 18 — slice, and the point where forgetting stops being possible

Three things become mechanical at this phase that could not be earlier.

**Decision 35:** every requirement and journey is either traced by a slice or
named on a `Deferred:` line, and the lint enforces it.

This is the strongest check in the suite, because it is the only one that catches
an **omission across the whole iteration**. Every earlier check asks whether a
document is internally sound. This one asks whether anything upstream was quietly
dropped — and a requirement absent from the backlog is indistinguishable from one
nobody noticed, which is exactly how it gets discovered six weeks later.

Deferring is a normal outcome. What the check forbids is deferring by silence.

**Decision 36:** slices carry `After:`, and a slice named there must be declared
earlier in the backlog.

One positional rule doing two jobs. It catches ordering that contradicts the
document's own sequence, and it catches mutual dependency implicitly: a cycle
requires a forward reference, so a cycle cannot pass. That is cheaper and less
code than a topological sort, and the error message is more useful — it names the
line rather than the graph.

`Delivers:` is reused from the slice specs rather than invented: the backlog
states the delivery, the spec elaborates it. Fifth reuse of a line token.

### The role check found a second real graph bug

`suite_lint` reported that `slice` refers to the discovery document without
declaring it. Not a false positive: step 1 of the skill is *list every
requirement*, and the coverage check compares the backlog against discovery's
declared IDs. **A new requirement added to discovery would never have marked the
backlog stale.** Same class as the `architect` bug in session 15, found the same
way.

Two real missing edges from one check is enough to say what it is for: **the
dependency graph is a claim about what a skill reads, and claims drift from
practice unless something compares them.**

### A design question raised and deliberately left alone

Staleness is computed from *direct* dependencies only, so a change to discovery
marks the journeys stale but not the backlog — the backlog is still consistent
with the journeys it actually read. Propagating staleness transitively was
considered and rejected: it would mark half the pipeline stale on any upstream
edit, including artifacts that will not need to change. The cascade happens
naturally as each document is revised.

The hole this leaves — a new requirement where the journeys legitimately need no
revision — is covered by the coverage check above rather than by staleness.
Recording it because the two mechanisms only look independent.

### Verification

Missing `Delivers:`, forward `After:`, and unplanned requirements all fire
together. Coverage accepts a requirement in a slice and a requirement on a
`Deferred:` line equally. Removing the new dependency edge re-fires the role
check.

---

## Session 19 — implement, and a loop that finally closed

First skill producing code rather than documents, so most of the machinery does
not apply — its output in `pipeline.json` is `null`, and the record of what
happened lives in commits, `decisions.md` and `questions.md` rather than in a new
artifact. Reuse of the existing registers instead of inventing a build report.

**Decision 37:** once a slice is built, the lint checks that every test named on
a `Verified by:` line actually exists in the code.

This closes a loop that has been open since session 17. The slice-spec checklist
had an item about tasks naming tests that would never be written — laundering in
its code form — and it had to be model-judged because nothing could check it.
With code present it is a grep. Tests whose line begins `manual —` are exempt,
and comma-separated items containing spaces are treated as prose rather than
identifiers.

Checklist item 6 was then raised rather than deleted, for the fourth time in this
build: the lint owns existence, the gate now asks whether the named test could
ever fail. **A test that cannot fail satisfies both the lint and the gate while
proving nothing**, and that is the only remaining way through.

### A check that would have fired at the wrong moment

The first version was wrong in a way the fixture exposed immediately: the
slice-spec gate runs *before* any code exists, so every task would have been
flagged for naming a test that had not been written yet — a false-positive storm
at precisely the phase the check was meant to protect.

**Decision 38:** slices carry a status — `planned → specified → built → deployed
→ verified` — and checks that only make sense against code apply from `built`
onward.

Generalisable, and it is the first time this has come up: **a check needs a
notion of when it is due, not only of what it asserts.** Every earlier check was
about a document that either existed or did not. This one spans two phases, and
the same artifact is correct at one and incomplete at the other. Verified both
sides of the boundary — quiet at `specified`, two findings at `built`.

### Note on the skill itself

The instruction that will earn the most is *watch the test fail first*. A model
writing a test and its implementation together produces tests that pass on the
first run and cannot detect the bug they were written for. That is one of the few
places here where the failure is invisible in the artifact: the test exists, it
is named correctly, it passes, and it asserts nothing.

The scope rules — leave adjacent code alone, every changed line traces to a task,
remove only the orphans your own change created — come from the working
guidelines this whole build has run under, which turn out to be the right content
for this skill almost verbatim.

---

## Session 20 — code-review, a gate rather than a gated artifact

Two structural decisions before the content.

**Decision 39:** the review phase's gate is `self`. Every other document-producing
phase is followed by `critique`; critiquing a review would be second-order review
at real cost and little value. `code-review` returns its own verdict in the same
vocabulary, so the router needs no special case, and its checklists live in its
own folder rather than in `critique/references/`.

That distinction had not existed before: some phases *produce* something to be
judged, and some phases *are* the judging. The gate vocabulary now carries three
non-critique values — `tests`, `smoke`, `self` — and each names who decides.

**Decision 40:** two axes, run in separate subagents that do not see each other's
findings. **Spec and scope** — did it do what the slice promised and nothing
besides. **Standards and naming** — does it belong in this codebase, in the words
the domain model agreed. A single reviewer holding both stops noticing one of
them, and it is always the second one.

**Decision 41:** findings carry `Where:`, a `path:line`, and the lint checks the
file exists.

Hallucinated file references are a specific and common failure of AI code review,
and this makes the cheapest version of it impossible. The fixture caught two
fabricated paths on the first run.

### The fresh-context rule is harder here, and the skill says why

Reviewing code genuinely needs the surrounding codebase, so a shared context
feels justified in a way it does not for a document — which makes this the place
the rule is most likely to be rationalised away. The skill names that directly,
because it is a costly instruction and rationale guarding a costly instruction is
the one kind that earns its place.

### The item that only code review can catch

The lint confirms a task's named test exists. The `critique` gate asks whether
the test could ever fail — but at slice-spec time there is no test to read. Only
this phase can open the file. Axis item 3 is therefore the last line of the
laundering chain that started with `Source:` in session 5: a test that exists, is
named correctly, passes, and asserts on a mock it configured itself.

Each step in that chain has been an ID or a line making a claim, and each one
acquired a way to fake it. **Every claim mechanism needs its faked form named at
the point where someone can actually look**, which is not always the point where
the claim was made.

### Verification

Missing verdict and two fabricated file paths all fire; creating one file leaves
exactly one finding; creating the second reaches clean.

---

## Session 21 — deploy, and writing the rollback before you need it

`deploy` had `output: null` in the graph, on the reasoning that shipping produces
a running system rather than a document. That was wrong for two reasons, and both
are about the phase that follows rather than this one.

**Decision 42:** deployments produce `docs/slices/S-###/deploy.md`, carrying
three lines the lint checks: `Verified by:` (the smoke command), `Rollback:`, and
`Try it:`.

**`Rollback:` is written before it is needed**, which is the only time it can be
written honestly. Improvised at the moment of an outage it becomes *redeploy the
previous version*, which is true only if nothing the deployment did was one-way.
The skill therefore requires it to state data consequences, not just code: a
migration that drops a column is a decision to stop being able to roll back, and
that deserves saying out loud rather than discovering.

**`Try it:` exists because of the gate after it.** Human verification is the one
step in this pipeline a model cannot do, and a person who cannot find the change
ends up verifying that nothing appears broken — which is a different and much
weaker claim. A URL and the steps, written for someone who has not read the
slice.

### Smoke checks that prove the wrong thing

The instruction with the most leverage: the smoke command exercises the slice's
`Delivers:` line, not `/healthz`. A health check proves the process started. It
does not prove that ending a session ends it, and a deployment that passes health
and fails behaviour is the most expensive kind, because the pipeline records it
as a success.

Same shape as the walking skeleton in session 14, and `deploy.md` carries the
same *"not covered by the smoke check"* section for the same reason: the parts
still taken on trust are where the next surprise is.

### Reuse count

`Verified by:` now appears on the walking skeleton, on tasks, and on deployments —
its third role, all meaning *the command or test that shows this is true*. The
session-11 observation continues to hold: tokens naming real things travel, and
nothing naming a process step has been reused once.

### Verification

Marked deployed with no document fires; a document with only the smoke command
fires for the two missing lines; complete returns both lints to clean.

---

## Session 22 — retro, and the number this whole build was for

**Decision 43:** the retro reads `.sdlc/scripts/metrics_report.py` rather than
recalling the iteration. A second scaffolded script, aggregating `metrics.jsonl`
per phase and showing which gate caught how many defects.

Run against sample data it immediately produced the thing session 1 promised and
nothing since had been able to compute:

```
design      52,100 tokens   25 mins   0 rework   0 defects
review      15,800 tokens    6 mins   0 rework   5 defects
```

Design took 37% of the iteration's tokens and caught nothing; code review took
11% and caught 36% of the defects. Whether that means the design gate is useless
or aimed wrong is a judgement — but it is now a judgement made against numbers
rather than against an impression of how the iteration felt.

**Decision 44:** every observation in `reflections.md` carries an `Evidence:`
line, checked by the lint. An observation with no evidence is a recollection, and
a process improved from recollections moves in the direction of whatever went
wrong most recently.

**Decision 45:** a recurring pattern keeps the name it had last iteration.
Session 1 required two occurrences before a skill may change; that rule is
unenforceable unless the same problem is called the same thing twice. The stable
`##` heading is the counting mechanism, and it needed no new machinery.

### The retro is deliberately powerless

It writes to `reflections.md` and nothing else — no skills, no checklists, no
contract, no pipeline. A step that assesses a process and edits it in the same
breath leaves no record of what it changed or why, and `improve` exists to make
that a separate act with separate approval.

It is also told not to propose changes on a single occurrence. One bad iteration
is a bad iteration.

### A silent no-op, caught by luck

An edit adding the reflections format to the contract did nothing: it targeted a
sentence removed back in session 2, and the guard I wrote checked a *different*
string that had been added successfully. The edit reported success and changed
nothing.

Third instance of the same class — session 13's case-insensitive residue check,
session 17's test that errored before running, and now a guard that verified the
wrong condition. **A check that shares an assumption with the thing it checks
cannot fail**, and here the shared assumption was "if one replacement worked,
both did".

### Two more suite findings

`retro` reads every slice's review while declaring no dependencies — correctly,
since it runs over the whole record rather than over named upstream phases.
Whole-iteration phases are now exempt from the role audit; the contract-declares
check still catches typos, and the exemption was verified not to leak by
reintroducing a hardcoded path in `architect`, which still fires.

The description used *iteration*, which the contract defines and a cold reader
does not have. Reworded to *a completed round of work*.

---

## Session 23 — improve, and the loop closes

The last skill, and the one session 1 called a sediment generator. Three
guardrails were promised then. All three are now real, and one of them turned out
to be structural rather than a rule.

**`improve` cannot apply anything.** The pipeline runs in a product repository;
the skills live with the skill install. A proposal is a diff in
`.sdlc/proposals/` and a person applies it. That was not a decision so much as a
fact discovered while writing it — and it is a better guarantee than any
instruction, because it does not depend on the model choosing to obey.

**Decision 46:** a proposal carries `Recurrence:`, naming reflection headings
verbatim, and the lint counts how many distinct iterations each appears under. A
proposal resting on fewer than two is rejected mechanically.

This is where session 1's "two occurrences" rule and session 22's "stable
heading" rule meet and become enforceable. Neither works alone: counting needs
stable names, and stable names are pointless if nothing counts them. Two
mechanisms built five sessions apart for different reasons, and the second was
built without noticing it was the missing half of the first.

**Decision 47:** proposals carry `Diff:` — the change itself, not a description.
A described change is approved on its plausibility and implemented as something
else.

**Decision 48:** `Eval:` records the target skill's evaluation before and after.
Checklist item 4 guards the obvious cheat: identical scores on cases unrelated to
the change prove the change was harmless, not that it helped.

### The bias toward removal is the whole point

The skill is told to look first for what can come out — a checklist item that has
never produced a finding, a required line nothing reads, a gate that caught
nothing across several iterations. Adding feels safe and removing feels risky, so
the drift is one-way unless something pushes back. *Nothing has outlived its use
yet* is acceptable once; twice means nobody is looking.

Set against that, one instruction pulls the other way on purpose: **removing a
gate that works is more expensive than keeping one that does not.** The metrics
show which gates catch what; they do not show why. A gate with few findings that
caught one expensive defect is earning its cost.

### What improve may not propose

A change to a check because it produced an unwelcome finding. Checklist item 8
exists because that is the failure mode that quietly converts a set of checks
into a set of preferences, and it would arrive dressed as a reasonable
observation about a false positive.

This build hit that three times — the analogy in session 16, *"the requirements"*
in 15a, the retro's reads in 22 — and each time the right answer was to change
the writing, not the check. But each time it was a judgement call, and a process
that makes it automatically will always resolve it the same way.

### Verification

A proposal citing an observation from one iteration fires; a proposal with no
`Recurrence:` fires; a proposal citing an observation never recorded fires with
a count of zero. Adding a second iteration under the same heading clears both.

### The suite is complete

Sixteen skills, two lint scripts, one metrics reporter, one contract, one graph.
Both lints clean with no phases pending. Largest skill is 109 lines against a
budget of 150.

### Session 23a — naming what "the process" is

Challenge: `improve` says *the working process* without ever saying that the
process is a set of files, which ones, or where they are. A cold agent would
guess. Session 9's assumed-context defect, surfacing in the last skill written.

**Decision 49:** `improve` lists the surface of change explicitly — each step's
`SKILL.md`, each gate's checklist, the contract, the pipeline graph, and both
lint scripts — with a line saying what changing each one changes. Its own skill
and checklist are named as included: a rule that has not worked here is as
proposable as one that has not worked anywhere else.

The contract gained a matching section, because the omission was not only in
`improve`. Everything scaffolded into a product repository describes the product;
nothing said the process is a second set of files living with the skill install.
A skill could read the whole contract and never learn that `pipeline.json`
exists as something changeable rather than as something given.

### Naming the surface exposed a choice that was invisible

Listing the files side by side made obvious what none of the individual sessions
had stated: **the same recurring problem can be answered at several layers, and
they cost different amounts per run.**

- a check in a lint script — milliseconds, no attention, free forever, but only
  for what a script can decide
- an item in a checklist — model attention every time that gate runs
- prose in a skill — context on every invocation, forever

**Decision 50:** `improve` prefers the cheapest layer that can actually catch the
thing, and moving an existing rule *down* a layer is a better proposal than
adding a new one at the same layer. When it proposes a new mechanical check it
proposes the matching checklist change with it, so the gate stops spending
attention on what the script now owns.

That is the whole build's central lesson, arrived at last and by accident. It has
been applied ad hoc since session 3 — the lint owning coverage, `Source:`
presence moving from checklist to script in session 5, `Verified by:` existence
in session 19 — but it was never written down as the rule those instances were
following. A cold agent had no way to derive it.

Checklist item 9 now asks whether each proposal sits a layer higher than it needs
to. That is the first checklist item in the suite aimed at the *cost* of a rule
rather than its correctness.

`improve` is at 132 lines against the 150 budget, the closest any skill has come.
Worth noting that the skill responsible for enforcing budgets is the one nearest
its own.

---

## Session 24 — the review that found the measurements were fiction

An outside critique of the finished suite. Twenty-three sessions built a
pipeline that reasons carefully about evidence and then fed that reasoning four
fields nothing produced. Five defects were mechanical and are fixed here; three
are design questions and are left open at the end.

### The staleness mechanism had no writer

`sdlc_lint.py` computed `upstream_hash` and compared it against
`state.json`. Nothing ever wrote that value. The router prose said "record it in
`state.json`" — and a model cannot compute a sha256 over concatenated files.

Both outcomes are silent. Omit the field and the guard `if record.get("hash")`
short-circuits, so staleness never fires for the life of the project. Invent one
and every approved artifact reads `STALE` forever, against a router instructed
to trust the lint over the state file.

This is session 22's lesson in a new place: **a check that shares an assumption
with the thing it checks cannot fail.** Here the shared assumption was that
someone, somewhere, was writing the hash. Every test written for staleness
supplied the hash by hand, which is exactly the step that does not happen in
production. Fourth instance.

**Decision 51:** the script owns every state transition. Two new commands:

- `sdlc_lint.py next` — resolves the phase order, the per-slice repetition and
  the ceremony level, and returns the phase, skill, resolved input paths,
  output path, gate and gate spec as JSON.
- `sdlc_lint.py gate PHASE --result R --by W` — records the result, computes
  and stores the upstream hash, appends the metrics line, and returns the next
  step.

The router no longer reads `state.json` and is told never to write it. This is
not a rule the model has to remember; it is the removal of a job it was never
able to do.

### The number the whole build was for was invented

Session 22 recorded the moment the pipeline produced its first real judgement:
design took 37% of the iteration's tokens and caught nothing. That figure came
from `tokens` in `metrics.jsonl`, written by the router from introspection it
does not have.

The chain that rests on it is the reason the suite exists — `metrics_report.py`
renders it in a fixed-width table, `retro` cites it as `Evidence:`, `improve`
proposes removing a gate on the strength of it. Session 44 required an
`Evidence:` line on every observation and then supplied the evidence register
with a field no instrument reads.

**Decision 52:** `tokens` leaves the metrics line. What replaces it is what can
be measured at the gate: `duration_s` as wall clock between `next` and `gate`,
`rework_count` from the script's own count of returns, `defects_found` parsed
from the blockers and gaps the gate wrote into the artifact, `output_bytes` from
the file. A real token count from a cost readout or an orchestrator log can be
passed as `--tokens` and is recorded as `tokens_source: human-reported`, so a
later reader can tell the measured fields from the supplied one.

The uncomfortable part is that session 22's finding may still be true. It is now
unproven rather than proven, which is the correct state for it to be in.

### The improvement loop could not run

`improve` appeared only under `product` in the size table. Iteration 1 is
product-sized and has no prior reflections, so the two-occurrence rule blocks
every proposal. Iterations 2 and after are `feature` or `patch`, which have no
`improve` phase at all. The self-improving loop — the thing twenty-three
sessions were building toward — was structurally unreachable.

**Decision 53:** `improve` is not in any size's phase list. It is an
`on_demand_phase`, and `next` reports `improve_available` at the end of an
iteration by counting reflection headings that appear under two or more
iteration headings. Empty list, nothing qualifies. Non-empty, the router offers
it, whatever size the work was.

The old placement encoded an assumption nobody stated: that process problems are
found by large pieces of work. A patch that goes wrong twice the same way is
better evidence than a product build that goes well.

### Three gate types had no definition

`pipeline.json` named `gate: "tests"`, `"self"` and `"smoke"`. The router said
only that the gate is `critique` unless the phase names another, and then
nothing — no contract section, no skill — said what running a `tests` gate
means or what command it invokes. Session 9's assumed-context defect, this time
in the graph rather than in a skill.

**Decision 54:** `pipeline.json` gains a `gates` block giving each type a
runner, a blocking flag and where its verdict comes from, and a `commands` block
holding the test and lint commands. `commands` starts empty and is filled at the
architecture phase alongside the walking skeleton, because that is the first
point at which a command to run the tests exists. A slice reaching `built` with
`commands.test` unset is a lint finding: a gate that does not run.

The block also made a missing status visible. `planned → specified → built →
deployed → verified` cannot express "reviewed, not yet deployed", so the state
machine could not sit between two of its own phases. `reviewed` added.

**Decision 55:** the script refuses a `pass` on a blocking gate without
`--by human` and a `--quote` of what the person said. The contract already asked
for the quote; nothing checked. It is a weak defence against rubber-stamping —
someone determined to wave a gate through can type anything — but it makes
waving it through an act rather than an omission.

### A skill that was named and not shipped

The router handed the baton to `handoff`, which lives in a personal skills
folder and is not in this suite or in the graph. Removed. The replacement says
to stop mid-iteration instead, and observes that there is nothing to carry
across: everything needed to resume is on disk, which is what the whole
artifacts-as-interface rule was for.

### The restatement check was catching the harmless half

The lint flagged sentences repeated *verbatim* from upstream, and the build log
recorded that the gates would catch "the reworded kind".

That is decision 50 backwards. A verbatim copy is inert — it goes stale visibly
and someone notices two files disagree. A paraphrase means something slightly
different and is never noticed. The cheap reliable layer was catching the
harmless case, the expensive unreliable one was assigned the harmful case, and a
model that knows the grep exists reads "do not restate" as "reword first".

**Decision 56:** the check compares content words rather than strings. It was
calibrated against labelled pairs rather than chosen:

```
                        5-gram   content-word
verbatim                  1.00       1.00
reworded                  0.25       0.67
same subject, different   0.00       0.05
unrelated                 0.00       0.00
```

n-grams cannot separate a paraphrase from unrelated prose; both sit near zero.
Content-word Jaccard at 0.6 catches the rewording with clear air beneath it.

Its limit is written into the docstring rather than left to be discovered: a
restatement sharing almost no vocabulary — *within sixty seconds* retold as
*inside of a minute* — scores 0.29 and passes. That band stays with the gate,
which is what model attention is for. The division is now "the script takes
lexical restatement, the gate takes semantic", instead of "the script takes
string equality, the gate takes everything real".

### The traceability rested on nothing, and said so nowhere

`discovery` depends on no phase and the layout had no place for raw material.
So `Source:` either pointed at something the pipeline did not know existed, or
read `assumed`. Every downstream artifact then treated those requirements as
settled, and the lint reported a fully traced chain.

For a solo build that is most of the requirements, and the clean lint output
starts to read like validation of the content rather than of its shape.

**Decision 57:** `inputs/` enters the layout — notes, transcripts, exports,
nothing generated. A `Source:` naming a path there is checked to exist. A
`Source: assumed` is counted, not flagged, and the count appears in the lint
summary next to the requirement total:

```
requirements: 3 (1 untraced, 2 assumed)
```

Not a finding. A finding that always fires is noise, and assuming is legitimate
— what is not legitimate is losing track of how much of the product rests on it
by the time the retro reads the numbers.

### Verification

A fixture product was driven end to end. Staleness now fires: approve
`journeys`, edit `discovery.md`, and the lint reports STALE against a hash the
script wrote. A blocking gate refuses `--by model`; `--by human` without
`--quote` refuses; with a quote it passes and returns the next step. The slice
loop advances S-001 through all five phases and then moves to S-002.
`recurrence_ready` returns nothing after one iteration and the repeated heading
after two. A reworded upstream sentence fires; the same slot filled with
different content about the same subject does not. Both lints clean on the
suite; the product lint reports the fixture's deliberate gaps, including the
unset test command.

### Left open

Three items from the critique are judgements, not defects, and were not decided
unilaterally:

1. **The red state is unverifiable.** `Verified by:` checks that a test *name*
   appears in the code. Nothing records that the test was seen to fail first, so
   `implement`'s TDD discipline is honour-system while looking enforced.
2. **Proposal evidence is partitioned by repository.** `improve` counts
   recurrence within one product's `reflections.md`, but proposes changes to
   files shared across every product. A problem occurring once in three projects
   never reaches two; a quirk of one project reaches two and becomes global.
3. **The contract is 331 lines and every skill reads all of it.** Skills are
   budgeted at 150; the file they all load is not, making it the most expensive
   file in the suite per run. The suite already invented the fix — progressive
   disclosure — and did not apply it to its own spine.

---

## Session 25 — the spine, and the section that broke its own rule

The contract had grown to 372 lines, loaded in full by all sixteen skills on
every invocation. Skills are budgeted at 150; the file every skill opens was not
budgeted at all, which made it the most expensive file in the suite per run and
the only one nothing was watching.

### Measuring it first found something better than a split

Section sizes, before touching anything:

```
Identifiers                        131 lines
Layout                              45
state.json                          41
Gates + Ceremony levels             48
Metrics                             34
everything else                     73
```

Then, for each line token the contract defines, where else it is defined:

```
Exits:                  journey, design, two checklists
Aliases:                domain-model, one checklist
Alternatives rejected:  architect, one checklist
Rollback:               deploy
Try it:                 deploy
Delivers:               slice, slice-spec, deploy, code-review, three checklists
```

Every one of them. **Identifiers — 35% of the contract — was a second copy of
content already written in the skill that owns it.** Session 24 caught the same
class in a product artifact and the suite has policed it in products since
session 3. It was in the spine the whole time.

Decision 51 had already made a second section largely dead: `next` returns
resolved input and output paths, so a phase skill no longer needs the layout to
find anything.

**Decision 58:** the contract becomes a spine plus four references pulled on
demand. What a phase skill genuinely needs is small — how artifacts talk to each
other, the ID prefixes, the token registry, the decisions register — and the rest
belongs to four consumers, not sixteen.

```
                before   after
phase skill        372     124
critique           372     174
retro / improve    372     224
router             372     317
```

Eleven of the sixteen skills are phase skills, and they invoke most often.

### Most of Identifiers was deleted rather than moved

Moving it to a reference would have kept 131 lines alive somewhere. What survives
in the spine is a 24-line table: token, the phase that carries it, and one line
on what it says. Format, examples and reasoning stay in the owning skill, which
is where they already were, and `BLOCK_RULES` in the lint stays the enforcement.

The table is not documentation. It is the registry the suite lint checks against
— a skill requiring a token not listed has invented one — which is the one job
the owning skills cannot do, because none of them can see the others.

### The split's failure mode, and the check for it

Splitting a file everyone reads into files some read is session 9's
assumed-context defect waiting to happen: a skill uses something it no longer
loads, nothing breaks, and the gap only shows up as a worse artifact months
later.

**Decision 59:** the suite lint now holds each skill to the spine plus the
references it actually names. A path or a line token from a reference the skill
does not open is a finding that says so specifically, rather than the old
"the contract does not declare" — the distinction matters, because one means
invention and the other means the split cut something.

It also flags a reference no skill names, so a file cannot go unread.

### Both guards found real work on the first run

Thirteen skills were flagged for naming `.sdlc/CONTRACT.md`, which the spine had
stopped declaring — it described itself in a heading and never in a path. Fixed
in the spine.

`design` and `system-spec` were flagged for naming their own output files, which
had been legitimate since session 15 and was only legal before because the
layout section listed every file in the product. **Decision 60:** a skill may
name paths under its own declared output, and nothing else. The one layout a
skill owns is its own.

The negative test was wrong the first time and passed for the wrong reason:
`Rollback:` and `state.json` both appear in the spine, so a skill using them is
correctly clean. Re-run with `.sdlc/metrics.jsonl`, which only a reference
declares, and it fires. Fifth instance of a test agreeing with the thing it
tested — this time caught by the test passing when it was written to fail.

### One check had gone quiet

The product lint's layout-drift check — session 15's, the one added because the
drift had already bitten once — reads `.sdlc/CONTRACT.md` and looks for each
phase output. With the layout moved it reported three phases as undeclared. It
now reads the spine and the reference directory together.

Worth noting what happened: the check that exists because something drifted was
itself broken by a restructure, and it announced this by producing three
findings rather than by producing none. A check that fails loudly when its
assumptions move is the good version of this.

### Verification

Both lints clean on the suite. A skill given a path from a reference it does not
read fires; the same skill using spine vocabulary does not. An unread reference
file fires. The fixture product re-linted against the split contract returns to
the same eleven findings it had before the split — the deliberate gaps, and
nothing new.

---

## Session 26 — the red state, and three checks that passed for the wrong reason

Open item 1 from session 24. `Verified by:` checked that a test *name* appeared
in the code. Nothing recorded that the test had ever been seen to fail, so the
TDD discipline in `implement` was honour-system while looking enforced — the
worst of both, because the lint was clean.

### One piece of evidence covers both failure modes

Two things were unchecked: a test written after the implementation and shaped to
it, and a test with the right name that asserts nothing.

They collapse into one check. **A test that asserts nothing passes from the
moment it is written, so it can never be observed failing.** Requiring one
recorded failure before the code exists catches both with the same evidence, and
neither needs the lint to understand what the test does.

**Decision 61:** `sdlc_lint.py red T-### --test NAME --slice S-###` runs the
test itself, refuses to record anything if it passes, and appends to
`.sdlc/red.jsonl`. The model does not report the failure; the script observes
it. Same reasoning as decisions 51 and 52 — this is the third register moved off
model testimony and onto measurement.

The lint then requires a red record for every `Verified by:` name in a slice at
`built` or beyond. `manual —` lines are exempt, as before.

### The record holds a digest, because the classic failure is editing the test

An agent that hits a failing test and edits the test rather than the code is the
best-documented pathology in agentic coding. The red record stores a digest of
the test's source, and the lint reports a mismatch as *the failure that was
observed was a different test*.

The digest is scoped to the test's own body, not its file — found by name, taken
to the next definition at the same indent or shallower. Keying on indentation
rather than syntax covers indentation and brace languages alike. Verified that
adding an unrelated test to the same file leaves an existing record intact,
which a whole-file digest would have voided and which would have made the check
fire constantly enough to be ignored.

Chasing the loophole closes it: record red, edit the test to match the code, and
the digest fires; re-record on the edited test and it now passes, so `red`
refuses. The two checks cover each other's exit.

### A test name that does not exist recorded as red

Probing the new command rather than trusting it: `pytest -k` for a name matching
nothing exits **5**. Non-zero. Indistinguishable from a failure.

So `red` cheerfully recorded a failure for `test_does_not_exist_at_all`, which
is the exact defect this session existed to fix, reintroduced by the fix. And
the fallback made it worse — I had written "if the source cannot be located,
record without a digest", on the speculative grounds that extraction might fail
in some language. The case where the source cannot be located is precisely the
case where the test may not exist.

**Decision 62:** no location, no record. The speculative fallback is deleted
rather than hardened. If extraction genuinely fails for some language later,
that arrives as a real example to fix against, which is worth more than a guess
defended in advance.

Sixth instance of a check agreeing with the thing it checked — and the first one
found by attacking a new check on the day it was written rather than months
later. The habit is starting to pay.

### Two gaps found on the way

`Verified by:` was checked only for slices at `built`, `deployed` or `verified`.
Session 24 added `reviewed` to the status chain and did not update this tuple, so
a slice sitting in review skipped the check entirely. The literal is now a
constant used in both places.

Session 24 also said `commands` is filled at the architecture phase and never
told `architect` to fill it. **Decision 63:** `sdlc_lint.py commands` sets them,
`architect` runs it once the stack is settled, and the command rejects a
`test_one` template with no `{test}` placeholder. `commands` now holds `test`,
`test_one` and `lint`.

That kind of gap — a rule written in one file about a step described in another —
is what the reference split makes easier to create, and is worth watching for.

### Verification

Against a real pytest suite in the fixture, not a mock. A failing test records,
with a digest. A test that asserts nothing is refused: it passes, so there is no
failure to observe. A slice at `built` naming that test is flagged as never
recorded failing. Relaxing an assertion after the record fires the digest check.
Adding an unrelated test to the same file does not. Implementing the code turns
the real test green with the record intact and the lint quiet. A name in no test
file is refused. Both suite lints clean.

### Still open

**Proposal evidence is partitioned by repository.** Unchanged from session 24,
and deliberately: designing for a second product before running on one is what
`improve` is written to refuse.

---

## Session 27 — the install path, which had never been run

Asked whether the suite was ready to install. The lints were well tested; the
install path had never been executed once. Everything verified through sessions
24–26 ran against a fixture whose `.sdlc/` I had assembled by hand, which meant
the scaffold — the first thing that happens on a real repo, and a prerequisite
for every phase after it — was the least tested code in the suite.

Four defects, all found by running it in an empty directory.

### The layout described a file it was no longer part of

`reference/layout.md` still read `CONTRACT.md      this file`, true when the
layout lived inside the contract and false since session 25. It also never
declared `.sdlc/reference/` at all — the directory the router was told to
create, holding the file making the claim.

Session 25 warned that a rule in one file about a step in another is what the
split makes easy to create. Two days of build log later, both existed.

### The router was told never to write state.json, and had to twice

Decision 51 removed `state.json` from the model's hands. But scaffolding creates
it, and setting the iteration's size modifies it, and there was no command for
either — so the one file the router must not touch was one it had to write twice
before any phase could run.

**Decision 64:** `sdlc_lint.py init --product NAME` lays down the whole tree from
the assets beside the script, and `sdlc_lint.py size patch|feature|product` sets
the ceremony level against the sizes the graph actually declares. `init` refuses
to run over an existing `.sdlc/`.

This also removes a scaffold described in prose, which is a scaffold done
slightly differently every time — and every phase after it depends on the shape
being exact.

### A smaller size handed phases paths to files that will never exist

The clean-room run at `feature` size reached `slices`, which depends on
`journeys`, `prd` and `system-spec`. A feature-sized iteration runs none of them.
`next` handed over all four paths regardless, because `inputs_for` read
`depends_on` and nothing else.

A phase given a path to a missing file is a phase invited to imagine its
contents. That is the failure the whole traceability spine exists to prevent, and
the router was set up to cause it on every iteration below product size — which,
after the first one, is all of them.

**Decision 65:** `next` returns only inputs that exist, and lists the rest as
`inputs_not_produced`. The router passes that on; a phase told what is missing
can record a `D-###` about what it assumed instead.

The first version of this reported `build` as missing on every review, because
`build` produces code and has no document output. Dependencies with a null
output are not documents to be read and are now skipped entirely — caught by
watching the fixture rather than by the test I had just written passing.

### Where this leaves it

Ready to install and run, not ready to trust. Everything mechanical has been
exercised end to end from an empty directory: init, size, gate, red, commands,
staleness, the slice loop, both lints. **No skill in the suite has ever been
invoked by a model.** Sixteen skills' worth of prose is, at this point, entirely
unexercised — the phase order is proven, what the phases produce is not.

The first real run is the experiment. It should be sized `patch` or `feature`, on
something small and real, with the expectation that the interesting failures will
be in what the skills write rather than in whether the pipeline advances.

---

## Session 28 — packaged as a plugin, and the pipeline could not build anything

Packaging for Claude Code's plugin format, which needs a `.claude-plugin/plugin.json`
manifest and a `skills/` directory at the plugin root — the layout the suite
already had. The manifest and a README were the whole of the packaging work.

The install rehearsal was not.

### The slice backlog never reached the state machine

Running a feature-sized iteration end to end in an empty directory: discovery
written and gated, `docs/slices.md` written with two slices declared and gated,
and `next` returned **retro**.

Every phase that builds anything was skipped. `state["slices"]` was `[]` and
nothing in the suite had ever written to it. The slice loop reads state; the
`slices` phase writes a document; no step connected them. An iteration would run
discovery, write a backlog, and report itself complete having produced no code.

This is the worst defect found in the build, and it was reachable from the first
five minutes of any real run. It survived twenty-seven sessions because every
fixture I had built started with slices already in state — I wrote them by hand
in session 24 to test the loop, and never asked where they came from.

**Decision 66:** the `slices` phase carries `adopts: "slices"` in the graph, and
passing its gate parses the approved backlog into state, preserving the status of
any slice already there. The document stays the artifact; state gets the list.

Seventh instance of a check agreeing with its own assumption — and the most
expensive, because the assumption was in the fixture rather than in the code.

### Patch-sized work had nothing to build either

`size patch` returned `iteration-complete` immediately. Sizes below `feature`
have no phase that writes a backlog, so nothing declares the slice, and the slice
loop iterated an empty list and fell through.

**Decision 67:** `next` returns `action: "slice"` when a size starts in the slice
block with none declared, and `sdlc_lint.py slice S-### --title "..."` declares
one. Two actions are now not phases — `size` and `slice` — and the router
documents both.

Session 27 ended by recommending the first run be sized `patch` or `feature`.
Both were broken. The recommendation is what made me test them.

### Packaging notes

Skills in a plugin are namespaced, so the entry point is `/ai-sdlc:sdlc`. The
scaffold command now uses `${CLAUDE_PLUGIN_ROOT}`, which Claude Code substitutes
inline in skill content, with a fallback instruction: `init` resolves the files
it copies relative to the script, so any path that reaches the script works.

`disable-model-invocation: true` is used in the plugin docs' own quickstart, so
the frontmatter that failed the standalone skill packager's validator is fine
here.

### Verification

From an empty directory, as a plugin: `init`, `size feature`, discovery gated,
backlog gated, and `next` returns `slice-spec` for `S-001` with both slices in
state and their traces attached. At `patch` size, `next` asks for a slice, and
declaring one advances to `slice-spec`. Suite lint clean.

---

## Session 29 — a gate name that misled its own author

### `self` renamed to `verdict`

Writing a diagram brief for the article, I described the `review` phase's gate as
"the phase's own verdict" in a table headed *Gate | Run by*. Read back, that says
the builder approves its own work — the exact thing the second design objection
was about, and the reader who saw the diagram caught it immediately.

The design was never wrong. `review` is a separate phase run by a different skill
than `build`, in a context holding the diff and nothing else, with two subagents
on separate axes. The gate is trivial because the phase's output *is* a verdict,
and gating a verdict with another verdict is regress.

But the name carried an implication the design does not have, and it misled the
person who wrote it. A model reading `self` in the graph could as easily conclude
that self-approval is a sanctioned pattern here rather than a description of one
phase whose output happens to be a judgement.

**Decision 68:** the gate is `verdict`. `gates.md` states plainly that it is not
self-approval and that no phase gates its own artifact.

Worth recording as a general observation: the suite has a vocabulary blacklist
for skill descriptions, on the grounds that a term is read before the file that
defines it. `self` was in the graph, defined in a reference — and still misled
someone who had the definition in front of them. Names that describe the
mechanism can imply a policy, and the implication travels further than the
definition does.

### A user guide

Documentation to this point was a README (install, sizes, commands) and 2,000
lines of build log. Neither answers what a person is supposed to *do* while the
pipeline runs.

`USER-GUIDE.md` covers sizing, the four things that are actually the human's job,
how to answer a hold, what to do when an artifact goes stale or a phase fails
twice, resuming in a fresh session, and reading the lint summary.

Two sections earn their place beyond reference material. **Answering a hold
well** names the temptation to reply "use your judgement" and explains what that
costs — the pipeline will record it as an assumption, and assumptions compound,
which is the failure the whole design exists to prevent. **What this does not
do** states the limit directly: every check in here is about internal
consistency, and none of it can tell you whether you are building the right
thing. The `assumed` count is the closest the suite comes to admitting that.

### Verification

Rename verified through the graph: at `patch` size with a slice at `built`,
`next` returns the review phase with `gate: verdict` and the corrected note. No
`self` remains in any skill, reference, or the graph. Suite lint clean.

---

## Session 30 — the smallest size could not build

Asked what running a patch looks like. Rehearsed one against a small existing
codebase rather than describing it from the graph, and it stopped.

`patch` runs `slice-spec → build → review → deploy → verify`. The build gate is
`tests` and `implement` records each test failing before its code exists — both
need `commands.test` and `commands.test_one`. Those are recorded during
architecture, which `patch` and `feature` do not run.

So on any repository that has not previously been through a product-sized
iteration, `init` writes a graph with `commands` empty and the first patch dies
at the build step. The error read *"set it at architecture"* — naming a phase
that size does not have, which would have sent a reader looking for a step that
was never going to appear.

The lint did flag the unset command, but only once a slice reached `built`. That
is after the point where `red` needs it, so the check fired after the failure it
existed to prevent.

**Decision 69:** `next` returns `action: "commands"` before the build phase when
either command is missing, listing which. Third of these — `size`, `slice`,
`commands` — and the pattern is now explicit: when the pipeline needs something
only a person can supply, it asks in the same channel it uses to say what runs
next, rather than proceeding and failing at the point of use. The error message
no longer names a phase and gives the command instead.

Verified: patch-sized, on a repository with existing code and no pipeline
history — `size` → `slice` → `commands` → `slice-spec` → build, and `red`
records a real failing pytest run.

### Starting a patch, in the guide

A patch has no discovery phase and no PRD, so everything the work rests on comes
from what the person says when they start it. `USER-GUIDE.md` gains a section
with the four things worth stating — the observable problem, what fixed looks
like, where it lives, what must not change — and a worked example.

The failure it names is the one-line request. "Fix the session revocation bug"
leaves the pipeline to invent both the problem and the definition of done, and
then verify the code against its own invention. Every gate downstream passes,
because they are all checking consistency with an artifact nobody validated.
That is the compounding-fabrication objection from the very first design
critique, arriving through the smallest door in the pipeline.

## Session 31 — the first patch run all the way through, and what it found

Ran a real patch: a scratch repository with a genuine bug (`slugify()` left a
stray leading or trailing hyphen on titles that started or ended with
punctuation), a passing test suite that didn't catch it, and the four things
from the guide stated the way a person actually would. Drove it through
`/ai-sdlc:sdlc`, `size patch`, `slice`, `commands`, then `slice-spec → build →
review → deploy → verify` — each phase run in a fresh subagent where the skill
requires one, gates recorded through the script, nothing skipped. It reached
`iteration-complete`. This is the first time any of it has run past `red` on
real code, not just to it.

The fix landed clean. Five things around it didn't.

**Decision 70:** `inputs_for()` never substituted `{slice}` into a dependency's
declared output before checking whether it existed. `build` depends on
`slice-spec`, whose output is `docs/slices/{slice}/spec.md` — the literal
string, curly braces and all, checked against a path that can never exist.
Every slice-phase depending on another slice-phase (`build` on `slice-spec`,
`deploy` on `review`) read as `inputs_not_produced` forever, even seconds
after the upstream artifact was written and gated `pass`. `describe()` already
substituted `{slice}` for the phase's own output; `inputs_for()` just never
got the slice id to do the same for what it depends on. Two of three subagents
in this run noticed the router was wrong and went and read the file anyway —
which is the failure mode, not the save. A less careful one either invents the
spec's content or writes a `D-###` explaining a "missing" input that was sitting
on disk the whole time. Threaded `slice_id` through `inputs_for()`; same
substitution `describe()` already had.

**Decision 71:** "no requirements traced" fired on every slice regardless of
size. At `patch`, there is no discovery phase and so no `R-###` in the
product, ever — the finding could not be satisfied by revising anything, only
by a `D-###` explaining why it doesn't apply, and even then the raw lint kept
reporting it, because nothing checked whether a deferral was on record. A
patch can now never produce a clean `sdlc_lint.py` run, which is exactly the
signal the guide tells a person to trust. The check now only runs when this
size's phase list includes `discovery` — feature and product, where an
untraced slice really does mean something got missed.

**Decision 72:** the `verify` gate is typed `human`, and `gates.md` says every
`human` gate runs critique first. `verify`'s skill is `null` — nothing drafts
its artifact ahead of the person, so at the moment the gate would run, there
is no `.sdlc/verification/{slice}.md` to critique and no `verify.md` checklist
under `critique/references/` to critique it against. Critique's own escape
hatch ("no checklist exists, say so and stop") fires correctly, every time,
which means this gate — the last phase of every iteration, at every size —
could never get past the "run critique first" step as literally written.
`gates.md` now says so directly: a `human` gate on a `skill: null` phase skips
critique, because there's nothing authored yet for it to check.

**Decision 73:** `deploy`'s checklist — running environment, target variables,
migrations, a URL to try the change at — assumes a hosted service. This
repository has none of those; it's a git repo with a `src/` and a `tests/`.
The phase still worked through the whole checklist and recorded four separate
`D-###`s explaining, one item at a time, why each assumption didn't apply. Not
wrong, but a fixed tax paid in full on every patch to anything shaped like a
library, CLI, or script rather than a service — which is a large share of
what `patch` exists for. `deploy`'s skill now says up front to check for a
real target before working the checklist, and to take the lighter path —
trunk is the deployment, `Verified by:` calls the code the way a consumer
would, `Try it:` is that command — when there isn't one.

**Decision 74:** the guide has told a person starting a patch to state four
things since Session 30, but nothing ever wrote them down — `slice` only ever
took `--title`. Say them in conversation and they exist only as long as the
context does; a session that runs long and resumes fresh, which the guide
itself tells people to do rather than push through, would find nothing but a
one-line title on disk. `slice` now takes `--brief`, which writes the human's
own words to `inputs/{slice}-request.md` — the same role `inputs/` already
plays for discovery at the larger sizes, extended down to the size that has no
discovery phase to do it for.

Left alone, on purpose: two subagents disagreed on who calls
`sdlc_lint.py gate <phase>` after a slice-phase skill finishes — `implement`
left it to the router, `deploy` recorded its own. Both were objective
exit-code checks, so nothing was actually rubber-stamped this run, but neither
skill's instructions say who owns the call, and a `--by script` or `--by model`
result recorded by the same context that just wrote the thing being gated is
the shape of the failure this whole design exists to prevent for reviews.
Worth tightening, not urgent enough to guess at the fix without seeing it go
wrong on a mechanical gate specifically, rather than a judgment one, first.

Verified: patch-sized, real bug, real fix, real failing-then-passing tests,
all five gates recorded, `iteration-complete` reached. `inputs_for()` re-run
directly against the finished repository's artifacts after the fix — `build`
and `deploy` both now resolve their upstream slice-phase dependency instead of
reporting it missing. `sdlc_lint.py` re-run against the same repository
through the patched module — the untraceable-requirements finding is gone.
`suite_lint.py` clean after all five edits. `slice --brief` smoke-tested in an
isolated scratch directory — writes `inputs/{slice}-request.md` when given,
and a slice declared without it still works and writes nothing.

## Session 32 — a feature run, a review that never let go, and a router bug that had already been "fixed" once

Same scratch repository, moved to `feature` size, two slices: single-title
slugs on the command line (S-002), then batch input from a file or stdin
(S-003). Both driven the same way as the patch run — fresh subagents for
every gated phase, gates recorded through the script, nothing hand-edited in
`state.json` except two transparent one-time repairs explicitly logged as
recovering what the corrected script would have produced. S-003 alone went
through five real code-review rounds before a clean pass; S-002's slice went
end to end in one. Two real bugs in the plugin itself, and a retro that found
more than either of them.

**Decision 75:** `add_slice()` and `adopt_slices()` never recorded which
ceremony size a slice was created under — only the iteration's *current*
size existed anywhere, so a lint check meant to catch a slice built with no
requirements traced (patch has no discovery phase, so nothing to trace) would
misfire on a slice that was built at `patch` and is only being looked at now
that the product has grown into `feature`. The check was comparing the wrong
size to the wrong slice. Added `size_at_creation` to both slice-creation paths,
read from `state.get("size")` at the moment a slice is created rather than
whenever it happens to be checked.

**Decision 76:** a `review` gate recorded `fail` and `next` kept offering
`review` again — never `build`, the phase whose skill can actually act on a
code-review finding. `record_gate()`'s slice branch only ever moved a slice's
status *forward* on `pass`; a `fail` or `hold` left it exactly where it was,
which for `review` is already past `build`'s own done-state, so the router's
"first phase whose done-state exceeds the slice's status" logic just landed
back on `review` every time. Traced it to `review` being the one gate typed
`verdict` — the phase's own output *is* the judgment, so nothing gates it
again, and nothing was rolling its slice back for the same reason. Wrote a
fix: on a `verdict`-gate `fail`, walk `SLICE_ORDER` back far enough to land on
the phase whose skill produced what failed. Got the arithmetic wrong the
first time — one hop back lands on the failing phase's own predecessor's
already-current status, a no-op — and didn't catch it, because the only
verification available at the time was a hand-corrected `state.json` on the
one slice in front of me, reasoned out separately from the code rather than
by re-reading what the code actually did. The bug rode along, unnoticed,
through the rest of that slice. It resurfaced on this session's own next
slice the moment code-review failed again: `next` offered `review`, not
`build`, exactly as before. Fixed for real this time — two hops back, not
one — and checked two ways before touching a real slice's state again: a
standalone synthetic harness constructing a minimal pipeline and calling
`record_gate()` directly, and a table-driven read of `pipeline.json`'s own
`gates` dict confirming `verdict` is the only gate typed `output-verdict`, so
the fix cannot silently reach `build`, `deploy`, or the others. It then held
across five real fail/hold/pass cycles on the same slice, not the one case
it was first written against.

The lesson underneath both of these isn't really about slice statuses. It's
that "I hand-verified this one case" and "I re-read the code and traced the
logic" are not the same evidence, and the first one passed for the second one
here for an entire slice's worth of work before the same bug got a chance to
prove it hadn't been fixed.

Left alone, on purpose, for `improve` to pick up with two occurrences behind
it rather than one: this session's own retro (`.sdlc/reflections.md` in the
test repository) found that `count_findings()` — the function behind the
`defects_found` metric — only recognizes the `critique` skill's own
`## Critique findings` wrapper heading, and never matches `code-review`'s
independently-specified format (severity headings, no wrapper), so every
code-review verdict this entire session is invisible to that metric,
structurally, regardless of how carefully it's written. The same retro also
caught ten tests edited after being red-recorded — line-width rewraps, a
strengthened assertion, a consolidated duplicate — with nothing re-proving
them red against their new source, and nothing in `implement`'s own routine
or the `build` gate's test-command check looking at the red ledger before
recording a pass. Both are real, both recurred multiple times in this one
session already, and neither has a proposed fix yet with enough evidence
behind it to write one rather than guess — which is exactly what retro is
for and exactly why it doesn't fix things itself.

Both got fixed anyway, on request, right after retro — with evidence already
in hand from the same session that found them, "wait for a second occurrence"
was about not guessing, not about waiting out of principle once the guessing
was already done.

**Decision 77:** the red-ledger check existed already, but only ran inside
the general lint pass, gated on a slice already being `built` or later — a
sensible guard for that check's original purpose (don't complain a task's
test doesn't exist before the code should exist), wrong for a new one. A
rebuild after a review failure sits at `specified` — rolled back by Decision
76's own fix — right up until the build gate's own call finishes recording
it, which is exactly when ten tests in this session got edited (a line-width
rewrap, a strengthened assertion, a consolidated duplicate) without being
re-proven red, and exactly the window in which reusing the general lint
pass, tried first, missed all ten in a synthetic reproduction before the fix
went in for real. Extracted the check into `stale_verified_by()`, called
unconditionally from `record_gate()`'s `build` branch — no `state.json`
status to be wrong about, because the caller already knows the code is
built.

**Decision 78:** `count_findings()` split every artifact on a literal
`## Critique findings` heading and returned zero when it wasn't there —
correct for the `critique` skill's own wrapper format, silently wrong for
`code-review`'s, which its own SKILL.md specifies with no wrapper at all
(severity headings directly). Every code-review verdict this entire session
was invisible to the metric, structurally, not by accident of how carefully
any one round was written. Now falls back to scanning the whole document
when no wrapper exists. A second, narrower gap rode along with the first:
nothing checks that a `## Critique findings` section, once written, actually
uses headings the metric can see — this session's own slice-spec section for
S-003 talked about blockers and gaps in flat prose bullets instead, and
contributed zero of its roughly eight real findings to the count. Added
`critique_format_issue()` to say so in the lint output instead of leaving it
silent; running it turned up two more pre-existing instances (S-001, and the
slice backlog itself) neither noticed before now.

Verified: feature-sized, two slices, both reaching `verified`; S-002's own
review round caught a genuine bug (an all-punctuation title read as an option
by argparse) independently of the person who built it, and five further
fresh-context review rounds on S-003 found four more genuine, distinct
issues — not near-misses or style preferences, things that would have shipped
wrong. `suite_lint.py` clean after every plugin edit this session.
`sdlc_lint.py next`, re-run at retro, is what actually surfaced the red-ledger
and metrics findings above — not something noticed mid-work, which is itself
worth sitting with. Decision 77 verified against a synthetic slice built
specifically to reproduce the missed window — status `specified`, a test
edited after red-recording it — confirmed blocked, then confirmed passing
once reverted to the red-recorded source, before either check ran against
this session's own real repository again. Decision 78 verified against the
actual historical content of three real documents (S-002's and S-003's
review.md, S-002's and S-003's spec.md), not synthetic text: the code-review
format now counts correctly, the narrative-bullet format is now flagged
rather than silently zeroed, and a correctly-formatted document still
produces no false flag.

## Session 33 — a product-sized run, and a heading regex that couldn't tell a declaration from a citation

First product-sized run, on a new product (a team status board) rather than
another change to the CLI the first two sizes were tested against — the
point being to exercise discovery through architecture and slicing, not just
the slice-phase loop patch and feature sizes had already covered twice.
Discovery's own gate (`human`, blocking) got its first real fresh-context
critique round on a same-session-authored artifact, and it did not
rubber-stamp: two blockers (a delivery mechanism, "a webpage", written into
a requirement instead of the need behind it; a budget/hosting constraint
written as if it were a testable product requirement) and a gap (an open
question that didn't cross-reference a requirement it was actually bounded
by). Revised in response, and a second fresh critique round confirmed the
revision actually addressed what was raised rather than just reworded it —
one prior finding turned out only half-fixed on the first pass (the
mechanism was gone, but the requirement was still filed as a numbered,
user-facing R-### rather than acknowledged as a project constraint), which
the second round caught and this session accepted as a nit rather than
sending back a third time, since nothing downstream would act on it wrong.

**Decision 79:** that second critique round, still blind to how the
artifact had been written, independently found a lint bug rather than just
a discovery-artifact one: `declared_ids()`, `referenced_ids()`, and `blocks()`
all scanned a document's raw text for markdown headings, with no way to tell
a structural heading (`### R-006 — ...`) from a critique finding's heading
that merely *names* an ID while explaining what's wrong with it (`### blocker
— R-006 bakes a delivery mechanism into a requirement`). Both match `HEADING`,
both hand `ID.findall` a real-looking ID, so a critiqued document quietly
declared its own requirements a second time — each fresh "declaration" a
bare heading with no `Source:` line under it, since a finding's evidence
paragraph isn't formatted as one. Surfaced first as a duplicate "R-006 has
no Source line" and a spurious "Q-004 is not traced by any downstream
artifact" (only the second because a *different* finding's heading happened
to name Q-004 too) — plausible enough on their own that a human moving fast
could easily have taken them for real gaps and gone looking for a Source
line that was never missing. The same pattern reaches further than
discovery: `blocks()` backs the `T-### has no Verified by line` check
against slice specs, and any critique-finding heading that happens to name
a T-### would fail that check the identical way, for the identical reason —
this had not yet happened to appear in either scratch repository, but
nothing in the code made it discovery-specific. Fixed at the root: a new
`_own_content()` strips everything from the first `## Critique findings`
heading onward before any of the three functions look for headings or
`Traces:` lines, so a critique section can name any ID it needs to in
plain prose without becoming a second declaration of it.

Verified against both scratch repositories' real, current state — not
synthetic text, since both already had exactly the kind of critique-heading
content this bug needed to reproduce. Before the fix, team-status-board's
`sdlc_lint.py` reported two duplicate "no Source line" findings and one
spurious "not traced" finding, all three traceable to critique-heading
text; after, those three are gone and the run reports exactly the 8
inherent "not traced" findings a discovery artifact with no downstream
phase yet is expected to carry, plus the one real, already-known
narrative-format finding. slugify-cli's finding count held at 18 before and
after — same ten stale-red findings, same two restatement findings, same
three critique-format findings, confirming the fix changed nothing for a
repository that happened not to have any ID-naming critique heading, rather
than only appearing to work because it broke something else quietly.
`suite_lint.py --root skills` clean after the edit.


## Session 34 — the orchestrator this whole test had never actually run, a rework-count rule the script doesn't implement, and a phase that finally caught a fact wrong in the real world

Continuation of the product-sized run (team-status-board): journeys, domain,
prd, design, and architecture all ran, gated, and passed this session — the
first time this test has pushed a product size past discovery. Each phase
went through genuine fresh-context critique (a new subagent each round, no
memory of how the artifact was drafted, dispatched with the actual
`ai-sdlc:critique` skill loaded inside it) rather than a single pass —
journeys took 3 rounds, domain 3, prd 4, design 4, architecture 3. Real
defects were found and fixed at nearly every phase, not just formatting
nits — see the individual round verdicts recorded in each artifact's own
`## Critique findings` sections for the full list. Two things surfaced this
session are about the pipeline itself, not the product being built with it,
and matter more than any single defect.

**A gap in how this whole test has been run.** While about to record
journeys' gate, a close read of `record_gate()`'s own source showed it sets
`art["status"]` and increments `art["rework"]` on *every* call — fail, hold,
or pass — not just the final passing one. This session (and, on reflection,
every prior one) had only ever called `sdlc_lint.py gate ... --result pass`
once a phase finally passed, never recording the intermediate `fail`/`hold`
verdicts a real multi-round critique cycle produces. Raised to the human
rather than silently corrected either direction; the answer was to fix the
protocol going forward and log the gap for retro, not to hand-edit
`metrics.jsonl`'s already-recorded history to make it look like the
intermediate calls had always happened. Every phase from domain-model
onward in this session recorded every round's verdict, not just the last.

**Why the gap existed: the real orchestrator has never once run in this
test.** Trying to follow the documented "Gate handling" protocol properly —
rather than approximating it from having read the skill's prose — meant
invoking `ai-sdlc:sdlc` itself. That call errored: `disable-model-invocation:
true` in the skill's own frontmatter means no model can invoke it via the
Skill tool at all — only a human typing `/ai-sdlc:sdlc` can. This test
suite's entire multi-session history, across all three ceremony sizes, has
been a human-authored *approximation* of the orchestrator's documented
behavior (reading each phase skill and the critique skill directly, calling
`sdlc_lint.py` by hand, applying the Gate-handling section's rules from
memory) — never the orchestrator itself, because there has never been a way
for this kind of session to run it. That the missing-intermediate-gate gap
above went unnoticed for over thirty sessions is a direct, structural
consequence of this: nothing was ever executing the actual documented
protocol closely enough to expose that this test's approximation of it had
drifted. Whether `disable-model-invocation` on the top-level orchestrator is
itself the right call — it exists, presumably, so a person stays in the
loop at the seams the orchestrator manages, but it also means no automated
or model-driven test of this plugin can ever exercise the real router, only
hand-rolled stand-ins for it — is exactly the kind of question this whole
exercise exists to surface for the retro, not to resolve mid-run.

**Decision 80 (found, deferred — not fixed):** the orchestrator's own
documentation states "Two failures on the same artifact means the fault is
upstream... Holds do not count; a well-made artifact holds on its first
gate as a matter of course." `record_gate()` does not implement this
distinction — `rework` increments identically for `fail` and `hold` in both
the slice and non-slice branches, so the persisted `rework_count` cannot
tell "two real fails" from "one fail and one hold" apart, contradicting the
documented rule outright. Found at domain-model's gate (fail, hold, pass —
`rework_count` reached 2 with only one real fail in it) and confirmed again
at PRD's (fail, hold, hold, pass — `rework_count` reached 3, and this
session had already blown past the documented "stop at 2" threshold once
without noticing, then caught itself before doing it a second time).
Raised to the human both times; the choice both times was to log it for
retro rather than patch the script mid-run, since fixing gate-counting
logic while the same run depends on its current behavior risks confusing
this test's own results about what the *unpatched* plugin actually does.

**A smaller, metrics-only oddity, logged alongside Decision 80 rather than
filed separately:** `record_gate()` pops `phase_started_at` on every call
(it's what `duration_s` is computed from), and nothing re-establishes it
while `state["blocked_on"]` is set. The gate call immediately following an
unblocking fix — domain's hold→pass, PRD's round-3 hold, architecture's
final pass — reliably shows `duration_s: null` instead of a real duration.
Cosmetic (it doesn't affect gate/rework logic), but it means
`metrics_report.py`'s duration figures are systematically missing exactly
the gate call that resolved a hold, which is plausibly the more interesting
one to have timing for, not the less.

**One finding worth naming as a positive result, not a defect.** HANDOFF's
own watch-list asked whether critique in a fresh context actually finds
things or rubber-stamps. Architecture's round 1 is the clearest evidence
yet that it does more than check internal consistency: the critique
subagent independently web-searched the hosting platform an ADR had named
and found its central rationale — a "free tier" — had stopped existing in
2024, something no amount of re-reading the document itself could have
caught, since the document was self-consistent and simply wrong about a
fact outside it. The same round also caught a claim about a `PORT`
environment variable by literally reading the live running process's
command line rather than trusting the prose, and a later round verified a
dependency fix by installing into a throwaway virtualenv rather than
reading the requirements file and assuming the pin was accurate. This is
the critique protocol behaving exactly as designed under real adversarial
pressure with tool access, not the rubber-stamping HANDOFF was watching
for.

No script or skill files were edited this session — both findings above are
logged for the eventual retro rather than fixed mid-run, per the same
reasoning applied throughout this test: patching the pipeline's own
behavior while still using it to evaluate that behavior would contaminate
the evaluation. `suite_lint.py --root skills` was not re-run since nothing
in `skills/` changed.

## Session 35 — slices cleared on the first round, slice-spec's first real hold, and a metrics gap the operator caused rather than the script

Continuation of the product-sized run (team-status-board): system-spec
gated (carried over from last session's final commit), then slices ran and
passed fresh-context critique clean on round 1 — 0 blockers, 0 gaps, 0
nits, the first phase this entire product-sized run has cleared without a
single revision round. Slice-spec for S-001 (the first slice) followed:
round 1 came back `hold` with 4 real gaps (an unenforced payload-size cap
with no byte number ever chosen, two claimed-built screen states —
`posting`, `loading` — with zero verification anywhere, two tasks whose
`Verified by:` named a testing method instead of a checkable test
identifier, and a silent split of system-spec's own migration across two
slices without flagging the mismatch against operations.md's "run once"
wording). All four were fixed — a real byte number reasoned through and
recorded as D-010, the two states given Proven-by lines and rolled into an
expanded Playwright task, concrete test paths given to both tasks — and
round 2 passed clean (0/0, one cosmetic nit). Two things are worth
recording beyond the individual defects.

**`questions.md` got used for the first time in this test's entire history,
and it worked as designed.** CONTRACT.md has said since session 1 that a
phase finding an upstream artifact "wrong, incomplete, or self-
contradictory" should "raise a `Q-###` in `questions.md` naming it, and
continue with the most defensible reading" rather than editing the
already-gated artifact. Every `Q-###` in every product this test has built
— discovery's Q-001 through Q-004, prd's Q-005, all of them — was instead
written into the producing phase's *own* "Open questions" section, which
is a different, legitimate mechanism (a phase naming what it leaves open
by design) that happens to share the same ID prefix. `.sdlc/questions.md`
itself sat at zero bytes across 34 prior sessions. This session's gap 4
above was the first case where a *later* phase found a real inconsistency
in an *earlier, already-gated* artifact (operations.md's Deployment step
describes the `updated_at`-column-plus-index migration as one block run
"once"; slicing means only the index ships with S-001, and `updated_at`
isn't due until S-002) — exactly the situation the mechanism exists for.
Q-006 went into `questions.md` for real, and round-2 critique confirmed it
did the job: it reasons through why the split is safe, without re-editing
or re-deciding the gated operations.md document itself. One data point, but
the first evidence in this test that the plugin has *two* separate,
correctly-scoped places for open questions, not one mechanism with a
redundant, unused twin.

**The round-1 `hold` for slice-spec S-001 was never recorded via
`sdlc_lint.py gate`, and metrics.jsonl now under-reports it.** For every
earlier blocking (`human`-typed) gate this session and last, the practice
had been: record each intermediate round's result (`fail`/`hold`, `--by
model`) as it happened, and only the final round gets `--by human --quote`.
Slice-spec's gate is `model`-typed and non-blocking, so nothing forced
that same discipline, and it didn't happen — round 1's `hold` was fixed
and re-critiqued without ever calling `sdlc_lint.py gate slice-spec
--result hold --by model` first. The final `gate ... --result pass --by
model` call recorded `defects_found: 0`, `rework_count: 0` — accurate for
that one call, but silently wrong as a description of the phase, which
genuinely found and fixed 4 defects across 2 rounds. Checked the script
(`sdlc_lint.py`, `gate` subcommand): nothing requires or reminds an
operator to record an intermediate round for a non-blocking gate — the
only hard rule it enforces is `blocking and result == "pass" and by !=
"human"`. `gates.md`'s own prose ("hold stops for a human... resolved by
revising the artifact or by the human dismissing it") is satisfied either
way — revising the artifact is one of its two named resolution paths, and
that's genuinely what happened — but the metrics history for retro is
poorer for it than the blocking-gate phases', purely because non-blocking
gates carry no structural nudge to log a round before fixing it. Distinct
from Decision 80 (rework_count can't tell fail from hold when both *are*
recorded): this is a round never getting recorded at all. Logged for
retro, not fixed mid-run, same reasoning as every other pipeline
observation this test has deferred.

`suite_lint.py --root skills` was not re-run since nothing in `skills/`
changed.

## Session 36 — team status board, S-001: code review, and `sdlc_lint.py
next`'s full-corpus findings array

Ran `code-review` for S-001 as the skill instructs: two subagents, each
given only the diff since the slice started plus its own axis reference
(`spec-and-scope.md` or `standards-and-naming.md`), neither seeing the
other's output. Both actually ran the tests themselves rather than trusting
the record (12 passed at that point) and both produced real,
`path:line`-cited findings — not a rubber stamp. Verdict: hold, 0
blockers, 3 gaps, 3 nits. Fixed the 3 gaps (a body-size boundary that was
asserted only 2x oversized, never at D-010's actual 10,240-byte edge; a
`load-failed` path that wiped previously-loaded content before the failure
was known, contradicting screens.md's own stated intent for that state; an
undocumented `id`-tie-break in the Latest view's query, now D-011) and one
of the three nits (D-009's own boundary, previously reject-side only). The
other two nits — `post`-prefixed identifier density, and trivial
duplication between `list_updates`/`list_latest_updates` — each carried
the reviewing subagent's own "no fix needed" assessment, so they were left
alone rather than fixed for the sake of a clean sheet. 17 tests pass, up
from 12. This is the first genuine test of the two-axis, fresh-context
review mechanism in this whole test history, and it worked as designed:
real findings, real severities, a verdict that followed from them rather
than being chosen.

**The `defects_found` metrics gap from Session 35 did not recur — this
gate recorded correctly.** Session 35 flagged that slice-spec's round-1
`hold` never got an explicit `sdlc_lint.py gate ... --result hold` call, so
`metrics.jsonl` showed `defects_found: 0` for a phase that found 4 defects.
This session, recording the review gate as `pass` after remediation
produced `defects_found: 3` automatically — `count_findings()` counts the
`### blocker/gap/nit —` headings still present in review.md's body (the
review document doesn't get revised down to a clean sheet the way a
critique-appended document does; the findings stay written, the verdict at
the bottom changes). So the review gate's `defects_found` is self-correcting
by construction in a way slice-spec's `hold`-then-silently-fix pattern is
not — worth noting for whoever eventually reconciles Session 35's
observation, since the fix that phase needs (record intermediate rounds
explicitly) doesn't generalize to every gate the same way.

**Discovered that `sdlc_lint.py next` always runs the full-repository lint
and attaches every finding to its JSON response, not just findings that
touch the phase about to run — and that this test has apparently been
getting that array back, unread, at every `next` call since session 1.**
Running `next` right after gating S-001's review returned 65 findings
spanning nearly every artifact this whole product has produced —
discovery, domain, prd, design, architecture, system-spec, slices, and
S-001 itself. Two were genuinely actionable and specific to current work;
the rest were old and, on inspection, none of them warranted reopening an
already-gated document. Specifically:

- **A real lint false-positive, logged as Q-007**: `stale_verified_by()`
  substring-matches a `Verified by:` line's *entire* token against the
  source corpus. S-001's T-006/T-007 name their tests in pytest node-id
  form (`tests/ui/test_s001_playwright.py::test_name`) — adopted during
  slice-spec's own round-1 critique specifically because that round
  flagged the original lines as naming a method, not a checkable test —
  and no file contains that combined `path::name` string verbatim, so the
  check reports "does not appear anywhere in the code" for two tests that
  demonstrably exist, were properly red-recorded, and pass. Did not edit
  spec.md (gated, and already consumed by both `build` and `review`) to
  dodge this; raised Q-007 in `questions.md` instead, per CONTRACT.md, and
  left the fix (strip a leading `<path>::` before the containment check,
  or match on the component after the last `::`) as a plugin change for
  Nick to consider — not made without approval.
- **`prd: uses 'status', a name the domain model rejected`** (and the same
  hit against design, architecture, system-spec, slices, S-001) is the
  identical false positive slice-spec's own round-1 critique already found
  and dismissed on the record in S-001's spec.md: `{"status": "ok"}` is
  `/healthz`'s literal HTTP field name, not a use of the domain concept.
  It recurs in `next`'s output because the corpus-wide check has no memory
  of a prior dismissal — each `next` call re-derives the same true-but-
  irrelevant hit fresh. Not a new finding; nothing to do.
- **A large cluster of "reworded/verbatim restatement of upstream" hits**,
  one or more per phase, all tracing to the same root cause: this test has
  written near-identical critique-round methodology sentences — "round N,
  run fresh against the current text, not against the revision, and with
  no visibility into round N-1's own findings" and close variants — in
  essentially every phase document's own critique log, across all 36
  sessions. CONTRACT.md's restatement rule ("Artifacts add, they do not
  restate... The lint flags sentences that re-tell an upstream one,
  reworded or not") does not carve out an exception for a document
  describing its *own* review process rather than restating another
  artifact's substance, so the checker is behaving exactly as specified —
  it just wasn't written to distinguish process narration from content
  restatement, and this test's own consistent phrasing habit is what
  finally accumulated enough repetition to surface it. All of the flagged
  documents are already gated and consumed by later phases; per the same
  "artifacts are settled" principle Q-006 and Q-007 both leaned on, none
  were reopened to fix this. Going forward in this test, critique-round
  narration will vary its phrasing rather than reuse the same template
  sentence, to stop compounding a cluster `next` already can't act on.
- **`Critique findings section mentions blocker/gap but none are written
  as headings — defects_found will silently read 0 for this round`**
  recurs against discovery, domain, prd, design, architecture, system-spec,
  and slices — meaning Session 35's `defects_found` observation was not a
  slice-spec-specific fluke; it is systemic across every earlier phase in
  this 36-session test whose critique log narrates findings in prose
  without the literal `### blocker/gap/nit — ...` heading `count_findings`
  scans for. Same disposition: logged, not retrofitted into gated
  documents.

The operational takeaway is about `next` itself, not any one finding: its
`findings` array is a standing, full-corpus advisory that rides along on
every single call regardless of what phase is actually running next, it is
easy to miss inside a JSON response whose interesting fields are
`action`/`phase`/`gate_spec`, and on a long-running product-size iteration
it accumulates enough historically-dismissed and structurally-unfixable
(without violating "don't reopen a gated artifact") noise that a real
regression could plausibly hide in it unnoticed. Worth a design
conversation with Nick — possibly scoping `next`'s findings to the
current/downstream phase by default with a separate flag for the
full-corpus sweep, or teaching the restatement/critique-heading checks to
recognize a document's own historical critique log as a different class of
text than its substantive content.

Deployed S-001 next (D-008's precedent again: `git archive HEAD` into a
clean directory, real gunicorn process, real HTTP smoke checks — not a
description of what deploying to PythonAnywhere would do), and wrote a
slice-specific smoke script (`scripts/smoke-s001.sh`) rather than reusing
the architecture-phase one, because the deploy skill is explicit that the
smoke check has to exercise the slice's own `Delivers:` line end to end,
and the walking-skeleton script only proves the raw `POST`/`GET` path, not
one-row-per-Author-most-recent-wins. Found and fixed my own orchestration
bug along the way, not a product defect: restarting gunicorn between two
smoke runs without confirming the old worker had actually died left a
stale process still answering on the port with stale data, which made the
new author-count assertion fail for a reason that had nothing to do with
the app. Killed by PID, confirmed the port free, confirmed `/updates/latest`
empty before posting anything, then both smoke scripts passed clean.

**`verify` — the one phase in `pipeline.json` with `skill: null` — got its
first genuine test in this whole run.** `gates.md` says a `human` gate on
a `skill: null` phase skips the critique step outright: "nothing authors
that phase's artifact in advance for critique to check; the human's own
statement is the content, not something written ahead of them and then
reviewed. There is deliberately no checklist for it under
`critique/references/` — go straight to the person." That's exactly what
happened — `AskUserQuestion` presented Nick the delivered behavior, what
had been tested, and the hosting limitation, and `.sdlc/verification/
S-001.md` was written to hold his verbatim answer ("Pass (Recommended)")
rather than a pre-formed report for him to approve. `sdlc_lint.py gate
verify --by human` accepted it and advanced to S-002's `slice-spec` —
confirming directly, for the first time in 36 sessions, one of HANDOFF's
named seams: `next` does not skip to `retro` without a slice actually
being built and shipped end to end first.

Started S-002 (the All view, editing, Cancel), and deliberately tested
Session 35's own recommendation — "record each intermediate round's
`hold` explicitly" — by doing exactly that, calling `sdlc_lint.py gate
slice-spec --result hold` for round 1's genuine 2-gap finding (Cancel and
`all-empty` both claimed built with no Proven-by/Task verifying either;
both real, both fixed) *after* round 2 had already run clean and been
appended to the same document. It didn't work: `defects_found` still read
0. Read `count_findings()` to find out why rather than guess: it splits
the artifact on the literal `## Critique findings` heading and counts
severity headings only in `part[-1]` — text after the *last* such
heading — specifically so an earlier revision's now-resolved findings
don't count twice. With two rounds appended to one document, that means
round 1's findings stop being counted the moment round 2's heading exists
in the file, regardless of when `gate` is called afterward. Session 35's
recommendation was correct but incomplete: recording the intermediate
`hold` has to happen in the narrow window after round 1's heading is
written and *before* round 2 is appended — a single-call-order constraint
inside one document's own lifecycle, not just an easy-to-forget step
sometime before the final `pass`. Recorded here since Session 35 stopped
one level short of the actual mechanism; a real fix (sum every round's
severities, or count from the first wrapper heading rather than the last,
with an explicit exception for a genuinely superseded false-start) is a
plugin change for Nick, not made here.

Built S-002 (the All view, editing in place, Cancel) — real TDD
throughout, task by task, using the same revert-observe-restore technique
S-001 used for its Playwright tests, now also for backend fault
injection. Two things happened that go beyond routine build work.

**A task whose test proves an absence, not a presence, cannot be
red-recorded the normal way — and `sdlc_lint.py gate build` hard-blocks
on that, not just `next`'s advisory findings.** T-004
(`test_patch_update_succeeds_for_any_caller_not_just_the_original_author`)
exists to prove security.md's already-accepted, on-the-record gap (no
author check on `PATCH`, ADR-001's consequence) stays real. It passed the
instant the route existed — there is no code this task adds that makes it
start passing, because its subject is the deliberate absence of code.
`sdlc_lint.py red` correctly refused to record it ("a test that has never
been seen to fail has not been shown to check anything"). First instinct
(recorded in Q-008, questions.md) was to accept this as a plugin gap,
mark it `Decided by: model`, and move on — implement's own instruction
for a spec that "cannot work as written." That held up right up until
`sdlc_lint.py gate build` was actually called: it refused outright ("red
ledger is stale for this slice") and named T-004's test directly. Session
35's fix-then-decide-not-to-record pattern assumes the gate will accept a
`D-###` in place of a recording; this gate does not negotiate — an
unrecorded test blocks shipping the slice, full stop.

That forced a genuine second look at the "don't game it" reasoning, and
it didn't survive: the red ledger's `digest` is computed from the test's
own source text, not from whatever the implementation happens to be at
the moment `red` runs. Temporarily adding the exact author-check
regression T-004 exists to catch, watching this same test fail against
it, removing the check, and recording red is mechanically identical to
how T-003 and T-005's tests were red-recorded in this same slice (revert
real code, observe a real failure, restore) — not a lesser or dishonest
version of that technique, the same technique, aimed at a hypothetical
regression instead of a real one that happened to exist in the code a
moment ago. Done for real: added the check, confirmed the test failed,
red-recorded it, removed the check, confirmed all 29 tests passed with
zero diff left in `app/main.py`. Q-008 was rewritten in place to carry
the corrected reasoning rather than left standing as the first, wrong
conclusion next to a contradicting resolution — the earlier "Blocks:
nobody directly" characterization was itself wrong, corrected once the
gate proved otherwise. The residual plugin gap is real but smaller than
first framed: not a missing escape valve, since the technique exists and
works, but a documentation gap — implement's SKILL.md doesn't name
"temporarily introduce the regression this test exists to catch" as the
move for a task shaped like T-004, so it had to be rediscovered under
gate pressure instead of reached for on sight.

Separately, `sdlc_lint.py gate build` also caught a genuine miss with no
interesting mechanism behind it: T-003's 404 test was written, passing,
and simply never run through `red` at all — an ordinary oversight in a
slice with nine tasks and two separate red/green passes (backend, then
frontend), not a structural or tooling issue. Fixed the same way as
T-005 earlier in this slice. Worth naming only because it's exactly the
kind of slip `gate build`'s hard check exists to catch, and did.

S-002 shipped end to end from there: code review ran as two fresh-context
subagents (spec-and-scope, standards-and-naming) and came back a genuine
**fail**, not a hold — the standards axis caught the Latest/All tab
switch silently departing from style-guide.md's own Secondary-controls
spec in three separate properties (wrong resting colour, no hover state
at all, a solid-filled "selected" look copied from primary buttons
instead of the spec'd underline). Verified the claim against
style-guide.md's actual source before accepting it — it was fully
accurate — then fixed the CSS to match exactly. Spec-and-scope's four
gaps were all genuine coverage holes against the slice's own Proven-by
claims (Cancel's "no PATCH sent" behaviour, the never-posted-visitor
case, edits showing in both views) and got fixed with real new tests,
not asserted away. Deploy re-ran S-001's and the walking skeleton's own
smoke scripts against the same freshly-migrated process as a regression
check — both still passed. Verify went to Nick a second time, same
`skill: null` human-gate path as S-001, same "Pass" answer — two for two
now, confirming this mechanism isn't a fluke of the first run.

## Retro, and the pipeline's first `iteration-complete`

With both slices verified, `next` handed over to `retro` — confirming,
a second and final time for this test, that HANDOFF's named seam ("does
`next` ever reach `retro` without a slice being built") doesn't happen:
every slice in the backlog reached `verified` before retro was ever
offered, for both S-001 alone and now S-001+S-002 together.

Read the retro skill's required inputs before writing anything:
`metrics_report.py`'s aggregate (506 minutes, 32 rework, 45 defects,
1427 KB across the whole iteration), `decisions.md` (eleven D-###
entries, every one `Decided by: model` — nothing in this iteration was
ever put to Nick as a decision, only ever logged as text he could have
read), `questions.md` (Q-006 resolved by inspection, Q-007 and Q-008
both already fully written up), and both slices' `review.md`. This is
the first retro this product has ever had — `reflections.md` was 0
bytes — so there was nothing to stay name-consistent with; checked
whether the earlier patch-size run (`slugify-cli`) had one too, and it
correctly doesn't, since `pipeline.json`'s patch-size phase list omits
`retro` entirely. Not a gap, just confirmed absent for the right reason.

The most concrete finding came straight out of the metrics themselves:
`metrics_report.py`'s aggregate table shows `slice-spec: defects 0` —
the cleanest-looking row in the whole report — while both slices'
`spec.md` files show a real round-1 **hold** on the record (S-001: 4
gaps; S-002: 2 gaps + 1 nit). This is Session 35's "record intermediate
rounds" finding, but sharper now that it's been walked through
end to end: `count_findings()` splits the artifact on the literal `##
Critique findings` heading and counts severity headings only in the text
*after the last one*. A slice-spec that goes to a second round appends a
second such heading, and from that moment the first round's real
findings — the ones that actually forced the rework — become invisible
to anything that reads the ledger, this metric included. S-001's line in
`metrics.jsonl` doesn't even show `rework_count: 1`, meaning the
intermediate `hold` was apparently never gated at all for that slice,
only the final `pass` — so the undercount compounds with an
under-recording of how often the gate was called mid-round. Recorded as
an observation in `reflections.md` with a two-part candidate fix: sum
findings across every `## Critique findings` section rather than reading
only the last one, and gate every round, not just the one that finally
passes.

Re-running `sdlc_lint.py next` as part of retro's own read-first pass
turned up a second act to Q-007: S-002's slice-spec deliberately avoided
the node-id `Verified by:` form Q-007 flagged, switching its UI tasks to
a `` `test_name` (Playwright, `tests/ui/`) `` annotation instead — and
that annotation trips the *same* `stale_verified_by()` corpus check a
different way. The check splits each `Verified by:` line on every comma;
the comma inside the parenthetical gets treated as a second list item,
stripped down to `` tests/ui/` ) `` and checked against the corpus as a
test name that of course isn't there — five false positives across
S-002's five annotated tasks. Two different, both-reasonable ways of
writing a `Verified by:` line, both defeated the same check in different
ways, in the same iteration. `reflections.md` was corrected in place to
carry both causes once this surfaced (the file had already been
committed once with the earlier, incomplete "this hasn't recurred"
framing — fixed rather than left standing, same practice as this
session's `Q-###` corrections). Candidate fix, for Nick alongside Q-007:
parse `Verified by:` by extracting backtick-quoted names specifically
rather than splitting the whole line on commas — one change that would
fix both the node-id case and the parenthetical-annotation case instead
of patching each new shape of the line as it's found.

`decisions.md`'s eleven-for-eleven `Decided by: model` tally is recorded
as an observation too, deliberately without a candidate change — one
iteration is exactly the sample size the retro skill itself says isn't
enough to propose against, and the one decision that did get raised as a
finding (D-011, the Latest-view tie-break) was caught and resolved at
the very next gate, on the same iteration, which reads as the mechanism
working rather than failing. Also recorded, as a positive finding this
time: `gate build`'s hard red-ledger check caught both of S-002's real
build-phase misses (T-003's plain oversight, T-004's Q-008 structural
case) while `next`'s advisory findings array, run repeatedly across the
same slice, caught neither — direct, repeated evidence in one slice that
the hard gate and the soft findings list are doing genuinely different
jobs, not redundant ones.

Five observations written to `reflections.md`, each with an `Evidence:`
line and a stated cost; no skill, checklist, contract, or pipeline file
touched, per the retro skill's own constraint — `git status` confirmed
only `.sdlc/reflections.md` (plus, after gating, `state.json` and
`metrics.jsonl`, which every phase's gate call touches) changed. Gated
retro itself with `sdlc_lint.py gate retro --result pass --by model` —
its `gate: null` in `pipeline.json` still goes through the same
`record_gate` path as every blocking gate this session, just with no
`--quote` requirement and no restriction on `--by`. `next` came back
`{"action": "iteration-complete", "improve_available": []}` — the first
time in this entire pipeline test, across patch, and now product size,
that a full iteration has run start to finish and the pipeline itself
says so. `improve_available` empty is the expected shape for iteration
1: the `improve` phase (not run this session) requires a proposal citing
two or more iterations' worth of the same named observation, and this is
the only iteration this product has had.

## Summary of open plugin-behavior findings for Nick (no plugin changes made)

Across both slices, this product-size run surfaced, in addition to
everything Sessions 1-35 already covered: Q-007 and its second cause
found during retro (`stale_verified_by()`'s corpus check breaks on two
different reasonable `Verified by:` annotation styles — one fix parsing
backtick-quoted names would likely cover both); the sharper
`count_findings()` last-heading-only mechanism, now confirmed to
specifically hide a slice-spec's own round-1 rework from its own metrics
row; `gate build`'s hard red-ledger enforcement, confirmed catching real
misses `next`'s advisory findings did not; the "temporarily introduce
the regression this test exists to catch" technique for a task like
T-004, missing by name from implement's SKILL.md. All logged here and in
this repository's own `Q-###`/`reflections.md` entries; none applied to
the plugin itself without Nick's review.

## Session 37 — Nick approved two of the three catalogued fixes; the third turned out not to be a bug

Nick asked whether the plugin was ready to install. Answer given: yes,
mechanically — already packaged, and the mechanisms that actually block
bad work (the build gate's red-ledger check, the human verify gate,
fresh-context critique) held up clean across both test runs — but three
findings from the product-sized test were still uncommitted to the plugin
itself. Nick chose to fix those three before installing.

Before touching code: re-read `_critique_section()`'s own docstring
(`sdlc_lint.py`) while locating `count_findings()` to plan the first fix,
and it flatly contradicts what the previous session's retro wrote. The
docstring says the last-heading-only behavior exists specifically *to
avoid* double-counting an earlier round's findings once they've been
resolved — not a bug, a deliberate contract: `gate` is meant to be called
once per critique round, immediately after that round's findings are
written to the artifact, so each call's `count_findings()` reads only
that round's own new findings. Checked `.sdlc/reference/gates.md` —
confirms the same contract ("hold stops for a human... resolved by
revising the artifact"). Then found that Session 35 had already worked
this out correctly, before Session 36 (and this session's own earlier
continuation of it) lost the thread: Session 35's own title is "a metrics
gap the operator caused rather than the script," and its body names the
real gap precisely — nothing in `sdlc_lint.py` requires or reminds an
operator to call `gate` for a non-blocking phase's intermediate `hold`
before moving on to fix and re-critique, so the round's findings never
get recorded at all, silently. S-001's round 1 was fixed and re-critiqued
without that call ever happening; S-002's was made, but only after round
2's heading had already been appended — the same missed window, one step
later. Neither is a parsing defect. Summing findings across every heading
— last session's proposed fix — would have made the *correct*,
by-the-contract case start double-counting a resolved round's findings,
which is exactly the failure mode the design exists to prevent. Not
fixed. Corrected `reflections.md` in team-status-board in place (same
practice as every other in-place correction this test has made) rather
than let a wrong diagnosis stand as the iteration's permanent record, and
left the real, narrower question — whether a script-level nudge is worth
adding for non-blocking gates — for Nick, unfixed.

The other two findings held up under the same scrutiny and were fixed for
real:

**`stale_verified_by()`'s corpus check.** Two distinct causes, not one.
Planned fix from the retro was "extract backtick-quoted names instead of
splitting the whole line on commas" — checked it against every real
`Verified by:` line in both test repos before writing it, and it would
have been wrong: slugify-cli's specs never use backticks at all
(`Verified by: test_cli_single_title_prints_slug`, bare), so backtick-only
extraction would have silently stopped checking every line in that
style rather than fixing anything. Actual fix, two parts in the same
function: (1) strip a parenthetical annotation from the line before
splitting on commas, so `(Playwright, \`tests/ui/\`)`'s internal comma
stops reading as a second test name — fixes the S-002 case; (2) a name
containing `::` is matched against the corpus, and looked up in the red
ledger, by only its component after the last `::` — matching the bare
name `sdlc_lint.py red --test <name>` actually records under — fixes
Q-007's node-id case. Verified two ways: a fixture repo with a real
never-red-recorded test, a made-up name, and a node-id (only the two
genuine defects still fire, in the message using the operator's own
original text rather than the internal lookup key); and re-running `next`
against team-status-board itself, where all seven prior false positives
(2 node-id, 5 parenthetical) are gone and nothing else in that repo's 77
remaining findings changed.

**implement's SKILL.md.** Added a "When the task proves an absence"
section naming the T-004/Q-008 technique directly — temporarily add the
check the test exists to show is absent, confirm the test now fails,
record red, remove what was added — as the move for a task whose
`Verified by:` test asserts an absence rather than a presence, alongside
the plain revert-observe-restore pattern the skill already assumed. Low
risk: prose only, no mechanism change.

`suite_lint.py --root skills` run after the SKILL.md edit: clean.
`reflections.md`'s other two corrected findings now note the fixes are
live rather than still pending. Nothing else in the plugin touched.

## Session 38 — documenting how a self-improvement proposal actually gets applied

Nick asked how self-improvement works once this is a real install, not a live
source folder we're editing directly. Answered from the `improve` SKILL.md
first ("You propose. You do not apply... approved by the person whose work it
is") — but that only covers where a proposal lands, not what applying one
actually takes once installed for real, so it was worth verifying rather than
answering from the skill's prose alone.

Tested with the real `claude` CLI, in an isolated `HOME` so it wouldn't touch
this session's own plugin config: `claude plugin marketplace add` +
`claude plugin install` genuinely works end to end against the marketplace
package built last session, and lands the plugin at
`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` — a real copy, not
a symlink to the marketplace source. Then edited the marketplace source's
content with no version bump and ran `claude plugin update ai-sdlc`: it
reported "already at the latest version" and left the cached copy untouched,
even though the source had genuinely changed. Bumped `plugin.json`'s
`version` field and ran it again: a new versioned cache directory appeared
with the edit in it. So `update` compares only the version string, never
content — a real gotcha for anyone who edits a marketplace source expecting
`update` to notice.

This means the apply half of the propose→apply loop isn't uniform across how
the plugin is run: `--plugin-dir` picks up an edit on the next launch, no
extra step; a marketplace install needs the diff applied to the source, a
version bump, `update`, and a restart — and editing the installed cache copy
directly is a trap, since it works until the next `update` silently reverts
it to whatever the source still says.

Added a "## Applying an approved proposal" section to `USER-GUIDE.md`,
between "Between iterations" (which already covered when a proposal gets
generated) and "What this does not do," documenting exactly that: the two
paths, and the version-bump gotcha named explicitly. Prose only, no mechanism
change. `suite_lint.py --root skills` clean; `claude plugin validate` on the
full plugin directory still passes.

Also said plainly, separate from the doc change: `improve` itself has never
fired anywhere in this entire test. It needs the same reflections.md heading
recorded across two iterations of one product, and team-status-board only
ever completed one; slugify-cli's patch size never runs `retro` at all. Every
other seam in HANDOFF's list has real evidence behind it now — this one still
doesn't, and the doc addition above is verified for mechanics, not for
whether a real proposal this skill writes will actually be good.
