---
name: data-readout
description: Data readout that turns a spreadsheet, CSV or export into findings, charts and plain-language takeaways with caveats. Use whenever the user shares tabular data, as a file or as pasted rows, and asks what it says or wants it analyzed, summarized or charted, even when the table is small.
---
# Data readout

Each finding answers **so what**: a headline sentence with a number and a comparison, the chart that shows it, and what to do about it. Every number is computed in code.

## Gather
- The data file or export, attached or from a connected tool.
- The question behind the request, and who will read the answer.
- Definitions: what one row is, what the key columns mean, the period covered.

## Steps
1. Load the data in code and profile it: rows, columns, types, date range, missing values, duplicates, outliers. Report anything odd before analyzing.
2. Confirm what a row represents. If the user gave no question, list three that the data can answer and take the one closest to a decision.
3. Clean only what the profile justified, and log each change with the rows affected.
4. Compute the answers in code and keep the script.
5. Write each finding as a headline with its number and comparison: "Returns rose 12% on last quarter, almost all from one product line."
6. Make one chart per finding, matched to the question: line for a trend, bar for a comparison, stacked bar for a share, scatter for a relationship. Label axes, units and the data source.
7. Write caveats: sample size, missing data, definitions that could mislead, and where a pattern is correlation only.
8. End with recommended actions and the next question worth asking.

## Shape
```
The answer in three lines
Finding 1: <headline with number and comparison> + chart
Finding 2 ...
Caveats
What to do next
Method: source, rows used, cleaning steps
```

## Done when
- Every number in the readout is reproduced by the script.
- Every finding has a comparison.
- The caveats section is present and specific to this data.
- The three most important findings fit on one screen.
