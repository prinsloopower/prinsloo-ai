---
name: rfp-response
description: RFP response drafted from an answer library of prior responses and company documents, with every unsourced question flagged. Use when the user has an RFP, RFI, tender, security questionnaire, vendor assessment or due diligence questionnaire to complete.
---
# RFP response

Answers come from the **answer library**: earlier responses, product documentation, policies and certifications the user supplies or connects. A question the library cannot answer becomes a **gap** for a named expert, with no answer guessed in its place.

## Gather
- The RFP or questionnaire, in its original format.
- The answer library. Ask for it if none is supplied: without one, every question is a gap.
- Deadline, submission format, word or page limits, mandatory attachments.
- `business-context.md`, if one is in the working folder, project or attachments: it sets voice, brand, products, customers and competitors.

## Steps
1. Parse the document into a numbered question list that keeps the buyer's own IDs and sections. State the count.
2. Build the compliance checklist: deadline, format, limits, mandatory items, signatures, attachments.
3. For each question, search the library and answer from what it says, adapted to the question as asked. Record the source document and its date.
4. Give each answer a status.
   - **Sourced**: taken from the library, current.
   - **Adapted**: the source is close and the wording was stretched. Needs review.
   - **Stale**: the source is more than 12 months old. Needs confirming.
   - **Gap**: no source. Write the question for the expert who would know.
5. Answer yes-or-no compliance and security questions with "yes" only where a source says yes.
6. Run a consistency pass: the same fact gets the same answer everywhere, including figures such as headcount, uptime and customer counts.
7. Fit each answer to its limit, leading with the direct answer.
8. Deliver the responses in the buyer's format, a gap list grouped by expert, and a draft cover letter or executive summary.

## Done when
- The number of questions with a status equals the number in the RFP.
- Every `Sourced` answer cites its document.
- Every `Gap`, `Adapted` and `Stale` item is on the review list with an owner where known.
- The compliance checklist shows what is still outstanding.
