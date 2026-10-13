# Journeys — sql-mcp-server

Four people appear here, all named as the discovery document names them: the
**operator** (the self-hosting engineer), the **organisation admin**, **business
staff** (the person asking), and the **security reviewer**.

## J-001 — Getting the server running in the operator's cloud
Traces: R-001, R-002, R-003, R-008, R-009, R-013
Trigger: business staff keep asking for AI access to the company database, and the operator has been told to find something a reviewer could approve.
Resolution: the server is deployed in the operator's existing cloud, connected to the database, reachable, limited to a boundary the operator chose, and refusing every call until sign-in is set up (D-017).

1. They find the project and check, before investing time, that it runs on their cloud and talks to their database engine.
2. They create a database account for the server and decide what to grant it. They are told the deployment's tier will hold even if the account can do more, but that the account caps what any tier can do — so they grant what the highest tier they expect to use will need, and no more.
3. They decide the boundary: which schemas and tables could ever be visible, leaving out anything no one should reach through an agent.
4. They decide whether to expose the server publicly, so hosted AI tools can reach it, or keep it inside the organisation's network for clients running there (D-018).
5. They follow the docs to deploy on their cloud, supplying the connection details, credentials and boundary; with no tier set, it runs read-only (D-019).
6. They check the server is up and can reach the database, see that a tool call is refused because sign-in is not set up yet, and note how long it took.

Exits:
- Their cloud and engine combination is not supported (for example MS SQL Server on Cloudflare, Q-001); they stop at step 1 and look for another product.
- Unsure what to grant, they reuse an existing over-privileged account "for now", and the tier becomes the only thing between the agent and those grants.
- The docs assume a tool, permission or network route they do not have; they stall past the hour, ask for outside help, or abandon.
- The cloud cannot reach the database (private network, firewall); they cannot fix this alone and park the project behind a network change request.
- Their organisation will not allow a public endpoint with database access; they deploy privately, and find the hosted AI tool staff use cannot reach it, so they either switch staff to a client that runs inside the network or stop.

Depends on: a cloud account with rights to deploy; a network path from that cloud to the database; for a public deployment, permission to expose an HTTPS endpoint, and for a private one, staff clients that run inside the network; the ability to create a database account and grant it rights; knowing the schema well enough to draw a boundary.

## J-002 — Requiring staff to sign in before anyone can use the server
Traces: R-009, R-017
Trigger: the server is up but refusing every call (J-001), and staff are waiting to use it.
Resolution: anyone the organisation's identity provider authenticates can call the server (D-015), and each call is attributed to a person.

1. They register the server with the organisation's identity provider so staff can sign in with their existing accounts.
2. Because every account the provider authenticates will get in — guests and external accounts included — they decide whether the provider's own membership is tight enough, and remove or restrict accounts there if not.
3. They give the server the identity-provider settings.
4. They try a call without signing in and see it refused, then sign in with their own work account and see it accepted under their name.

Exits:
- Their identity provider is not supported (Q-006); they cannot proceed and stop.
- They lack admin rights in the identity provider; they wait on another team, sometimes for weeks.
- The provider holds guest or contractor accounts they cannot remove; they go ahead anyway, and a reviewer later objects (J-007), or they stop.
- Their staff's AI tool cannot complete sign-in against this provider (Q-019); they try another tool or pause the rollout.

Depends on: someone with rights to register an application in, and manage accounts of, the organisation's identity provider; the staff's AI tool can complete sign-in against that provider (Q-019).

## J-003 — Making data available to the agent across the organisation
Traces: R-003, R-017
Trigger: staff ask the organisation admin to let the agent answer questions about a set of tables (for example, sales orders and customers).
Resolution: those tables and columns are visible to every staff member's agent, without the server being redeployed.

1. The admin checks the requested tables fall inside the operator's boundary.
2. They decide which tables and which columns to include — often trimming columns (salary, personal details) staff did not mention but the agent would otherwise see.
3. They add them to the allow-list in the managed client configuration and push it to staff.
4. A staff member confirms their agent can now see the tables.

Exits:
- A requested table lies outside the boundary; the admin asks the operator to widen it, which needs a redeploy, and staff wait or give up.
- The admin finds the organisation's AI tool offers no managed setting that can carry an allow-list (Q-015) and abandons the rollout for that tool.
- A staff member's client never receives the configuration; under deny-by-default (D-012) their agent sees nothing, and they report that "it doesn't work".
- The admin cannot find the exact table and column names to write down, guesses, and the agent sees less than staff asked for.

Depends on: the organisation's AI tool supports admin-managed configuration that end users cannot edit (D-009, D-011); the admin can reach the operator; the admin has some view of the table and column names inside the boundary (Q-017).

## J-004 — Business staff answer a question about their own data
Traces: R-003, R-004, R-006, R-012, R-015
Trigger: a manager needs a figure for a meeting this afternoon (for example, last quarter's revenue by region) and the analyst is busy.
Resolution: they have an answer they are willing to use without an analyst checking it.

1. They ask the question in their AI tool, in their own words.
2. The first time, they sign in with their usual work account (J-002).
3. The agent, helped by a semantic model if it has one, writes a query; the server checks it and runs it, or refuses it and the agent rephrases.
4. The agent answers, saying so if the result was cut short by the row limit.
5. They decide whether to trust the answer — the step this product is built for, made with no SQL knowledge and no view of the query.

Exits:
- The agent's queries keep being refused (D-013); after a few rephrasings it gives up, and they file a request with the analyst after all.
- The data they need is not on the allow-list; the agent says it cannot find it, and they do not know whom to ask.
- The result was cut short; they cannot tell whether the figure is a total or a partial one, and ask the analyst to check.
- The figure does not match what they expected; with no way to judge it, they ask the analyst — R-012 unmet for this question.
- The figure looks plausible but is wrong (wrong join, wrong date range, wrong definition of revenue); they use it in the meeting, and the error surfaces later, if at all — R-012 unmet without anyone noticing.

Depends on: their AI tool can reach the server — over the public endpoint for a hosted tool, or from inside the network for a private deployment (D-018) — and can complete sign-in (Q-019); they have a work account in the organisation's identity provider; the operator has set a row limit; their AI tool relays the server's cut-short notice to them, which the server cannot guarantee.

## J-005 — Business staff change a record through the agent
Traces: R-004, R-005, R-007, R-008
Trigger: an ops person spots a wrong value (for example, an order marked open that shipped last week) and wants it fixed without raising a ticket.
Resolution: the record is corrected.

1. They tell the agent what is wrong and what it should be.
2. The agent uses a typed tool to make the change on a table it can see.
3. They check the agent's account of what it changed — the judgement point, since a wrong change is worse than none.
4. They confirm the record now reads correctly.

Exits:
- The deployment is read-only; even though the database account could make the change, the agent says it cannot, and they go back to the ticket queue.
- The database account lacks the grant the tier needs; the change fails, and, unable to tell whether to blame the agent or the system, they raise a ticket after all.
- The agent changes the wrong record, the wrong field, or more rows than they meant, and they notice at step 3 or 4. The product offers no undo (D-016); they ask whoever looks after the database to restore it from backup or correct it by hand, using the audit record (J-008) to say what happened, and stop trusting the agent with changes.
- The table is not visible to the agent; the refusal gives no hint why, and they give up.
- The row cannot be pinned down uniquely (no key the tool can use); the agent cannot be sure which record to change, and they stop.
- They cannot tell exactly what the agent is about to change and stop before it acts (whether they approve a change first is Q-016).

Depends on: the database account the operator created has the grants the tier needs (D-004); the target table has a key that identifies one row.

## J-006 — Creating a new table in a conversation
Traces: R-005, R-007, R-016
Trigger: a member of business staff on a full-tier deployment needs somewhere to hold data for a new piece of work (for example, a list of accounts to follow up).
Resolution: the table exists, they use it for the rest of the conversation, and the organisation admin adds it to the allow-list so it stays visible.

1. They ask the agent to create the table.
2. The agent creates it with a typed tool and passes on the message that it needs adding to the allow-list.
3. They load and query it in the same conversation.
4. They ask the admin to add it to the allow-list.

Exits:
- The database account lacks create rights; the create fails, and they abandon the idea or ask the operator.
- They miss the message, or their AI tool does not show it; next day, in a new conversation, the table is invisible, and they create it again under another name.
- The admin does not act; after chasing once or twice, they stop using the table and keep the data in a spreadsheet instead, leaving an orphan no one's agent can see.
- They created it outside the boundary (Q-013); no allow-list can ever make it visible, and they cannot tell why.
- Their AI tool treats one connection as many conversations, or reconnects mid-conversation (Q-014); they find the table missing mid-task and recreate it, or a colleague stumbles on it.

Depends on: the database account has create rights (D-004); their AI tool shows the server's message; an organisation admin they can reach.

## J-007 — A security reviewer decides whether to approve a deployment
Traces: R-003, R-004, R-009, R-010, R-011, R-014, R-017
Trigger: the operator asks for approval to connect staff AI tools to a production database.
Resolution: the reviewer approves the deployment, or rejects it with reasons the operator can act on.

1. They work through the project's security material, looking for the four answers R-014 names.
2. They compare it with the deployment's actual settings: tier, boundary, redaction, identity provider, and whether the endpoint is public or private.
3. They weigh what the server enforces against what depends on the organisation (the client lock on the allow-list, request text logged as received).
4. Where they want a tighter setting (redaction on, a lower tier), they ask the operator to change it and check again.
5. They decide.

The material this journey reads describes features delivered by every other journey; it is grown with each of them (D-014), and this journey verifies the whole.

Exits:
- The material does not answer one of their questions; they reject, and the operator cannot tell what to fix.
- They will not accept that the allow-list lock rests on client tooling; they reject, or approve only the read-only tier.
- They will not accept a public endpoint with database access behind it; they approve only a private deployment (D-018), which rules out the hosted AI tools staff wanted.
- They will not accept query results passing to the AI tool's provider, outside the organisation (Q-018); they reject regardless of how well the server itself behaves.
- They need a retention period the project does not state (Q-010) or a framework it does not address (Q-011); approval stalls.

Depends on: the reviewer can see the deployment's configuration, not only the project's docs.

## J-008 — Tracing who asked for a query
Traces: R-010, R-011
Trigger: something unexpected shows up (a changed record, a question about who looked at customer data), and the operator needs to know who asked for it — often at a security reviewer's request.
Resolution: they find the audit record naming the person, the request and the SQL.

1. They search the host's logs for the time and object involved.
2. They find the record, including refused attempts.
3. They judge whether the logged request matches what the person says they asked, and report back.

Exits:
- The logged request is the agent's paraphrase and the person disputes it (Q-002); they report the trail as inconclusive and fall back on the person's own account.
- Redaction removed the values that would show which rows were touched; they turn to the database's own change history or backups to estimate the impact, or report it as unknown.
- The records have already rotated away (Q-010); they report that nothing can be found and raise retention with whoever runs the host.

Depends on: the operator's access to the host's logs; records kept long enough to be found.

## J-009 — Letting staff change data
Traces: R-007, R-008, R-017
Trigger: ops staff keep raising tickets for small record fixes and ask whether the agent could make them instead; the deployment is read-only.
Resolution: the deployment runs at the tier staff need, and nothing above it.

1. The operator works out which tier the requested changes need (write, delete, or full).
2. They check the database account's grants cover that tier, and widen them only as far as it needs.
3. They change the tier and confirm that a change allowed by the new tier works and one above it is refused.

Exits:
- They pick the highest tier to stop the requests, and later fail review (J-007).
- The organisation will not widen the database account's grants; they stay read-only, and staff stay with tickets.
- They cannot tell which tier a request needs (is "archive" a write or a delete?) and pause.

Depends on: someone who can change the database account's grants.

## Critique findings

Gate 1, 2026-10-10, critique in fresh context. Verdict: fail (1 blocker, 6 gaps).

- **blocker — R-008 is cited but no journey exercises it.** J-002's steps never show a database account with more grants than the tier; J-005's dependency points at the opposite case (D-004). The judgement R-008 answers is J-001 step 2, which does not trace it.
- **gap — J-004 lacks its most common failure:** a plausible but wrong answer the person uses without noticing.
- **gap — J-007 lacks the most common rejection reason:** result rows leaving the organisation for the AI tool's provider.
- **gap — J-002 cannot be one vertical slice.** It bundles sign-in, tier, boundary, redaction and row limit, whose effects only show in other journeys.
- **gap — J-007 cuts across every journey;** the slicing phase would make reviewer material a final docs-only slice never checked per slice.
- **gap — unstated dependencies:** J-003 (admin needs a view of names inside the boundary), J-004 (the client must relay the truncation notice), J-006 (DDL grants; client shows the allow-list message; no exit for a refused create), J-005 (target rows need a key).
- **gap — J-008 introduces "an auditor",** not one of the four people named.

Revision 2, 2026-10-10:

- R-008 → J-001 step 2 now carries the grant decision and traces R-008, with an exit for reusing an over-privileged account; J-005's first exit now shows a read-only tier holding against an account that could write; new J-009 exercises raising the tier against the account's grants. R-008 removed from J-002.
- J-004 → exit added for a plausible wrong answer used unnoticed.
- J-007 → exit added for results passing to the AI provider; Q-018 raised.
- J-002 → narrowed to sign-in. The boundary moves to deployment (J-001 step 3); the tier to new J-009; redaction to the reviewer's requests (J-007 step 4); the row limit to a J-004 dependency.
- J-007 cross-cutting → recorded that reviewer material grows with each journey's slice (D-014); J-007 verifies the whole.
- Dependencies → added to J-003 (Q-017), J-004, J-005 and J-006, with a refused-create exit in J-006.
- Auditor → removed; J-008 is the operator, often at a security reviewer's request.

Gate 2, 2026-10-10, critique in fresh context. Verdict: fail (1 blocker, 3 gaps, 3 nits). All gate-1 findings confirmed resolved.

- **blocker — J-002 has no decision point, so nothing settles who counts as staff.** All identity-provider accounts, one group, or excluding guests and contractors? Architecture would accept any authenticated account by default.
- **gap — the AI tool's ability to complete OAuth sign-in to a remote server is not a dependency** (J-002, J-004). Enterprise providers may not support what MCP clients expect (e.g. dynamic client registration).
- **gap — J-005 lacks the agent making the wrong change, noticed afterwards.** Nothing decides whether a typed update is limited to one row or reports the previous value for undo.
- **gap — J-001 resolves to a reachable server before J-002 requires sign-in;** nothing says the server refuses calls until identity settings exist, so a first slice could expose an unauthenticated server.
- **nit — J-008 exits stop at a condition, not an action.** **nit — J-005 exit 2 has no action.** **nit — "analyst" names two different people** (J-004's SQL-capable analyst vs J-006's actor).
Revision 3, 2026-10-10. Rework reached two; the router took the two product decisions to the owner (interview answers 25–26) and recorded them as D-015 and D-016, leaving the gated discovery document unchanged.

- Who counts as staff → anyone the identity provider authenticates (D-015). J-002 step 2 is now the operator's judgement on whether the provider's own membership is tight enough, with an exit for guest accounts they cannot remove.
- Client sign-in → J-002 and J-004 now depend on the AI tool completing sign-in; Q-019 raised, blocking architecture.
- Wrong change → J-005 exit added: no undo in the product (D-016); recovery by backup or hand correction using the audit record.
- Unauthenticated window → the server refuses every call until sign-in is configured (D-017); J-001's resolution and step 5 show it, and J-001 now traces R-009.
- Nits → J-008 and J-005 exits now end in an action; J-006's actor is "a member of business staff", leaving "the analyst" to mean the SQL-capable person who fields requests.
Gate 3, 2026-10-10, critique in fresh context. Verdict: hold (0 blockers, 2 gaps, 1 nit). All gate-2 findings confirmed resolved.

- **gap — nothing says the server must be reachable from the AI tool's provider.** Hosted AI tools call remote servers from the vendor's infrastructure, which needs a public endpoint; no journey has the exit where the organisation refuses to expose one. Architecture could pick a private-only topology that every hosted tool fails against.
- **gap — the default permission tier is decided by omission.** J-001 never sets a tier; J-009 assumes read-only; no D-### records a default.
- **nit — J-006's orphaned-table exit ends in an outcome, not an action.**
Hold resolved by the product owner, 2026-10-10 (interview answers 27–28):

- Reachability → public by default, private also supported (D-018). J-001 step 4 is the operator's choice, with an exit for organisations that refuse a public endpoint; J-004 depends on the AI tool reaching the server; J-007 weighs the endpoint, with a reject-public exit.
- Default tier → read-only when unset (D-019), shown in J-001 step 5; J-009's trigger now follows from it.
- Nit → J-006's orphaned-table exit now ends in what the staff member does.