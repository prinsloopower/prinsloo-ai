---
name: one-on-one
description: Running document for recurring one-on-one meetings, carrying topics, feedback, blockers and commitments from session to session. Use when the user wants to prepare for a 1:1 with a manager or a report, capture what was said in one, or start a 1:1 document.
---
# One-on-one

A 1:1 lives in a **running doc**: one document per pair, newest entry on top, where every commitment is carried forward until it is closed.

## Gather
- The existing running doc, if there is one. Otherwise start one.
- Which side the user is on: manager or report.
- Signals since the last session, from connected tools or the user: work shipped, feedback received, blockers, upcoming deadlines.

## Branches
- **Prepare**: write the next entry before the meeting.
- **Capture**: turn notes from a meeting just held into the entry.
- **Start**: create the doc with a first entry and a line on how the pair wants to use the time.

## Steps
1. Read the last entry. Carry every open commitment into `Carried over` with its status: done, in progress or stuck.
2. Put the report's topics first. As manager, propose questions that draw them out. As report, propose the topics worth the manager's time.
3. Add the user's own topics, most important first, each with the outcome wanted.
4. Write feedback as **SBI**: the situation, the behavior observed, its impact. One item each direction is enough.
5. Once a month, add a growth prompt: skills, scope, what the next role needs.
6. In `Capture`, record commitments from both people with an owner and a date.

## Shape
```
## <date>
Carried over   | commitment | owner | status |
Their topics
My topics
Feedback       (SBI, both directions)
Growth         (monthly)
Commitments    | what | owner | due |
```

## Done when
- Every open commitment from the previous entry is carried or closed.
- The report's topics come before the manager's.
- Each feedback item names a specific situation and its impact.
- New commitments each have an owner and a date.
