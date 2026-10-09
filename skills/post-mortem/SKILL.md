---
name: post-mortem
description: Blameless post-mortem with a timeline, contributing causes, and actions with owners. Use when the user wants an incident review, root cause analysis, lessons-learned write-up, project retrospective, or a review of a lost deal or failed launch.
---
# Post-mortem

**Blameless** means the analysis asks what in the system let this happen. People appear by role, and every cause is a condition someone can change.

## Gather
- What happened and its impact, in numbers where they exist.
- The record: chat logs, tickets, emails, alerts, call notes, commit or change history.
- Accounts from the people involved, if the user has them.
- Earlier post-mortems, to spot a repeat.

## Branches
- **Incident**: outage, error, safety or security event.
- **Lost deal or failed launch**: the timeline is the deal or launch, and causes include decision criteria and competitor moves.
- **Project retrospective**: the timeline is the project against its plan.

## Steps
1. Build the **timeline** from the record before analyzing anything. Timestamp and source each entry. Mark the gaps.
2. Write the summary: what happened, the impact, how long it lasted, how it was resolved.
3. Quantify the impact: customers, revenue, hours, deadlines.
4. List what went well and where luck helped.
5. Find the **contributing causes**. For each thing that went wrong, ask why until the answer is a process, tool, incentive or missing check. Expect several causes.
6. Give each cause at least one action, or mark it accepted with the reason. Type each action: prevent, detect or reduce impact.
7. Give each action one owner and a date.
8. Write three lessons that apply beyond this event.
9. Rewrite any sentence that points at a person so it describes the condition: "the release step had no second check" in place of naming who released.

## Shape
```
Summary | Impact
Timeline | time | event | source |
Went well | Got lucky
Contributing causes
Actions | action | type | owner | due |
Lessons
```

## Done when
- Every timeline entry has a source.
- Every contributing cause maps to an action or an explicit acceptance.
- Every action has one owner and a date.
- Individuals appear by role only, and every cause names a condition.
