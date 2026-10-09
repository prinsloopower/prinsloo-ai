---
name: follow-up-sweep
description: Waiting-for sweep that finds sent messages with no reply and promises still outstanding, then drafts the nudges. Use when the user wants to chase unanswered emails, check what they are waiting on, find commitments they have not delivered, or do an end-of-week follow-up review.
---
# Follow-up sweep

Keep two lists: **waiting-for** (the user asked, nobody answered) and **you owe** (the user promised, nothing was sent). The sweep rebuilds both from the mailbox so nothing rests on memory.

## Gather
- Sent and received mail for the window, from the connected mail tool. Default window is 14 days and default silence threshold is 3 working days; say what was used. With no mail tool, work from pasted threads or a list the user dictates.
- Connected chat or task tools, where the same requests may have been answered.

## Steps
1. List every sent message in the window that asks a question or requests an action. Leave out FYIs and thanks.
2. Mark each one `answered`, `waiting` or `no reply needed`. Check other channels before calling something `waiting`.
3. For each `waiting` item record recipient, the ask, days silent and how many nudges have gone before.
4. Draft the nudge as a reply in the same thread. Restate the ask in one line and make it answerable in one line: yes or no, or a choice of two.
   - **First nudge**: light, assumes it was missed.
   - **Second nudge**: adds the date it is needed and what it blocks.
   - **Third**: recommend a call, a different channel or the recipient's manager to the user, and draft that message instead.
5. Build `you owe`: inbound requests the user acknowledged ("I'll get back to you") with no later reply. Draft the reply, or the question that blocks it.
6. Present both lists oldest first.

## Done when
- Every sent request in the window carries one of the three statuses.
- Every `waiting` and `you owe` item has a draft or a recommended alternative.
- The output opens with the two counts.
- All messages are drafts. The user sends them.
