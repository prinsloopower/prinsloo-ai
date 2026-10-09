---
name: risk-register
description: Risk register that lists risks, scores likelihood and impact, and assigns an owner and a mitigation to each. Use when the user wants project or business risks identified, a risk assessment or pre-mortem, a risk matrix, or an existing register updated.
---
# Risk register

Start with a **pre-mortem**: assume the project has failed a year from now, and write down why. Then score what surfaced and give each risk to one person.

## Gather
- What is being assessed: the project plan, proposal, contract or operation.
- An existing register, if this is an update.
- The organization's scoring scale, if it has one. Otherwise use the scale below.

| Score | Likelihood | Impact |
|---|---|---|
| 1 | Rare | Negligible |
| 2 | Unlikely | Minor, absorbed within the team |
| 3 | Possible | Moderate, slips a milestone or budget line |
| 4 | Likely | Major, threatens the deadline or the budget |
| 5 | Almost certain | Severe, threatens the goal itself |

## Steps
1. Run the pre-mortem across categories: schedule, budget, people, technical, vendor, legal and compliance, market, operations.
2. Write each risk as "If <cause>, then <event>, leading to <impact>."
3. Score likelihood and impact from 1 to 5. Rating is their product.
4. Choose a response: avoid, reduce, transfer or accept.
5. Write the mitigation as an action with one named owner and a date.
6. Name the **trigger**: the early sign that the risk is starting to happen.
7. Score the residual rating after mitigation.
8. Sort by rating and put the top five first.
9. For an update: re-score existing risks, close those that have passed, add new ones, and list what changed since the last version.

Deliver the register as a spreadsheet when the session can build one.

## Shape
```
| ID | Risk (if, then, leading to) | Category | L | I | Rating | Response | Mitigation | Owner | Due | Trigger | Residual |
```

## Done when
- Every risk is written as cause, event and impact.
- Every risk has scores, a response, a trigger and one named person as owner.
- The top five each have a dated mitigation action.
- Every category was considered, with "none identified" where that is the result.
