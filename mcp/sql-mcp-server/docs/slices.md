# Slices

Ordered by the PRD's sequencing, under D-063. The walking skeleton (step 1) is already deployed on Cloudflare against Supabase (skeleton.md), so S-001 extends that path. Every PostgreSQL slice ships to the project test Deployment, and its tests run against the AI Golf App Supabase project, schema `sqlmcp_test` (D-060). Every slice adds its own section to the Security material (D-014), and the audit fields that go with its Tool calls (PRD, Sequencing).

## S-001 — Signing in from Claude and ChatGPT
Delivers: a Staff member can add the Deployment as a connector in Claude or ChatGPT and complete Sign-in through the organisation's Identity provider, tested with Entra ID (D-073), and the connector then shows as connected. They can ask it nothing yet, because it offers no tools. Anyone not signed in is still turned away with the not-authenticated reply, and an Operator can rotate `SERVER_SECRET` without signing anyone out.
Traces: J-002, R-009, R-017
Settles Q-019 by a live connection from both AI tools. Done also includes `.dev.vars.example` and one run of the local setup from a fresh clone (D-059).

## S-002 — Seeing which tables are available
Delivers: a signed-in Staff member can ask the Agent what data it can reach, and gets exactly the tables and columns the Database account is granted, inside the Boundary, and nothing else. Errors from that listing never name a Hidden object. A Database administrator can change what is visible by granting or revoking in the database, which takes effect on the next Tool call with no redeploy and no reconnect. A Deployment whose Database account bypasses grants refuses to serve. An Operator finds one Audit record per such Tool call in Workers Logs, naming the Staff member. Staff members still cannot read any rows.
Traces: J-003, R-003, R-010, R-017
After: S-001
Ships the Visibility resolver reading grants on PostgreSQL and the Database account check (ADR-006, D-077), the Audit logger and the first Tool call (D-061). Creates the dedicated `sqlmcp_reader` role on the test Database, whose tests grant and revoke on the `sqlmcp_test` schema (D-060, D-077).

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
Delivers: an Operator new to the project can deploy a public, read-only Deployment on Cloudflare against their own Supabase PostgreSQL, and have it deployed, connected to the Database and reachable in under an hour, using only the Deployment kit's docs (R-013). Setting its Boundary, Database account, Row limit and Sign-in, and Staff members answering questions, are timed too, outside the hour (Q-038). One timed run by someone new to the project is recorded in the deployment trial log. MS SQL Server organisations have no Deployment yet.
Traces: J-001, R-001, R-013
After: S-003

## S-006 — Listing MS SQL Server tables from the container image
Delivers: the product owner, acting as a Staff member, runs the published container image on their own machine against MS SQL Server 2022 in Docker, and adds it to Claude Code, which can reach a local server. They sign in through Entra ID and ask which tables they may query. They get exactly what the Database account is granted, inside the Boundary, as S-002 gives on Cloudflare. Each question leaves one Audit record on the container's standard output, naming them. An account that holds anything past the read-only list is refused. This is how the image is checked, not a supported way for Staff members to use it (D-064). Claude and ChatGPT cannot reach it yet, because nothing runs on Azure, and it reads no rows.
Traces: J-002, J-003, R-002, R-003, R-009, R-010
After: S-002
First build of the Node runtime adapter and the container image, published to GHCR (D-115). Adds MS SQL Server's Allow-list and its closed Database account check (security.md, D-122 to D-124), and MS SQL Server 2022 in Docker Compose. The account check's `public` defaults are measured before it ships (D-123): on SQL Server 2022 in Docker, and on `mcp-test` by running the check's query in the Azure portal's query editor, so no firewall rule is added (D-125). It ships as an image tag on GHCR, with no Deployment, and S-013 is the first live use of `mcp-test`. Split from the first S-006 (D-121), whose spec and critique record carry over.

## S-013 — Deploying an MS SQL Server Deployment on Azure
Delivers: an Operator can deploy a public, read-only Deployment to Azure Container Apps with the two-stage Bicep kit and its guide, against Azure SQL Database. A Staff member can then sign in from Claude and from ChatGPT and see which tables are available, as S-006 gives locally. A grant or revoke shows on the next question, and each question's Audit record is in Log Analytics. They cannot yet read any rows, and nobody has timed the deployment. SQL Server outside Azure SQL Database waits for private networking (D-120).
Traces: J-001, J-002, J-003, R-001, R-002, R-003, R-009, R-010
After: S-006
Adds the Bicep kit, the Key Vault arrangement, forced revisions for rotation and the Azure guide with its monitoring queries (operations.md, D-117 to D-119, D-121). Creates the project's MS SQL Server test Deployment in `ai-dev` (D-113).

## S-007 — Answering questions from MS SQL Server
Delivers: a Staff member on an MS SQL Server Deployment can do everything S-003 allows: answers from the Agent's own SELECT, cut-short results, Refusals that name nothing hidden, and an Operator trail with redacted T-SQL in Azure Monitor. Nobody has yet measured how well it answers.
Traces: J-004, J-008, R-002, R-004, R-006, R-011, R-015
After: S-003, S-013

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
Delivers: at the full tier, a Staff member on either Engine can have the Agent create a table inside the Boundary and keep querying it for the rest of that Conversation, including after reopening it. No other Conversation sees the table until the Database administrator takes it over and grants it (D-076), and the creation response tells them so.
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

Amendment, 2026-11-08 (D-121): S-006 is split. It now covers the container image, the Node adapter and MS SQL Server listing, run locally against Azure SQL Database. The new S-013 deploys it on Azure with the Bicep kit and connects Claude and ChatGPT. S-007 now comes after S-013. The MS SQL Server Operator target is Azure SQL Database only (D-120), which applies Q-041's backlog item.

Amendment review, 2026-11-08, by a fresh critic. Verdict: hold (0 blockers, 1 gap, 5 nits).
- **gap:** S-006 ran in an environment nothing defined. The image on the product owner's machine could not reach `mcp-test` through a firewall that allows Azure services only.
- **nits:**
  - Q-038's S-005 correction was not applied;
  - S-006 read as a supported local setup, against D-064;
  - S-013 said "Claude or ChatGPT";
  - S-006 did not mention its Audit record;
  - S-013 did not trace R-003.

Hold resolved by the product owner, 2026-11-08: "Docker SQL Server". S-006 is checked live against SQL Server 2022 in Docker, and `mcp-test`'s defaults are measured in the portal's query editor (D-125). The nits are fixed, and S-013 also traces R-010. The product owner then passed the amendment: "Pass".

Amendment, 2026-10-20 (D-074, iteration 2): S-002 now reads the Allow-list from the Database account's grants instead of a connector-URL segment. Its helper command and the Q-015 live test are gone. S-012's Created objects become visible elsewhere by grant. S-001's line names Entra ID only (D-073).
