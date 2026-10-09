---
name: expense-prep
description: Expense preparation that turns receipts and statements into a categorized, totaled table ready for an expense system. Use when the user has receipts, invoices or a card statement to reconcile, an expense report to prepare, or travel costs to total after a trip.
---
# Expense prep

Build a **ledger**: one row per receipt, each field read from the document, each row reconciled to the statement. What cannot be read is flagged for the user.

## Gather
- Receipts and invoices: images, PDFs or forwarded emails.
- The card or bank statement for the period, if the user wants reconciliation.
- Expense categories and policy limits, from the organization's policy or `business-context.md`. Default categories: air travel, lodging, ground transport, meals, client entertainment, supplies, software, other.
- The import format of the user's expense system, if they name it.
- Trip or project names, to group by.

## Steps
1. Read each receipt into a row: date, merchant, amount, currency, tax, payment method, category, description, source file. Mark a field `[unreadable]` when the document does not show it clearly.
2. Assign categories. Where two fit, pick one and note the alternative.
3. Convert currencies using the statement amount where there is one, or a rate the user supplies. Keep the original amount beside the converted one.
4. Reconcile with the statement: match by date and amount. List statement lines with no receipt, and receipts with no statement line.
5. Check against policy where one was supplied: over a limit, missing receipt, possible duplicate (same merchant, amount and date), items that look personal.
6. Total by category and by trip in code.
7. Deliver the ledger as a spreadsheet or CSV in the expense system's column order when known. Offer copies of the receipts renamed `YYYY-MM-DD_merchant_amount`.
8. List what needs the user: unreadable fields, unmatched items, policy flags.

## Done when
- Rows plus flagged documents equal the number of receipts received.
- Category totals add up to the grand total.
- Every flag states its reason.
- Submission to the expense system is left to the user.
