---
name: business-case
description: Business case for an investment, covering the problem, options, costs, benefits, payback and risks. Use when the user wants to justify budget, headcount, a tool purchase or a project, build a cost-benefit or ROI analysis, or write a funding proposal.
---
# Business case

A business case is an argument about **payback**: what doing nothing costs, what the investment costs, and when the benefits repay it. Each figure rests on a stated assumption.

## Gather
- The problem and who feels it.
- Costs: one-off, recurring and people's time. Quotes or estimates from the user.
- Benefits and the evidence for them: volumes, rates, hours, prices.
- The approver, and the approval threshold or template if the organization has one.
- `business-context.md`, if one is in the working folder, project or attachments: it sets voice, brand, products, customers and competitors.

Ask once, in one message, for cost and benefit figures that are missing. Carry any that remain as placeholders.

## Steps
1. Quantify the **cost of doing nothing** per year.
2. Describe two or three options, including do nothing and a smaller version of the request.
3. Build the assumptions table: each assumption with its value, source and confidence.
4. Compute in a spreadsheet or code, with formulas visible: total cost over three years, annual benefit, payback period, return on investment. Add net present value when the user gives a discount rate.
5. Keep hard benefits (revenue, cost avoided) apart from soft ones (satisfaction, risk reduced). Only hard benefits enter the payback figure.
6. Run a downside case: benefits at half, costs at one and a half times. State whether the case still holds.
7. List risks with mitigations, and what happens to the money already spent if the project stops.
8. State the ask: amount, timing, and what the approver gets at each stage.

## Shape
```
The ask: <amount> by <date> for <outcome>
Problem and cost of doing nothing
Options
Costs | Benefits (hard, soft)
Payback and return, base and downside
Assumptions | assumption | value | source | confidence |
Risks
```

## Done when
- Every figure in the financials traces to a row in the assumptions table.
- Payback is computed, with the arithmetic reproducible.
- The downside case is shown.
- Soft benefits are listed and excluded from the return.
