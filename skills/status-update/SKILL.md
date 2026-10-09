---
name: status-update
description: RAG status update for a project or team, covering progress against plan, blockers, risks and next steps. Use when the user wants a weekly or monthly status report, a project update for stakeholders, or a red-amber-green summary.
---
# Status update

The color is a claim the milestone dates must support. **RAG** is defined here, and the same definitions apply every week.

| Status | Meaning |
|---|---|
| Green | Date, scope and budget are on plan |
| Amber | At risk, and the team has a recovery plan in hand |
| Red | Will miss without a decision or help from outside the team |

## Gather
- The plan: milestones with planned dates. From a connected project tool, a spreadsheet or the user.
- What happened this period: work completed, issues, changes.
- The previous update, to show movement.

## Steps
1. Update the milestone table: planned date, forecast date, status. A forecast later than plan makes that milestone Amber or Red.
2. Set the overall status from the table and give the reason in one line.
3. For Amber or Red, write the **path to green**: the action, the owner and the date it is expected to recover.
4. `Progress`: what finished this period, measured against what the last update promised.
5. `Next`: what will finish next period.
6. `Blockers and asks`: each names the person who can clear it and the date it is needed.
7. `Risks`: new or changed only.
8. Mark every change from the previous update: slipped, recovered, new.

## Shape
```
<Project>, <period>. Overall: <R/A/G>, <one-line reason>
Path to green (Amber or Red only)
Progress this period
Next period
Blockers and asks | blocker | who can clear it | needed by |
Milestones        | milestone | planned | forecast | status |
Risks (new or changed)
```

## Done when
- The overall color agrees with the milestone table.
- Every Amber or Red has a path to green with an owner and a date.
- Every blocker names a person.
- The update is under 250 words, tables aside.
