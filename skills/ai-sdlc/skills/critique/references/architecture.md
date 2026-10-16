# Checklist — architecture

`Traces:` on components, `Alternatives rejected:` on ADRs, and the presence of a
`Verified by:` command are checked by the lint script. You check what it cannot.

1. **Choices inherited without a decision.** Search the PRD and
   the designs for every technology, protocol, storage engine or library
   named. For each, is there an ADR here adopting or overturning it? An inherited
   choice with no ADR is a `blocker` — the earlier phases were told not to decide
   these, so a choice that arrived from them was never made by anyone.

2. **Rejected alternatives that were never candidates.** For each ADR, is the
   rejected option something a competent engineer would actually have proposed,
   and is the reason given specific to this product? *"Rejected: not suitable"*
   records nothing. A strawman alternative is a `gap` — it makes the decision
   look examined while leaving the real trade-off unrecorded.

3. **Components nothing asked for.** For each component, read its `Traces:` and
   check the cited requirement or journey actually needs it. Same laundering
   failure as upstream, and a `blocker` here because the build will construct it.

4. **Size against the requirements.** Name every place where the architecture
   assumes scale, team size, or rate of change that nothing in the PRD
   supports — a queue between components that always run together, a service
   split one team deploys as a unit, a cache before anything is slow. A `gap`,
   and one that is paid every day in operational cost.

5. **The skeleton's honesty.** Read `skeleton.md`. Does the deployed path
   actually cross every boundary it claims — a real deploy, real storage, real
   configuration — or is some part stubbed? A skeleton that stops short of a
   boundary has not tested the thing most likely to be wrong, and saying it has
   is a `blocker`.

6. **What the skeleton did not prove.** Is that section written, and does it name
   the integrations still taken on trust? Absent, it is a `gap`: the untested
   assumptions are where the next surprise is, and unnamed they surface during a
   slice rather than as a `Q-###`.

7. **Integrations without a failure answer.** For each external system, is there
   a stated behaviour when it is unavailable or slow? Missing is a `gap` — the
   default implementation waits forever and the first slow response becomes an
   outage.

8. **Consequences that are all upside.** Name every ADR whose consequence section
   records no cost. Every real architectural decision costs something; an ADR
   claiming none has not been thought through, and the cost will be discovered
   by whoever operates it — `gap`.

9. **Naming drift into the code.** Do component and interface names use the terms
   in the domain model? Drift here is a `blocker` rather than a `gap`,
   because these names become module and table names and outlive every document
   in this pipeline.
