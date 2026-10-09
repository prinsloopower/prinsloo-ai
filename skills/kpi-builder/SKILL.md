---
name: kpi-builder
description: KPI definitions built from a goal, each with a formula, data source, owner, target, cadence and counter-metric. Use whenever the user asks what a team, project, role or initiative should be measuring, or wants KPIs, success metrics, a scorecard or a metrics dictionary.
---
# KPI builder

Start from the goal and work towards the data. Pair every KPI with a **counter-metric**: the thing that would get worse if people chased the KPI alone.

## Gather
- The goals the KPIs serve, and who will act on them.
- Data that exists: systems, reports, exports and their refresh rate.
- KPIs already in use, to keep or retire.
- `business-context.md`, if one is in the working folder, project or attachments: it sets voice, brand, products, customers and competitors.

Ask once, in one message, for the goals if the user has given only a team name.

## Steps
1. Restate each goal as an outcome someone outside the team would notice.
2. Propose one to three KPIs per goal, with at least one **leading** indicator (moves early, the team controls it) and one **lagging** indicator (the result).
3. Define each KPI in full using the fields below.
4. Test each one. Can the owner move it? Would a change in it change a decision? Can it be computed today from the named source? Rework or drop any that fail.
5. Hold the set to seven for one team. Park the rest as diagnostics.
6. Deliver the KPI dictionary as a spreadsheet when the session can build one, plus a one-page summary grouped by goal.

## Fields
| Field | Content |
|---|---|
| Name | Short and unambiguous |
| Definition | One plain sentence |
| Formula | Numerator, denominator, what is included and excluded |
| Unit and direction | %, days, count. Up or down is good |
| Source | System and report |
| Owner | One named person |
| Cadence | How often it is measured and reviewed |
| Baseline | Current value and date |
| Target | Value and date |
| Thresholds | Red, amber, green |
| Type | Leading or lagging |
| Counter-metric | What to watch alongside it |

## Done when
- Every KPI has every field filled, or a visible placeholder such as `[baseline?]`.
- Every goal has a leading and a lagging indicator.
- Every KPI has a counter-metric.
- No team carries more than seven.
