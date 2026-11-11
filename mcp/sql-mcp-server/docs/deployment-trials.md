# Deployment trial log

The PRD measures deployment time from timed runs by an engineer new to the project, working from the docs alone. The hour ends when the Deployment is deployed, connected to the Database and reachable (R-013). Sign-in and granting tables fall outside it, and their times are recorded too.

One entry per trial, newest first. Each entry gives:
- who ran it, and how new to the project they were;
- the date, the commit, the Workers plan, and the Database (host and project, never credentials);
- the clock time at each point: opening the README; the smoke checks passing, which ends R-013's hour; the Sign-in smoke checks passing; and the first question answered in an AI tool;
- every place they stalled or needed something the docs did not give, with what was changed in the docs as a result.

## Trial 1 — 2026-11-05, the product owner
- **Who:** the product owner. Not new to the project, so this trial does not stand for R-013's engineer new to it; the product owner chose to count it (verification of S-005).
- **Code:** commit 2131cf9, from the working copy `mcp/sql-mcp-server`, not a fresh clone of `mcp/sql-mcp`. The Workers plan, Database host and project were not recorded.
- **Times:** under an hour from opening the README to the first question answered in Claude, as the product owner reported it. The intermediate clock times were not recorded.
- **Stalls, and what changed** (commit 515a17d, exported to `mcp/sql-mcp`):
  - whether the Worker name was an existing Worker or a new one. The guide's setup table now says it is a new name setup creates;
  - what to give for the Boundary. The table now says to name the schemas holding the tables, and section 2 no longer has it chosen from a listing setup shows only afterwards;
  - the Database account's SQL showed several times over, because readline redrew it as part of the prompt. Setup now prints it once, before a one-line prompt.
