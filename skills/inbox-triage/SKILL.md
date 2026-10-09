---
name: inbox-triage
description: Triage of an email queue into reply now, reply today, delegate, read later and ignore, with a draft for each reply. Use whenever the user asks what in their inbox or in a list of emails needs them, wants a morning email review, or is catching up on mail after time away, even when only a few messages are pasted.
---
# Inbox triage

**Triage** means every message gets exactly one bucket and one next action. The user ends with a short list of decisions instead of a long list of messages.

## Gather
- The queue: unread and flagged messages from the connected mail tool. Default window is since the end of the last working day; say which window was used. With no mail tool, work from pasted or exported messages.
- Today's calendar, if connected: mail from people the user meets today moves up.
- `business-context.md`, if present in the working folder, project or attachments: key customers, manager and VIP senders.

## Buckets
| Bucket | Rule |
|---|---|
| Reply now | Blocks someone today, has a deadline inside 24 hours, or comes from a manager, customer or VIP and asks for something |
| Reply today | Asks the user a direct question or for a decision, without today's urgency |
| Delegate | Someone else owns the answer |
| Read later | Useful, no action: reports, newsletters the user reads, FYI threads |
| Ignore | Bulk mail, notifications already acted on, threads resolved without the user |

## Steps
1. Pull the queue and state the window and the count.
2. Place every message in one bucket. Collapse a thread to its latest state before judging it.
3. For each `Reply now` and `Reply today`, write a draft of two to five sentences. Where the reply turns on a decision only the user can make, write the question for the user and both versions of the reply.
4. For each `Delegate`, name the person and write the forwarding note.
5. Present one table, most urgent first: sender, subject, bucket, why in one line, action.
6. Leave the mailbox as found. Archiving, labeling, marking read and sending happen only when the user asks after seeing the table.

## Done when
- Bucket counts add up to the queue count.
- Every reply item has a draft or a question for the user.
- Every delegated item names a person.
- The top of the output says, in one line, how many items need the user today.
