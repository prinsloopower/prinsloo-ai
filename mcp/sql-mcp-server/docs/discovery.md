# Discovery — sql-mcp-server

## Sources

- 2026-10-10 product brief, product owner — inputs/brief.md
- 2026-10-10 discovery interview, product owner, three rounds (answers 1–22) — inputs/interview-2026-10-10.md

No user interviews, support data or usage figures exist yet. Every cost below is
qualitative, and the people named are described by the product owner rather than
heard from directly.

## Problems

### Business staff wait on someone who knows SQL to answer questions about their own data
Who: non-technical business staff (managers, analysts, ops people) at organisations that keep data in MS SQL Server or PostgreSQL.
Cost: answers are delayed, and the analysts and developers who field the requests spend their time on them. Not quantified (Q-007).
Today they: file a request and wait for an analyst or developer to write the query.
Source: inputs/interview-2026-10-10.md, answer 3.

### Organisations cannot approve the SQL MCP servers that exist today
Who: security and compliance reviewers at organisations that want to give business staff AI access to their databases, and the self-hosting engineers who must get a deployment past them.
Cost: AI access to the data is blocked outright, so the organisation stays with the analyst queue in the problem above. Generic servers give the agent the full schema and let it run arbitrary SQL, which reviewers will not sign off.
Today they: decline to deploy, and business staff keep waiting on analysts.
Source: inputs/interview-2026-10-10.md, answers 3 and 7; inputs/brief.md ("must not risk schema exposure and result in unpredictable database queries").

## Requirements

### R-001 — An engineer can self-host the server on AWS, Azure or Cloudflare
It is unmet if an operator who uses only one of these three clouds cannot run it there without adding a second cloud provider.
Source: inputs/brief.md ("Cloud-hosted: supports AWS, Azure and Cloudflare"); inputs/interview-2026-10-10.md, answer 1 (open-source, self-hosted). See Q-001.

### R-002 — The server answers questions against both MS SQL Server and PostgreSQL databases
It is unmet if a deployment pointed at either engine cannot run the same tools and return correct results.
Source: inputs/brief.md ("for MS SQL server and PostgreSQL").

### R-003 — The agent can see only objects that are inside the operator's boundary and on the organisation's allow-list
Two settings decide visibility. The operator sets a boundary (for example, included schemas and excluded tables). An organisation admin sets an allow-list of tables and columns within that boundary. The agent sees only what both permit, plus objects created in the current conversation (R-016). Anything else never shows up in anything the agent receives: tool descriptions, query results, or error messages.
It is unmet if a question about a hidden object returns its name, its columns, or anything that confirms it exists, or if an allow-list naming an object outside the boundary makes that object visible.
Source: inputs/interview-2026-10-10.md, answers 4, 19 and 20; inputs/brief.md ("must not risk schema exposure"). Error messages are covered by assumption (D-005); how far the server trusts the allow-list it receives is assumed (D-009); what the agent sees when either setting is missing is assumed (D-012). Where the allow-list is kept is the owner's constraint (D-011).

### R-004 — Only predictable statements reach the database
Three kinds of statement may run: those built by a fixed, typed tool, acting only on objects the agent can see (R-003); read-only SELECTs written by the agent that the server has checked against what the agent may see (R-003) before running them; and the server's own metadata and health-check statements. It is unmet if any other statement reaches the database, including a SELECT that touches a hidden object or carries a second statement inside it; if a typed tool writes to, deletes from or changes a hidden object, or its refusal confirms the object exists; or if the server's own statements put anything in front of the agent that R-003 hides.
Source: inputs/brief.md ("must not … result in unpredictable database queries"; "deterministic, typed tools"); inputs/interview-2026-10-10.md, answers 5, 17 and 23.

### R-005 — Writes and schema changes happen only through fixed, typed tools
Agent-written SQL is never used to insert, update, delete or change the schema. It is unmet if any agent-supplied SQL text that changes data or schema is executed, whatever permission tier the deployment has.
Source: inputs/interview-2026-10-10.md, answer 5.

### R-006 — The agent may write its own read queries over the objects it can see on every deployment, with or without a semantic model
The server does not know whether the agent has a semantic model; that guidance lives with the agent, as a skill. Where R-006 and R-004 pull apart, R-004 wins: a SELECT the server cannot fully check is refused, and the refusal tells the agent the query was not accepted so it can rephrase (D-013). It is unmet if the server requires, registers or checks for a semantic model before accepting an agent-written SELECT, or if a deployment refuses a SELECT that passes the R-004 check.
Source: inputs/interview-2026-10-10.md, answer 11 (D-001). Priority over R-004 assumed (D-013).

### R-007 — The operator sets one permission tier for the whole deployment, from a fixed, ordered set
The tiers, lowest to highest: read-only; read and write; read, write and delete; full, which adds schema changes (DDL). Each tier includes everything below it. Every signed-in person gets the same tier.
It is unmet if a deployment can enable a capability without every tier below it (for example delete without write, or schema changes without delete), if a lower tier leaves a working tool from a higher one, or if two signed-in users of one deployment get different tiers.
Source: inputs/brief.md ("Configurable support for DDL and DML"; "preconfigured for read-only operations, or read, write and delete"); inputs/interview-2026-10-10.md, answers 6 and 10. See Q-008.

### R-008 — The deployment's permission tier holds even when the database account could do more
It is unmet if a read-only deployment, connected with a database account that has write grants, completes a write.
Source: inputs/brief.md ("MCP-level read/write/delete settings override the SQL user account's access"). What "override" means when the database account can do *less* is assumed (D-004).

### R-009 — Every tool call is made on behalf of a signed-in person
It is unmet if any tool runs for a caller who has not signed in, or if the server cannot say which person a call came from.
Source: inputs/brief.md ("Authentication via OAuth"). The brief names the mechanism, which is carried to architecture as a constraint (D-002). See Q-006.

### R-010 — Every request, run or refused, leaves an audit record on the host
Each record holds the person's identity, the natural-language request, the SQL statement executed or attempted (subject to R-011), the row count or the reason for refusal, and the timing. Records stay on the host running the server.
It is unmet if any request — including one refused under R-003, R-004 or R-007 — cannot be matched to a record naming the person who made it, or if records are sent anywhere off the host.
Source: inputs/brief.md ("Logs every user request and resulting SQL query on the cloud container"); inputs/interview-2026-10-10.md, answers 7, 8, 13 and 14. The brief's placement is carried to architecture as a constraint (D-006). See Q-002.

### R-011 — Audit records never contain result rows, and the operator alone decides whether values inside logged SQL are kept or redacted
Literal values inside a logged statement (often copied from earlier results) are either kept exactly or redacted, by a server setting. The person asking cannot change it. Redaction covers SQL only: the natural-language request is logged as received, and the project's material says so plainly.
It is unmet if any result row appears in an audit record, if redaction is on and a literal value appears in a logged statement, if anything a signed-in person sends can change the setting, or if the project's material implies redaction also covers the request text.
Source: inputs/interview-2026-10-10.md, answers 8, 9 and 24. The default when the operator sets nothing is assumed (D-007).

### R-012 — Business staff get correct answers to typical questions without an analyst checking each one
It is unmet if answers to a representative set of business questions have to be checked by an analyst before anyone can rely on them.
Source: inputs/interview-2026-10-10.md, answer 7. "Typical" and "correct" are not yet defined (Q-003), nor is which AI client and model the measurement runs with (Q-012).

### R-013 — A self-hosting engineer can get the server running in their cloud in under an hour, from the docs alone
The hour ends when the server is deployed, connected to the database, and reachable. Identity-provider and allow-list setup fall outside it. It is unmet if an engineer with database credentials and a cloud account to hand needs more than an hour, or outside help, to get there.
Source: inputs/interview-2026-10-10.md, answers 7 and 12.

### R-014 — A security reviewer at an adopting organisation has what they need to sign off a deployment
It is unmet if a reviewer cannot tell, from the project's own material, what the agent can see, what it can run, who can call it, and what is logged.
Source: inputs/interview-2026-10-10.md, answer 7. What a reviewer needs to see is assumed from R-003, R-004, R-009 and R-010; see Q-011.

### R-015 — Agent-written reads return no more rows than a limit the operator sets for the deployment
It is unmet if an agent-written SELECT returns more rows than the limit, or if anything a client or signed-in person sends changes the limit. A result cut short says so to the agent (D-010).
Source: inputs/interview-2026-10-10.md, answers 16 and 21. No time or concurrency limits were asked for.

### R-016 — An object created through the server is visible for the rest of that conversation only, and the agent is told it should be added to the allow-list
It is unmet if the agent cannot query an object it created earlier in the same conversation, if the object is visible in any other conversation before an admin adds it to the allow-list, or if the response to the create does not say the object needs adding to the allow-list.
Source: inputs/interview-2026-10-10.md, answer 15. Applies only at the full tier (R-007). See Q-013.

### R-017 — Each setting has one owner: the operator or an organisation admin; the person asking questions owns none
The operator owns the database connection and credentials, identity-provider settings, permission tier, literal redaction in logs, row limit, and the visibility boundary. An organisation admin owns the allow-list, which changes without redeploying the server and can only narrow what the operator's settings allow. The semantic model is a skill on the agent's side, not a setting of the server.
The server guarantees what it controls. Keeping the allow-list out of end users' hands depends on the organisation locking its client configuration, which this product cannot enforce (D-009); the project's own material says so, so a reviewer (R-014) does not take it as a server guarantee.
It is unmet if anything a person asking questions sends to the server can change an operator-owned setting; if an allow-list, from any source, can widen anything an operator setting restricts; if changing the allow-list requires a redeploy; or if the project's material presents the client lock as something the server enforces.
Source: inputs/interview-2026-10-10.md, answers 9, 18, 19, 20, 21 and 22. Where the allow-list is kept is the owner's constraint (D-011).

## Open questions

- Q-001 — Must both engines work on all three clouds? Running on Cloudflare may limit which databases the server can reach directly, especially MS SQL Server. Blocks architecture.
- Q-002 — The server sees the agent's tool calls, not what the person typed. Is it acceptable for the "natural-language request" in the audit record (R-010) to be the agent's own account of the question, given that it cannot be verified? Blocks architecture.
- Q-003 — What counts as a "typical question" and a "correct answer" (R-012), and who supplies the representative set it is measured against? Blocks PRD.
- Q-004 — Who writes the semantic model, and does the project help keep it in step with the client allow-list (for example, warn when a model names an object the agent cannot see)? Blocks domain model.
- Q-005 — Do the semantic models ship with the project, or does each operator write their own? Blocks PRD.
- Q-006 — Which identity providers must sign-in work with at first release (for example Microsoft Entra ID, AWS Cognito, Auth0, Google)? Blocks architecture.
- Q-007 — Is there any figure for the cost of the analyst queue (requests per week, turnaround time) to set a success metric against? Blocks PRD.
- Q-008 — Which schema changes count as in scope for the DDL tools (create table, alter column, create index, drop)? Blocks PRD.
- Q-009 — Is one deployment connected to one database, or can it serve several? Blocks architecture.
- Q-010 — How long must audit records be kept on the host? Shipping them elsewhere is ruled out (answer 13); retention is not answered. Blocks system spec.
- Q-011 — Is there a particular framework security reviewers will check against (for example SOC 2, ISO 27001, an internal checklist)? Blocks system spec.
- Q-012 — Which AI client and model is correctness measured with, and does the server answer only for the queries it runs being faithful to what the agent asked? Blocks PRD.
- Q-013 — May the agent create an object outside the server's visibility boundary (R-003)? If so, R-016 makes it visible for the conversation, but no allow-list could ever make it visible later. Blocks PRD.
- Q-014 — How does the server tell one conversation from the next (R-016)? A client may keep one connection across many chats, or reconnect in the middle of one, so a connection may not be the same thing as a conversation. Blocks architecture.

## Critique findings

Gate 1, 2026-10-10, critique in fresh context. Verdict: fail (3 blockers, 3 gaps).

- **blocker — R-010 and R-011 conflict.** Logging "the SQL statement executed" will log result values the agent reuses as literals (e.g. `WHERE customer_email = '…'`), which breaks R-011; redacting literals breaks R-010. No priority stated. Affects the log format at architecture and system spec.
- **blocker — R-010 carries a mechanism.** "Written to the logging of the cloud container" is the brief's mechanism, stated as a need with no D-### recording it as an inherited constraint (unlike OAuth, D-002). It narrows the Cloudflare runtime choice (R-001) and Q-010.
- **blocker — R-013 cites a source for an inference.** Answer 7 says "running in their cloud from the docs alone"; "reach a first answered question" (pulling identity-provider, allow-list and semantic-model setup into the hour) is not in the source.
- **gap — R-006 rests on an expensive, unflagged assumption.** Semantic models are "provided to the agent as skills" (client side), yet R-006's test assumes the server knows whether one exists. No Q-### asks whether free reads should depend on a semantic model, or whether the server holds one.
- **gap — R-007 leaves the permission configuration's shape undefined.** Two levels, or separate flags for read/write/delete/DDL/DML? Can DDL be on while DML is off; delete separate from write?
- **gap — R-012 measures what the server does not fully control.** Answer quality depends on the client's AI model and the semantic model; no Q-### asks which client/model the measurement runs with.

Revision 2, 2026-10-10, after a second round of questions to the product owner (answers 9–12):

- R-010/R-011 conflict → the operator sets whether literals in logged SQL are redacted; result rows are never logged (R-011, answer 9). Default assumed in D-007.
- R-010 mechanism → the brief's container logging is recorded as a constraint in D-006.
- R-013 source → endpoint now from answer 12: server deployed, connected and reachable.
- R-006 → the server does not hold or check for semantic models (answer 11). D-001 now records the owner's decision.
- R-007 → fixed, ordered tiers (answer 10).
- R-012 → Q-012 added.

Gate 2, 2026-10-10, critique in fresh context. Verdict: fail (1 blocker, 5 gaps, 1 nit). Gate-1 findings confirmed resolved, except that the R-010 rewrite introduced the blocker below.

- **blocker — R-010 forbids audit records leaving the deployment.** No source says so, and it pre-answers Q-010; shipping logs to a SIEM (often what a reviewer wants, R-014) would fail R-010 by definition.
- **gap — R-004 makes the server's own statements a violation.** Introspection for typed tools and allow-list checks, plus connection/health checks, are neither typed-tool statements nor agent SELECTs.
- **gap — R-015 is assumed with no Q-### putting it to the owner;** its title promises "cannot overload" but its test covers only a single query, not concurrent load.
- **gap — no rule for DDL at the "full" tier versus the allow-list (R-003/R-007).** Does a table the agent creates stay invisible, or do DDL tools edit the allow-list the operator controls?
- **gap — R-010's title says every request; its test covers only queries that ran.** Refused attempts (R-003/R-004) would go unlogged.
- **gap — D-006 is marked human but holds a model reading** (the Cloudflare log-facility interpretation); it should be a separate model-decided entry.
- **nit — R-006 and R-015 overlap:** is a SELECT cancelled for exceeding its bounds a "refused valid SELECT"?

Rework count reached two; the router stopped and took the gaps to the product owner as a fault in the source material. Revision 3, 2026-10-10, after a third round (answers 13–22):

- R-010 export clause → now sourced: records stay on the host (answer 13). Q-010 narrowed to retention.
- R-004 server statements → the server's own metadata and health-check statements are permitted (answer 17), bounded by R-003.
- R-015 → owner-confirmed: a row limit, server-set (answers 16, 21); no time or concurrency limits asked for. D-003 now records the owner's decision.
- DDL versus allow-list → new R-016: created objects are visible for that conversation only, with a prompt to add them to the allow-list (answer 15). Q-013 raised for objects outside the boundary.
- Refused attempts → R-010 now covers them (answer 14).
- D-006 → Cloudflare reading split out to D-008, marked model.
- R-006/R-015 nit → a limit cuts results short rather than refusing the query; R-006 is no longer in tension.
- Owner-initiated change → the allow-list moves to admin-managed client configuration, bounded by a server-side boundary (answers 18–20). R-003 rewritten; R-017 added for the configuration split; D-009 records how far the server trusts the client allow-list.

Gate 3, 2026-10-10, critique in fresh context. Verdict: fail (1 blocker, 3 gaps). All gate-2 findings confirmed resolved.

- **blocker — R-017 and R-003 state where the allow-list lives, not the need.** The need (answers 18–20): it changes without a redeploy, only an organisation admin controls it, and it only narrows the server boundary. "End users cannot edit it" is in no requirement, and no D-### records client-side placement as the owner's constraint.
- **gap — R-016 depends on a "conversation" boundary the server may not be able to identify.** No Q-### asks how; architecture would invent it.
- **gap — no default when no client allow-list arrives or no boundary is set.** System spec would choose between deny-all and the whole boundary with no basis.
- **gap — R-017's "log destination" setting conflicts with R-010's on-host rule.** It came only from answer 22 (proposed by the interviewer) and sits against answer 13.

Revision 4, 2026-10-10, no further owner input needed:

- Allow-list placement → R-003 and R-017 now state the need (admin-owned, changes without redeploy, only narrows; the person asking owns no setting). The owner's choice of admin-managed client configuration is recorded as a constraint in D-011.
- Conversation boundary → Q-014 raised, blocking architecture.
- Visibility default → deny by default, assumed in D-012 for the owner to confirm at this gate.
- Log destination → removed from R-017. It was the interviewer's wording in answer 22, and answer 13 already fixes records to the host.

Gate 4, 2026-10-10, critique in fresh context. Verdict: fail (2 blockers). All gate-3 findings confirmed resolved.

- **blocker — R-017's test contradicts D-011, D-009 and D-012.** Under D-011 the allow-list lives in client configuration; whether a user can edit it depends on the organisation's admin tooling, not this product. R-017 as written promises something no server design can guarantee, and system spec and reviewer material (R-014) would claim it.
- **blocker — R-006 and R-004 trade off with no stated priority** over SELECTs the checker cannot analyse (dialect constructs such as CROSS APPLY, PIVOT, OPENJSON, recursive CTEs). Architecture would pick a parser and a supported subset, and slice-spec would test R-006, with no record of which requirement wins.

Revision 5, 2026-10-10:

- R-017 → scoped to what the server controls; the client lock is stated as a dependency on the organisation's tooling that the project's material must disclose (D-009).
- R-004 vs R-006 → R-004 wins: a SELECT the server cannot fully check is refused, with a message so the agent can rephrase (D-013, model, for the owner to confirm). Which SQL constructs the checker supports is left to architecture.

Gate 5, 2026-10-10, critique in fresh context. Verdict: hold (0 blockers, 2 gaps). All gate-4 findings confirmed resolved.

- **gap — nothing says whether typed write, delete and DDL tools may act on hidden objects.** R-004 lets typed-tool statements run with no visibility condition; R-003 controls only what the agent receives. An agent that guesses a hidden table's name could change or delete its rows. Affects system-spec security rules and the write/DDL slice-specs.
- **gap — redaction does not cover the logged natural-language request.** R-011 redacts literals in SQL only; the request text in R-010 can carry the same values. Reviewer material would overstate what redaction does.

Hold resolved by the product owner, 2026-10-10 (answers 23–24):

- Typed tools on hidden objects → R-004 now applies the visibility rule to typed tools too, refusing without confirming existence (answer 23).
- Redaction of request text → redaction stays SQL-only; R-011 now requires the project's material to disclose that request text is logged as received (answer 24).
