---
name: thread-digest
description: Digest of an email or chat thread into decisions, open questions and who owes what. Use whenever the user asks to be caught up on a thread, wants a conversation summarized, or was added to one late, even when the thread is short and pasted inline.
---
# Thread digest

A **digest** records the current state of a conversation, not its history: what was decided, what is still open, and who owes what to whom.

## Gather
- The whole thread, including quoted replies and forwarded parts, from the connected mail tool or pasted. Note any attachments that are referred to but not available.
- The user's role in the thread: decision-maker, contributor or observer.

## Steps
1. Read oldest to newest. The latest statement wins: when a position or decision is reversed, record the current one and mark the earlier one superseded.
2. Extract **decisions**, each with who made it and the date.
3. Extract **open questions**, each with who asked and who is expected to answer.
4. Build the **owes** table: owner, action, due date, who is waiting. Include commitments made in passing ("I'll check with finance").
5. Summarize **positions** where people disagree: who wants what, and why, in one line each.
6. State what the thread needs from the user. Offer a reply draft if it needs one.
7. For a batch of threads, produce one digest per thread, ordered by how much each needs the user.

## Shape
```
In five lines: <state of play>

Needs from you: <action, or "nothing">
Decisions       | what | who | date
Open questions  | question | asked by | waiting on
Who owes what   | owner | action | due | waiting
Positions       (only where there is disagreement)
```

## Done when
- Everyone with an outstanding commitment appears in the owes table.
- Each decision names who made it and when.
- The five-line summary is accurate on its own.
- Anything inferred instead of stated in the thread is marked `(inferred)`.
