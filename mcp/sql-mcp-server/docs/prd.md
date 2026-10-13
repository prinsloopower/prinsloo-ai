# PRD — sql-mcp-server

## This iteration
Both problems in the discovery document are addressed together. Answer 7 makes a
Security reviewer's sign-off and correct answers for Staff members joint conditions
of a first release, so neither ships without the other. The response is one Server
release that an Operator can deploy on any supported cloud and Engine. It carries
every Permission tier, with schema changes cut down to creating tables, and every
slice adds to the Security material.

## Scope
In: R-001, R-002, R-003, R-004, R-005, R-006, R-007, R-008, R-009, R-010, R-011, R-012, R-013, R-014, R-015, R-017
In: public and private Deployments alike (D-018), on every supported cloud (D-041).
Out (conditional): one cloud and Engine pairing, under D-020.
Out (conditional): R-016 moves to the next iteration if architecture finds no reliable way for the Server to tell Conversations apart (Q-014, D-039). Until architecture rules, it is planned, as sequencing step 7.
In: Claude and ChatGPT as the supported AI tools (D-043).
Out: Copilot and every other AI tool, deferred to a later iteration. The README says support is planned (D-043).
Out: AI tools whose Managed client configuration cannot carry an Allow-list (Q-015). Such tools are unsupported, and the Security material names them (D-040).
Out: schema changes other than creating a table (altering, dropping, indexing, renaming). The full tier's Typed tools create tables only this iteration (D-030, answers Q-008).
Out: creating an Object outside the Boundary. A create aimed outside it is a Refusal (D-031, answers Q-013).
Out: a step in the Server where the Staff member approves a write, delete or create before it runs (D-032, answers Q-016).
Out: any way for the Organisation admin to browse the names inside the Boundary. They use their own database tools or ask the Operator (D-033, answers Q-017).
Out: Semantic models shipped with the project, and any check that one matches the Allow-list (D-034, answers Q-004 and Q-005).
Out: views and functions as Objects. Tables and their columns only, this iteration (D-035, answers Q-020).
Out: any control over results reaching the AI provider. The Security material discloses it instead (D-036, answers Q-018).

## Success metrics
- Answer correctness ≥ 90% on the benchmark question set, for each Engine, measured by the benchmark run report each release produces (D-037, answers Q-003 and Q-012). Covers J-004.
- Benchmark questions still refused after three Agent-written queries ≤ 5%, from the same benchmark run report (D-042). Covers J-004.
- Hidden object names in anything the Agent receives = 0, across the release's visibility test run. This covers tool descriptions, results, Refusals and Database errors, at every Permission tier and both Engines, and the source is that test run's report. Covers J-003, J-004, J-005.
- Deployment time ≤ 60 minutes with no outside help. This applies to every supported cloud and Engine pairing as a public Deployment, and to one private Deployment on each cloud. Measured from timed run-throughs by an engineer new to the project, working from the docs alone and recorded in the release's deployment trial log. Covers J-001.
- Calls run without Sign-in = 0. Every call made with no Sign-in, both before sign-in is configured and after, is blocked with a reply that the connection is not authenticated, and leaves no Audit record (D-044). Source: the release's sign-in test run. Covers J-001, J-002.
- Sign-in completes for each supported Identity provider (Q-006) from both Claude and ChatGPT (D-043). Source: the sign-in test run report. Covers J-002.
- Allow-list changes that need a redeploy before they take effect = 0. Source: the visibility test run, which changes the Allow-list between Tool calls on one running Deployment. Covers J-003.
- Writes, deletes or creates completed above the Deployment's Permission tier = 0, across the tier test matrix. The matrix runs each tier against a Database account granted everything, and also re-runs it after the tier is raised and redeployed. Source: the tier test matrix report. Covers J-005, J-009.
- Created objects: queryable later in the same Conversation, including after it is reopened, in 100% of cases. Visible in any other Conversation before being added to an Allow-list in 0% of cases. The creation response says to add it to the Allow-list in 100% of cases. Source: the full-tier test run report. Covers J-006.
- Tool calls with a matching Audit record that names the Staff member = 100%. Audit records holding a result row = 0. With Redaction on, literal values in logged SQL and Typed tool inputs = 0. Source: an audit check over every Audit record the release test runs leave on the Host. Covers J-008.
- A Security reviewer outside the project answers all four of R-014's questions correctly for a reference Deployment, from the Security material and that Deployment's settings alone. Target 4 of 4, recorded in a reviewer walkthrough each release. Covers J-007.

No metric is set against the cost of the Analyst queue, because no figure exists (Q-007). The correctness metric stands in for it until one does.

## Sequencing
1. **A Deployment that blocks every call until Sign-in.** The first reachable Server already obeys D-017 and D-044, so there is never a window where the Database is exposed. This is the walking skeleton, on whichever cloud and Engine architecture picks first. Its Security material starts here (D-014).
2. **Sign-in (J-002), with the Audit record, before any Tool call runs a Statement.** R-009 rules out the reverse order, and R-010 means no signed-in Tool call goes unrecorded.
3. **Visibility (Boundary, Allow-list, D-012) before the first read reaches a Staff member.** Reads shipped before visibility would expose the schema that the second problem in discovery is about. Hidden-object handling in Refusals and Database errors (D-005) ships with it, not after.
4. **Agent-written queries with the Query check, Row limit and Cut-short result (J-004).** This is the first slice a Staff member can use, and the benchmark measures it.
5. **The other cloud and Engine pairings, and private Deployments, read-only.** These come before any write, so the deployment trial (R-013) and a reviewer walkthrough can run on a product that can only read. That is the configuration a reviewer is most likely to approve first (J-007 exits).
6. **Write, then delete, Typed tools and their Permission tiers (J-005, J-009).** Each tier ships only with its tier test matrix, because R-008 cannot be shown without it.
7. **Full tier: creating a table and its Conversation visibility (J-006).** This goes last because it depends on how the Server tells Conversations apart (Q-014, architecture). If architecture finds no reliable way, this slice moves to the next iteration (D-039).

Redaction (R-011) and the audit fields grow with each slice that adds a kind of Tool call. They are not a slice of their own.

## Non-goals
- No hosted or managed service run by the project. Every Deployment is self-hosted by an Operator (answer 1).
- No Engines beyond MS SQL Server and PostgreSQL, including MySQL, Oracle and SQLite.
- No user interface of the Server's own. Staff members work only through their AI tool, and Operators and Organisation admins work through configuration and docs.
- No undo, previous-value reporting or one-row limit on Typed tools (D-016).
- No sending Audit records off the Host, so no SIEM or log-shipping integration (D-006). How long records are kept is Q-010.
- No time or concurrency limits on Agent-written queries (D-003).
- No calling stored procedures or user-defined functions, through Typed tools or Agent-written queries (D-038). The Engine's built-in functions, such as aggregates and date functions, are not affected.
- No per-person or per-group Permission tier, even on request. Tiers are per Deployment by design (answer 6).

## Open
Which phase settles each question is recorded in the questions register. Listed here is what in this PRD waits on it.
- Q-001: the conditional Out line on cloud and Engine pairings.
- Q-006: the Identity providers the sign-in metric is measured against.
- Q-007: a metric for the cost of the Analyst queue, once a figure exists.
- Q-014: sequencing step 7 and the conditional Out line on R-016.
- Q-015, Q-019: if Claude or ChatGPT cannot carry an Allow-list or complete Sign-in, D-043 cannot be met, and the scope comes back to the product owner.
- Q-002, Q-009, Q-010, Q-011: nothing in this PRD. They are listed so that slicing knows they are still open.

## Critique findings

Gate 1, 2026-10-10, critique in fresh context. Verdict: fail (1 blocker, 6 gaps).

- **blocker — the "functions" non-goal reads as banning built-in functions in Agent-written queries.** D-035 removes functions only as Objects. Architecture could make the Query check refuse aggregates and date functions, collapsing J-004 and both benchmark metrics.
- **gap — R-016 is In without condition, yet Sequencing step 7 says it may move to the next iteration.** Slicing cannot tell whether J-006 is committed.
- **gap — three decisions have no D-###:** AI tools that cannot carry an Allow-list are unsupported (Q-015 line); no stored procedures; the step-7 deferral rule.
- **gap — the Redaction metric is wider than R-011.** "Literal values in Audit records" includes Request text, which Redaction never covers.
- **gap — private Deployments (D-018) are neither scoped nor sequenced,** and the deployment-time metric names only cloud and Engine pairings.
- **gap — "repeated Refusals" in the give-up metric has no count.**
- **gap — a non-goal restates D-016** ("Recovery is the organisation's backups plus the Audit record").

Revision 2, 2026-10-10:

- Functions → the non-goal now covers stored procedures and user-defined functions only, and built-in functions are named as unaffected (D-038).
- R-016 → moved out of the unconditional In line to Out (conditional) under Q-014 (D-039).
- Unrecorded decisions → D-038 (procedures), D-039 (step-7 deferral) and D-040 (AI tools without a managed Allow-list are unsupported, now a Scope line).
- Redaction metric → narrowed to logged SQL and Typed tool inputs.
- Private Deployments → In under D-018 and D-041, sequenced with step 5, with one deployment trial per cloud.
- Give-up count → three Agent-written queries refused for the same question.
- D-016 restatement → removed.

Gate 2, 2026-10-10, critique in fresh context. Verdict: hold (0 blockers, 2 gaps, 1 nit). All gate-1 findings confirmed resolved.

- **gap — "three tries stands for the Staff member giving up" is an unmarked claim.** J-004 says only "a few rephrasings". The benchmark harness would treat three as settled, and no D-### puts it to the product owner.
- **gap — the sign-in metric needs only "at least one target AI tool".** That silently allows a release with one working AI tool, and nothing says which AI tools this release must support. Slicing would test one tool while the Security material claims more.
- **nit — the Open section repeats routing that questions.md holds,** and has already drifted for Q-007.

Hold resolved by the product owner, 2026-10-11:

- Give-up count → three, now D-042, which the metric cites.
- AI tools → Claude and ChatGPT both required, with Copilot and others deferred and named as planned in the README (D-043). Scope and the sign-in metric now reflect this, and the Open section notes that Q-015 and Q-019 can reopen it.
- Nit → the Open section now says only what in this PRD waits on each question.

Human gate, 2026-10-11: the product owner approved the PRD and confirmed the model decisions, except D-027. Unsigned calls are now blocked and not logged (D-044). The sign-in and audit metrics and sequencing steps 1–2 were revised to match. The correctness target of 90% is confirmed (D-045).
