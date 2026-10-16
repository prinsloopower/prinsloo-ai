# Checklist — prd

Trace coverage from `discovery.md` is checked by the lint script. Do not re-check it.

1. **Mechanism pre-empting architecture.** Name every implementation choice the
   PRD states as settled — storage engines, token formats, protocols, libraries.
   A PRD that specifies mechanism is a `blocker`: the architecture phase inherits
   the choice as a given and never records why, and security-relevant decisions
   in particular get made in a product document by nobody in particular.

2. **Decisions made by omission.** Name the most expensive decision this PRD
   leaves to the architecture phase. Is it deferred deliberately, with a `Q-###`
   or `D-###`, or is it simply absent? Absent is a `blocker`.

3. **Scope edges.** Name something a reasonable reader would assume is in scope
   that the PRD states neither way. Silence at an obvious edge is a `gap`; the
   slicing phase will guess.

4. **Success metrics.** Each metric has a number and a named source of
   measurement. A metric with no measurement source cannot be checked at the
   human verification gate — `gap`.

5. **Journey coverage.** Name any journey in `journeys.md` that no success metric
   speaks to. That journey's slice will have nothing to verify against — `gap`.

6. **Claims about behaviour.** Every statement about what users will do traces to
   `discovery.md` or is marked as an assumption. Unmarked new claims are a `gap` —
   the PRD is downstream of discovery and is not where user research appears for
   the first time.

7. **Non-goals.** Present, and specific enough to settle an argument. *"Not
   building a mobile app"* settles one; *"not over-engineering"* settles none.

8. **Contradiction with upstream.** Name any point where the PRD says something
   `discovery.md`, `journeys.md`, or `domain-model.md` contradicts. Use the terms
   from `domain-model.md` when checking — a PRD that renames a domain concept is
   a `blocker`, because every later artifact inherits the ambiguity.

9. **Restatement by paraphrase.** The lint catches sentences copied verbatim from
   upstream. You catch the reworded kind: name every passage that explains what a
   requirement, journey, or term already says, rather than deciding something
   about it. Each one is a `gap` — it is a second copy of the truth that no
   process updates when the original changes, and readers will find it and
   believe it.
