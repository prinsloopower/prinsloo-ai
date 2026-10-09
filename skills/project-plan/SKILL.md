---
name: project-plan
description: Project plan covering goals, scope, milestones, owners, dependencies and risks. Use when the user is kicking off a project, wants a project charter, work breakdown, timeline or roadmap, or needs a loose set of tasks turned into a plan.
---
# Project plan

Plan around **milestones** written as states of the world ("contract signed", "pilot live with 20 users"), each with one owner and a test anyone could apply. Tasks hang beneath them.

## Gather
- The goal, the deadline, the budget and the sponsor.
- What is known about the work: notes, a brief, tasks already listed.
- People available, and how much of their time.
- Fixed dates and outside dependencies: vendors, approvals, holidays, other projects.

Ask once, in one message, for the goal or deadline if either is missing.

## Steps
1. `Goal and success measures`: what will be true when the project is done, and how it will be measured.
2. `Scope`: what is in, and what is explicitly out.
3. `Milestones`: work backwards from the deadline. Each has a date, one owner, and a done-means line.
4. `Workplan`: the tasks under each milestone, each with an owner, start, end and predecessor.
5. Find the critical path: the chain of dependent tasks that sets the end date. Place schedule buffer there as its own visible line.
6. `Roles`: for each deliverable, one accountable person, plus who does the work, who is consulted and who is informed.
7. `Dependencies and assumptions`: what the plan relies on from outside the team.
8. `Risks`: the top five with mitigation and owner.
9. `Communication`: who hears what, how often.
10. Check the plan: flag people booked beyond their available time, tasks without owners, and dates that contradict their dependencies. With more than 20 tasks, run the date check in code.

Deliver the plan as a document, and the workplan as a spreadsheet or CSV that any project tool can import.

## Done when
- Every milestone has a date, one owner and a done-means line.
- Every task has an owner and a predecessor, or "none".
- Task dates are consistent with their dependencies.
- The out-of-scope list and the open-questions list are both present.
