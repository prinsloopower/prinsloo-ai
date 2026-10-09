---
name: variance-commentary
description: Variance commentary that explains actual results against budget, forecast or prior period by their biggest drivers. Use when the user wants budget-versus-actual analysis, month-end or quarter-end financial commentary, a variance bridge, or an explanation of why the numbers moved.
---
# Variance commentary

Build a **bridge** from budget to actual: a short list of drivers that adds up exactly to the total variance. The commentary explains each step of the bridge.

## Gather
- Actuals and the comparison (budget, forecast or prior period) by line, as a file or from a connected finance tool.
- Reasons known to the user or in supplied notes: timing, one-off items, price changes, headcount.
- Materiality threshold. Default: the lines that together explain 80% of the total variance.
- Full-year budget and forecast, for the outlook.

## Steps
1. Load the data in code. Compute the variance in amount and percent for every line.
2. Mark each variance favorable or unfavorable by line type: revenue above budget is favorable, cost above budget is unfavorable.
3. Select the material lines by the threshold.
4. Break each material variance into drivers where the data allows: price, volume and mix for revenue, rate and quantity for cost, currency where it applies.
5. Classify each driver as **timing** (reverses in a later period) or **permanent**, and as **one-off** or **run-rate**.
6. Take causes from the user's notes and the data. Where the cause is unknown, write the question for the budget owner in place of a cause.
7. Write one sentence per material line: "<Line> was <amount> (<percent>) <above or below> budget, driven by <driver>. <Timing or permanent>. <Effect on full year or action>."
8. Build the bridge table and confirm in code that it adds up to the total variance.
9. Summarize the full-year effect: permanent variances carried forward, timing variances reversed.

## Shape
```
Headline: <total variance and its main driver, in two lines>
Bridge | driver | amount | F or U | timing or permanent |
Commentary by line
Full-year outlook
Questions for budget owners
```

## Done when
- The bridge adds up to the total variance exactly.
- Every material line has commentary or a question.
- Favorable and unfavorable signs are consistent throughout.
- Every figure in the text matches the table.
