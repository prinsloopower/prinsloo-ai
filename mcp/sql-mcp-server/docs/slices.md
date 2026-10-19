# Slices

Ordered by the PRD's sequencing, under D-063. The walking skeleton (step 1) is already deployed on Cloudflare against Supabase (skeleton.md), so S-001 extends that path. Every PostgreSQL slice ships to the project test Deployment, and its tests run against the AI Golf App Supabase project, schema `sqlmcp_test` (D-060). Every slice adds its own section to the Security material (D-014), and the audit fields that go with its Tool calls (PRD, Sequencing).

## S-001 — Signing in from Claude and ChatGPT
Delivers: a Staff member can add the Deployment as a connector in Claude or ChatGPT and complete Sign-in through the organisation's Identity provider, with Entra ID and Google both tried, and the connector then shows as connected. They can ask it nothing yet, because it offers no tools. Anyone not signed in is still turned away with the not-authenticated reply, and an Operator can rotate `SERVER_SECRET` without signing anyone out.
Traces: J-002, R-009, R-017
Settles Q-019 by a live connection from both AI tools. Done also includes `.dev.vars.example` and one run of the local setup from a fresh clone (D-059).

## S-002 — Seeing which tables are available
Delivers: a signed-in Staff member can ask the Agent what data it can reach and gets exactly the tables and columns inside the Boundary and on the Allow-list in their connector URL, and nothing else. Errors from that listing never name a Hidden object. An Organisation admin can change that list by replacing the connector URL, with no redeploy, and a broken URL is reported as one. An Operator finds one Audit record per such Tool call in Workers Logs, naming the Staff member. Staff members still cannot read any rows.
Traces: J-003, R-003, R-010, R-017
After: S-001
Settles Q-015 by a live Allow-list in Claude's and ChatGPT's organisation connector settings. Ships the Visibility resolver, the Audit logger, the Allow-list helper command and the first Tool call (D-061).

## S-003 — Answering a question from the data
Delivers: a Staff member can ask a question in their own words and get an answer from rows the Agent reads with its own SELECT over Visible objects, on PostgreSQL hosted on Supabase. A result cut short by the Row limit says so. A query that reads a Hidden object or does anything but read is refused without naming what it touched. The Operator can trace any answer back to the Staff member, their Request text and the redacted SQL that ran.
Traces: J-004, J-008, R-002, R-004, R-006, R-011, R-015
After: S-002
Measures the real Workers Logs retention for the Security material (D-052). Adds `libpg-query` to the Worker bundle (ADR-005).

## S-004 — Measuring answer correctness on PostgreSQL
Delivers: the project can state, for each release, what share of the benchmark questions a named AI tool and model answers correctly on PostgreSQL, and how many it gives up on after three refused queries, from a run report anyone can rerun.
Traces: R-012
After: S-003
The benchmark's sample Database lives in `sqlmcp_test` (D-060).

## S-005 — Deploying on Cloudflare from the docs alone
Delivers: an Operator new to the project can deploy a public, read-only Deployment on Cloudflare against their own Supabase PostgreSQL, set its Boundary, Database account, Row limit and Sign-in, and have Staff members answering questions in under an hour, using only the Deployment kit's docs. One timed run by someone new to the project is recorded in the deployment trial log. MS SQL Server organisations have no Deployment yet.
Traces: J-001, R-001, R-013
After: S-003

## S-006 — Signing in to an MS SQL Server Deployment on Azure
Delivers: an Operator can deploy a public, read-only Deployment on Azure Container Apps from the Bicep template, against Azure SQL Database or SQL Server reachable from Azure. A Staff member can sign in from Claude or ChatGPT and see which tables are available, as S-001 and S-002 allow on Cloudflare. They cannot yet read any rows, and nobody has timed the deployment.
Traces: J-001, J-002, J-003, R-001, R-002, R-003, R-009
After: S-002
First build of the container image and the Node runtime adapter, with Bicep, Key Vault and the MS SQL Server catalog. Picks the image registry (operations.md), and adds MS SQL Server 2022 to the Docker Compose file. Waits on Q-022 for the Azure subscription and database (D-065, D-066).

## S-007 — Answering questions from MS SQL Server
Delivers: a Staff member on an MS SQL Server Deployment can do everything S-003 allows: answers from the Agent's own SELECT, cut-short results, Refusals that name nothing hidden, and an Operator trail with redacted T-SQL in Azure Monitor. Nobody has yet measured how well it answers.
Traces: J-004, J-008, R-002, R-004, R-006, R-011, R-015
After: S-003, S-006

## S-008 — Measuring MS SQL Server
Delivers: the project can state, for MS SQL Server as for PostgreSQL, the benchmark's correctness and give-up figures, and that the visibility test run shows no Hidden object names at the read-only tier. One timed Azure deployment by someone new to the project is recorded in the deployment trial log.
Traces: J-001, R-003, R-012, R-013
After: S-004, S-007

## S-009 — A Security reviewer approves a read-only Deployment
Delivers: a Security reviewer can approve or reject a read-only Deployment on either pairing, knowing what it exposes, who can call it and what it records, and the PRD's reviewer-walkthrough metric is met on a reference Deployment. Write tiers are not yet theirs to judge.
Traces: J-007, R-014
After: S-005, S-008

## S-010 — Changing a record
Delivers: at the read-and-write tier, a Staff member on either Engine can ask the Agent to insert a row or update one by its key in a Visible table, and an Operator can raise a Deployment to that tier. At read-only the write tools do not exist, and the tier holds even when the Database account could do more, as the tier test matrix shows on both Engines, along with no Hidden object names at this tier. Records cannot be deleted yet.
Traces: J-005, J-009, R-003, R-005, R-007, R-008
After: S-009

## S-011 — Deleting a record
Delivers: at the read-write-and-delete tier, a Staff member on either Engine can ask the Agent to delete a row by its key in a Visible table. Lower tiers have no delete tool, as the extended tier test matrix shows on both Engines.
Traces: J-005, J-009, R-005, R-007, R-008
After: S-010

## S-012 — Creating a table in a Conversation
Delivers: at the full tier, a Staff member on either Engine can have the Agent create a table inside the Boundary and keep querying it for the rest of that Conversation, including after reopening it. No other Conversation sees the table until an Organisation admin adds it to an Allow-list, and the creation response tells them to.
Traces: J-006, R-005, R-007, R-016
After: S-011

## Critique findings

Gate 1, 2026-10-18, critique in fresh context. Verdict: hold (0 blockers, 2 gaps, 2 nits).

- **gap — MS SQL Server has no benchmark run, visibility run or timed trial.** The PRD sets correctness, Hidden-object and deployment-time metrics per Engine, but S-008 traces neither R-012 nor R-013, and S-004 measures PostgreSQL only.
- **gap — S-009 is too large to deploy as one slice.** Three network setups and three timed trials bring back the bundling D-062 rejected for step 5.
- **nit — S-006 and S-007 say "the same" as S-005** and leave unsaid that MS SQL Server Operators wait for S-008.
- **nit — S-002 does not name Hidden-object handling in Database errors,** which PRD step 3 ships with visibility.

Hold resolved by the product owner, 2026-10-18:

- MS SQL Server measurement → a slice of its own, S-007, after the MS SQL Server Deployment (S-006).
- Private Deployments → split by cloud (S-008 Cloudflare, S-009 Azure). The product owner also narrowed the release to two pairings, PostgreSQL on Supabase from Cloudflare and MS SQL Server from Azure, with AWS deferred (D-063). The PRD, the ADRs and the system spec were amended to match. The AWS slice is gone, and S-006 now covers the MS SQL Server Deployment.
- Nits → every deployment slice now says what is still missing, and S-002 names Hidden-object handling in its errors.

Gate 2, 2026-10-18, a consistency critique of the D-063 amendment across the PRD, architecture, system spec and slices. Verdict: hold (0 blockers, 3 gaps, 4 nits). Both gate-1 findings were confirmed resolved.

- **gap — no supported AI tool can reach a private Deployment.** Claude's and ChatGPT's connectors call from the vendors' infrastructure.
- **gap — the MS SQL Server test Database and the Azure subscription are not stated.**
- **gap — the MS SQL Server Deployment slice is very large, and nothing says so.**
- **nits —** a stale AWS route in operations.md's revision record; the PRD's "any supported cloud and Engine"; an unneeded `After:` on the MS SQL Server slice; MS SQL Server Hidden-object coverage above read-only only implied.

Hold resolved by the product owner, 2026-10-18:

- Private Deployments → deferred (D-064). The two private slices are removed, and the PRD, ADR-002, ADR-009, the components, the skeleton record and the environments doc are amended.
- Azure test environment → provided by the product owner (D-065). Q-022 stays open until it exists.
- MS SQL Server Deployment → split into S-006, signing in and seeing tables, and S-007, answering questions (D-066). Slices renumbered.
- Nits → all four fixed. S-006 now comes after S-002, and the write slices state their tier matrix and Hidden-object coverage on both Engines.

Deferred: everything D-063 puts out of scope, R-001's AWS part included. Private Deployments (D-064). Schema changes other than creating a table (D-030). Copilot and other AI tools (D-043). Q-007's metric, which has no figure to rest on.
