## D-001 — Agent-written reads over visible objects are always available; the server does not hold semantic models
Decided by: human | Date: 2026-10-10 | Phase: discovery
Rationale: product owner, interview answer 11 ("free reads always on"). Semantic models live with the agent as skills and only improve the queries it writes. Supports R-006. Replaces this phase's first-draft assumption that free reads require a semantic model.
Alternatives rejected: server registers the semantic model and gates free reads on it; operator switch for free reads.

## D-002 — Sign-in uses OAuth, as the brief requires
Decided by: human | Date: 2026-10-10 | Phase: discovery
Rationale: the product owner's brief names "Authentication via OAuth". Discovery states the need (R-009); this records the mechanism as a constraint the architecture phase inherits rather than chooses.
Alternatives rejected: none considered; set by the product owner.

## D-003 — Agent-written reads are bounded by a row limit the operator sets on the server; no time or concurrency limits
Decided by: human | Date: 2026-10-10 | Phase: discovery
Rationale: product owner, interview answers 16 ("Row limits, configurable") and 21 (server only). Supports R-015. Replaces this phase's earlier assumption of a row limit plus a time limit.
Alternatives rejected: server maximum that a client may lower; client-set limit; time and concurrency limits (not asked for).

## D-004 — The effective permission is the stricter of the deployment setting and the database account's grants
Decided by: human | Date: 2026-10-10 | Confirmed: proposed by model, confirmed by the product owner at the discovery gate | Phase: discovery
Rationale: the server can refuse an operation the account allows, but cannot perform one the database refuses. "Override" in the brief is read as "restricts", not "elevates". Supports R-008.
Alternatives rejected: the server running with elevated credentials to grant what the configured account lacks (contradicts least privilege, and a reviewer would not sign it off).

## D-005 — Hidden objects stay hidden in error messages too
Decided by: human | Date: 2026-10-10 | Confirmed: proposed by model, confirmed by the product owner at the discovery gate | Phase: discovery
Rationale: a database error naming a hidden table or column exposes the schema just as a result would. Supports R-003.
Alternatives rejected: passing database errors through unchanged (leaks object names).

## D-006 — Audit records stay on the host, in the hosting environment's own logging
Decided by: human | Date: 2026-10-10 | Phase: discovery
Rationale: the brief says requests and queries are logged "on the cloud container where the MCP is hosted", and the owner confirmed "Log exports stay on the host" (answer 13). Discovery states the need (R-010); this records the placement as a constraint the architecture phase inherits.
Alternatives rejected: shipping records to a SIEM or external log store (owner, answer 13).

## D-007 — Literal values in logged SQL are redacted unless the operator turns redaction off
Decided by: human | Date: 2026-10-10 | Confirmed: proposed by model, confirmed by the product owner at the discovery gate | Phase: discovery
Rationale: the owner made redaction an operator setting (answer 9) but named no default. Redacting by default means an unconfigured deployment keeps copied values out of logged SQL (request text is logged as received, per answer 24), which is the posture a security reviewer (R-014) expects. Supports R-011.
Alternatives rejected: exact SQL by default (an operator who never reads the setting logs customer data).

## D-008 — On a runtime with no container, "the container" means that platform's own log facility
Decided by: human | Date: 2026-10-10 | Confirmed: proposed by model, confirmed by the product owner at the discovery gate | Phase: discovery
Rationale: the brief assumes a container; a Cloudflare deployment (R-001) may not run in one. Reading D-006 as "the hosting platform's own logs" keeps Cloudflare viable without sending records off the host. Supports R-001 and R-010.
Alternatives rejected: requiring a container runtime on Cloudflare (narrows R-001 before architecture weighs it); dropping Cloudflare log support.

## D-009 — The server treats the client allow-list as untrusted input that can only narrow its own boundary
Decided by: human | Date: 2026-10-10 | Confirmed: proposed by model, confirmed by the product owner at the discovery gate | Phase: discovery
Rationale: the owner put the allow-list in admin-managed client configuration (answers 19, 20), but the server cannot tell an admin-pushed configuration from one a user edited. Enforcing only the server boundary as a security control, and applying the client list as a further restriction, means a tampered client config can expose nothing outside what the operator allowed. Supports R-003 and R-017.
Alternatives rejected: trusting the client list as admin-authored (a user who edits it widens visibility up to the SQL account's grants).

## D-010 — A result cut short by the row limit tells the agent it was cut short
Decided by: human | Date: 2026-10-10 | Confirmed: proposed by model, confirmed by the product owner at the discovery gate | Phase: discovery
Rationale: an agent that cannot tell a truncated result from a complete one will report wrong totals and counts, which R-012 rules out. Supports R-015.
Alternatives rejected: silent truncation; refusing the query outright (conflicts with R-006).

## D-011 — The allow-list is kept in admin-managed client configuration, not on the server
Decided by: human | Date: 2026-10-10 | Phase: discovery
Rationale: product owner, interview answers 18–20 — so that new objects can be made visible without redeploying the server, with an organisation admin pushing the configuration and end users unable to edit it. Discovery states the need (R-003, R-017); this records the placement as a constraint the architecture phase inherits.
Alternatives rejected: allow-list entirely on the server (needs a redeploy to change); allow-list in each user's own client config (users could edit it); server-held allow-list editable live by an admin (offered, not chosen).

## D-012 — With no allow-list or no boundary, the agent sees nothing
Decided by: human | Date: 2026-10-10 | Confirmed: proposed by model, confirmed by the product owner at the discovery gate | Phase: discovery
Rationale: a missing allow-list (a client without admin configuration, or one a user has stripped) or an unset boundary must not widen visibility; deny by default is the posture a security reviewer (R-014) expects. Objects created in the conversation (R-016) remain visible. Supports R-003.
Alternatives rejected: a missing allow-list means the whole boundary (any unconfigured client sees everything inside it); a missing boundary means everything the database account can see.

## D-013 — A SELECT the server cannot fully check is refused; predictability outranks freedom
Decided by: human | Date: 2026-10-10 | Confirmed: proposed by model, confirmed by the product owner at the discovery gate | Phase: discovery
Rationale: the brief's "must not … result in unpredictable database queries" is a hard constraint, while the freedom to write queries is "a certain degree". So where R-004 and R-006 conflict, R-004 wins. The refusal tells the agent its query was not accepted so it can rephrase in a form the checker supports. Which constructs are supported is an architecture decision. Supports R-004 and R-006.
Alternatives rejected: accept any syntactically valid SELECT and rely on the database account's grants (fails R-003 and R-004 whenever the checker cannot see which objects a query touches).

## D-014 — Reviewer material is written alongside each feature, not at the end
Decided by: human | Date: 2026-10-10 | Confirmed: proposed by model, confirmed by the product owner at the PRD gate, 2026-10-11 | Phase: journeys
Rationale: J-007 reads material describing every other journey's features. Writing it as one final documentation piece means it is never checked against R-014 while the features are fresh. Each slice adds its own section; J-007 verifies the whole. Supports R-014.
Alternatives rejected: a single documentation slice after all features ship.
## D-015 — Anyone the organisation's identity provider authenticates may call the server
Decided by: human | Date: 2026-10-10 | Phase: journeys
Rationale: product owner, interview answer 25 ("every account in the provider"), including guest and external accounts. Who can sign in is therefore governed in the identity provider, not in the server. Supports R-009; settles who counts as staff in J-002.
Alternatives rejected: operator-chosen groups; member accounts only, guests refused.

## D-016 — No safeguard against a wrong change beyond the permission tier
Decided by: human | Date: 2026-10-10 | Phase: journeys
Rationale: product owner, interview answer 26. Typed write and delete tools are not limited to one row and do not report previous values; recovery is the organisation's own backups and the audit record (R-010). Supports R-005, R-007; settles J-005's wrong-change exit.
Alternatives rejected: one row per update/delete; reporting the previous value for undo.

## D-017 — The server refuses every call until sign-in is configured
Decided by: human | Date: 2026-10-10 | Confirmed: proposed by model, confirmed by the product owner at the PRD gate, 2026-10-11 | Phase: journeys
Rationale: J-001 ends with a reachable server connected to a real database before J-002 sets up sign-in. R-009 forbids any tool running for a caller who has not signed in, so the gap between the two must be closed by refusal, not by trust. Same deny-by-default posture as D-012. Supports R-009.
Alternatives rejected: serve unauthenticated until configured (fails R-009 and exposes the database during setup).
## D-018 — Deployments are public by default; private-network deployments are also supported
Decided by: human | Date: 2026-10-10 | Phase: journeys
Rationale: product owner, interview answer 27. Hosted AI tools call the server from their vendor's infrastructure, which needs a public HTTPS endpoint protected by sign-in; organisations that will not expose one can deploy privately for clients inside their own network, accepting that hosted tools cannot reach it. Supports R-001, R-009, R-014.
Alternatives rejected: public only (excludes organisations that refuse a public endpoint); private only (excludes every hosted AI tool).

## D-019 — A deployment with no tier set runs read-only
Decided by: human | Date: 2026-10-10 | Phase: journeys
Rationale: product owner, interview answer 28. Matches the deny-by-default posture of D-012 and D-017; the operator raises the tier deliberately (J-009). Supports R-007, R-008.
Alternatives rejected: refusing to start until a tier is set (one more step inside the one-hour deploy, R-013).
## D-020 — If MS SQL Server cannot run on Cloudflare, that combination is dropped
Decided by: human | Date: 2026-10-10 | Phase: domain
Rationale: product owner, interview answer 29, answering Q-001. Architecture establishes whether MS SQL Server works on Cloudflare; if not, Cloudflare is supported for PostgreSQL only and MS SQL Server on AWS and Azure. Narrows R-001 and R-002 for that one combination; every other cloud and engine pairing stands.
Alternatives rejected: dropping Cloudflare entirely; requiring every engine on every cloud regardless of cost.
## D-021 — "The natural-language request" is split into Question and Request text
Decided by: human | Date: 2026-10-10 | Confirmed: proposed by model, confirmed by the product owner at the PRD gate, 2026-10-11 | Phase: domain
Rationale: discovery uses one phrase for what the Staff member typed and for what the Server logs, but the Server only ever sees the Agent's account of the question (Q-002). Building one field for both would let the audit record claim to hold the Staff member's own words. Supports R-010, R-011.
Alternatives rejected: one term "natural-language request" for both (conflates an unverifiable paraphrase with the original).

## D-022 — The person asking is named Staff member, though it includes guest accounts
Decided by: human | Date: 2026-10-10 | Confirmed: proposed by model, confirmed by the product owner at the PRD gate, 2026-10-11 | Phase: domain
Rationale: discovery and journeys say "business staff" and "staff member" throughout; D-015 admits any account the Identity provider authenticates. Keeping the upstream word, with the definition saying it names a role and not employment, avoids renaming every upstream reference. Supports R-009, R-012.
Alternatives rejected: "user" (also used for operators, admins and the Database account); a new coinage such as "asker" (appears nowhere upstream).

## D-023 — "Visible object" wins over "allowed object"
Decided by: human | Date: 2026-10-10 | Confirmed: proposed by model, confirmed by the product owner at the PRD gate, 2026-10-11 | Phase: domain
Rationale: discovery uses both. "Allowed" suggests only the Allow-list decides, but visibility also needs the Boundary and includes Created objects; "visible" names the outcome, not one of its inputs. Supports R-003, R-016.
Alternatives rejected: "allowed object" (conflates the Allow-list with the whole rule).
## D-024 — A Sign-in lasts as long as the Identity provider says
Decided by: human | Date: 2026-10-10 | Phase: domain
Rationale: product owner, interview answer 30. The Server sets no lifetime of its own; a Staff member removed in the Identity provider keeps access until what the provider issued expires. Consistent with D-015 (who may sign in is governed in the provider). Supports R-009.
Alternatives rejected: Server-imposed lifetime of about an hour; minutes-level revocation.

## D-025 — A resumed chat is the same Conversation
Decided by: human | Date: 2026-10-10 | Phase: domain
Rationale: product owner, interview answer 31. Created objects stay visible in a chat for as long as the chat exists, including when it is reopened later. Depends on the AI tool identifying the chat to the Server (Q-014). Supports R-016.
Alternatives rejected: visibility only for the live connection.

## D-026 — Server statements are not logged as a Tool call's Statements
Decided by: human | Date: 2026-10-10 | Confirmed: proposed by model, confirmed by the product owner at the PRD gate, 2026-10-11 | Phase: domain
Rationale: catalog lookups the Server makes to run a Query check or a Typed tool are its own work, not SQL requested on a Staff member's behalf; logging them as the Tool call's SQL would bury what the Staff member's request actually ran. Supports R-004, R-010.
Alternatives rejected: logging every Statement the Server issues during a Tool call in its Audit record.
## D-027 — A call refused for lack of Sign-in is still a Tool call, logged as "not signed in"
Decided by: human | Date: 2026-10-10 | Rejected: proposed by model, rejected by the product owner at the PRD gate, 2026-10-11; superseded by D-044 | Phase: domain
Rationale: R-010 requires every request, run or refused, to leave an audit record, and D-017 refuses every call until Sign-in is configured. Treating unsigned calls as outside "Tool call" would leave those attempts unlogged by omission; recording them with no Staff member and an explicit mark keeps the audit complete. Supports R-009, R-010.
Alternatives rejected: unsigned calls are not Tool calls and go unlogged; attributing them to a placeholder Staff member (would read as a real person in the audit).

## D-028 — Typed tool inputs in an Audit record follow the Redaction setting
Decided by: human | Date: 2026-10-10 | Confirmed: proposed by model, confirmed by the product owner at the PRD gate, 2026-10-11 | Phase: domain
Rationale: the values a Typed tool is given are the same values that would appear as literals in the Statement it builds; logging them plainly while redacting the Statement would defeat Redaction (R-011). The tool name is always kept, so a refused attempt can still be traced (J-008). Supports R-010, R-011.
Alternatives rejected: logging tool inputs unredacted (leaks what Redaction hides); omitting tool inputs (refused attempts become untraceable).

## D-029 — Proposal for the retro: raise the rework stop from two failures to three
Decided by: human | Date: 2026-10-10 | Phase: router
Rationale: the product owner, after the domain model's second failure: "note for the retro to increase the 2-failure rule to 3 in the ai-sdlc framework." In this iteration discovery, journeys and the domain model each hit two failures, and in the last case both blockers were contradictions introduced by the phase's own revision, not upstream faults. The retro should record it, and improve should propose the change to the ai-sdlc router skill, the gates reference and sdlc_lint.py's rework threshold as a reviewable diff. The owner's direction stands in for the usual two-iteration recurrence requirement.
Alternatives rejected: none considered; directed by the product owner.

## D-030 — The full tier's schema changes are limited to creating a table this iteration
Decided by: human | Date: 2026-10-10 | Confirmed: proposed by model, confirmed by the product owner at the PRD gate, 2026-10-11 | Phase: prd
Rationale: answers Q-008. R-016 and J-006 need only a create; altering, dropping and indexing each add a way to destroy or lock data, which no journey asks for and no first-release condition (answer 7) needs. R-007's ordered tiers stay intact, since the full tier still adds schema changes. Supports R-005, R-007, R-016.
Alternatives rejected: create, alter, drop and index at first release (more surface for no journey); no full tier this iteration (drops R-016 and part of the brief's "Configurable support for DDL").

## D-031 — Creating an Object outside the Boundary is a Refusal
Decided by: human | Date: 2026-10-10 | Confirmed: proposed by model, confirmed by the product owner at the PRD gate, 2026-10-11 | Phase: prd
Rationale: answers Q-013. An Object created outside the Boundary could never be added to an Allow-list (D-009), so it would be orphaned when the Conversation ends; refusing keeps every Created object reachable and matches the deny-by-default posture of D-012. Supports R-003, R-016.
Alternatives rejected: allow it and let it be visible for the Conversation only (guaranteed orphan, J-006 exit).

## D-032 — The Server holds no approval step before a write, delete or create
Decided by: human | Date: 2026-10-10 | Confirmed: proposed by model, confirmed by the product owner at the PRD gate, 2026-10-11 | Phase: prd
Rationale: answers Q-016. Whether the Staff member confirms a change is the AI tool's behaviour, and the Server cannot tell a confirmed Tool call from an unconfirmed one. Consistent with D-016. The Security material says so. Supports R-005, R-014.
Alternatives rejected: a two-step propose-then-confirm Typed tool (the Agent can make both calls itself, so it confirms nothing).

## D-033 — The project gives the Organisation admin no view of names inside the Boundary
Decided by: human | Date: 2026-10-10 | Confirmed: proposed by model, confirmed by the product owner at the PRD gate, 2026-10-11 | Phase: prd
Rationale: answers Q-017. Any such view is a second path that lists Objects, which is what R-003 guards; the admin's own database tools, or the Operator, already have one. Accepts J-003's guessed-names exit. Supports R-003, R-017.
Alternatives rejected: a Typed tool or page listing every Object inside the Boundary (an Agent or Staff member reaching it would see Hidden objects).

## D-034 — No Semantic models ship with the project, and the Server does not check them against the Allow-list
Decided by: human | Date: 2026-10-10 | Confirmed: proposed by model, confirmed by the product owner at the PRD gate, 2026-10-11 | Phase: prd
Rationale: answers Q-004 and Q-005. A Semantic model describes one organisation's Database, so a shipped one fits nobody; D-001 already puts it on the Agent's side, where the Server cannot see it. Each organisation writes its own. Supports R-006, R-013.
Alternatives rejected: shipping example Semantic models (fit no real Database); a check that warns when a Semantic model names a Hidden object (the Server never receives the model).

## D-035 — Objects are tables and their columns only; views and functions are out this iteration
Decided by: human | Date: 2026-10-10 | Confirmed: proposed by model, confirmed by the product owner at the PRD gate, 2026-10-11 | Phase: prd
Rationale: answers Q-020. A view can read tables outside the Boundary, so admitting views means the Query check must reason about what each view reads, widening R-004's risk before architecture has weighed it. Reporting databases that rely on views lose out until a later iteration. Supports R-003, R-004.
Alternatives rejected: views as readable Objects when on the Allow-list (exposes Hidden objects through the view's definition unless the Server analyses it).

## D-036 — Results reaching the AI provider are disclosed, not mitigated
Decided by: human | Date: 2026-10-10 | Confirmed: proposed by model, confirmed by the product owner at the PRD gate, 2026-10-11 | Phase: prd
Rationale: answers Q-018. What happens to a result once the AI tool receives it is outside anything the Server controls; the Row limit and the Allow-list already bound what it can return. The Security material states it plainly so a Security reviewer can reject on it knowingly (J-007 exit). Supports R-014.
Alternatives rejected: masking values in results (breaks R-012); refusing to serve hosted AI tools (contradicts D-018).

## D-037 — Correctness is measured on a project-maintained benchmark, 90% target, with one named AI tool and model per release
Decided by: human | Date: 2026-10-10 | Confirmed: proposed by model, confirmed by the product owner at the PRD gate, 2026-10-11 | Phase: prd
Rationale: answers Q-003 and Q-012. The project maintains typical business questions with expected answers over a sample Database for each Engine; each release runs them with one AI tool and model named in the run report, and no Semantic model, so the figure reflects the Server rather than an organisation's skill. 90% is the model's proposed bar; the product owner sets the final figure. Supports R-012.
Alternatives rejected: each adopting organisation supplies its own question set (no release-to-release figure); measuring with every target AI tool (differences measure the tool, not the Server).

## D-038 — No stored procedures or user-defined functions are called; the Engine's built-in functions stay available to Agent-written queries
Decided by: human | Date: 2026-10-10 | Confirmed: proposed by model, confirmed by the product owner at the PRD gate, 2026-10-11 | Phase: prd
Rationale: a procedure or user-defined function runs SQL the Query check cannot see, so it can write or read Hidden objects behind R-003 and R-004. Built-in functions (aggregates, date and string functions) touch no Object and are needed for typical questions (R-012). Supports R-004, R-006, R-012.
Alternatives rejected: allow procedures and functions on the Allow-list (their bodies escape the Query check); ban all functions (fails J-004 and the benchmark).

## D-039 — If the Server cannot tell Conversations apart, R-016 moves to the next iteration
Decided by: human | Date: 2026-10-10 | Confirmed: proposed by model, confirmed by the product owner at the PRD gate, 2026-10-11 | Phase: prd
Rationale: R-016 has a "visible in no other Conversation" test that cannot be met without a reliable Conversation boundary (Q-014). Shipping it with a guessed boundary would leak Created objects across Conversations or lose them mid-task (J-006 exits). Deferring the slice keeps every other tier intact; the full tier would then offer no create until it ships. Supports R-016, R-007.
Alternatives rejected: ship R-016 with the connection as the Conversation (fails D-025 and R-016's test); drop the full tier entirely (loses D-030's scope for an unrelated reason).

## D-040 — AI tools that cannot carry an Allow-list in Managed client configuration are unsupported
Decided by: human | Date: 2026-10-10 | Confirmed: proposed by model, confirmed by the product owner at the PRD gate, 2026-10-11 | Phase: prd
Rationale: under D-012 such a tool's Agent sees nothing, so it could never answer a Question; claiming support would fail J-003 and J-004 for it. The Security material and docs name which target AI tools are supported once architecture settles Q-015. Supports R-003, R-014, R-017.
Alternatives rejected: a Server-held fallback Allow-list for such tools (reverses D-011).

## D-041 — Private Deployments are supported on every supported cloud and trialled once per cloud
Decided by: human | Date: 2026-10-10 | Confirmed: proposed by model, confirmed by the product owner at the PRD gate, 2026-10-11 | Phase: prd
Rationale: D-018 supports private Deployments without limiting the clouds. A private Deployment differs from a public one in network setup, not in Engine, so one timed trial per cloud tests the docs for R-013 without multiplying trials by Engine. Supports R-001, R-013, D-018.
Alternatives rejected: private Deployments on one cloud only (narrows D-018 with no reason recorded); a trial for every cloud, Engine and network combination (cost with no extra coverage of the docs).

## D-042 — A benchmark question still refused after three Agent-written queries counts as given up
Decided by: human | Date: 2026-10-11 | Phase: prd
Rationale: product owner, at the PRD hold, choosing three. Gives J-004's "a few rephrasings" a fixed count so the give-up metric compares across releases. Supports R-006, R-012.
Alternatives rejected: two (stricter); five (more lenient).

## D-043 — This release supports Claude and ChatGPT; other AI tools are deferred
Decided by: human | Date: 2026-10-11 | Phase: prd
Rationale: product owner, at the PRD hold: "Claude and ChatGPT, adding to the README and deferred functionality that support for other agents is planned for later." Both must complete Sign-in and carry an Allow-list for a release to ship. Copilot and any other AI tool are deferred, and the README says support is planned. Narrows interview answer 2's list for this iteration. Supports R-009, R-012, R-014, R-017.
Alternatives rejected: any one target AI tool, named per release; all three of Claude, ChatGPT and Copilot; Claude only.

## D-044 — A call with no Sign-in is blocked and not logged; supersedes D-027
Decided by: human | Date: 2026-10-11 | Phase: prd
Rationale: product owner, at the PRD gate: "calls with no sign-in should simply be blocked and not logged. That should help with DDS-style attacks. We don't need to bloat the logs with unauthenticated sessions. Simply tell the user the MCP connection has not been authenticated." The Deployment refuses the call before it becomes a Tool call, writes no Audit record, and replies only that the connection is not authenticated. R-010 is read as covering requests made by a signed-in person, since its test matches each record to the person who made it. Supports R-009, R-010, D-017.
Alternatives rejected: D-027's logging of unsigned calls with a "not signed in" mark (an unauthenticated caller can fill the Host's logs at will).
Supersedes: D-027.

## D-045 — The correctness target is 90%
Decided by: human | Date: 2026-10-11 | Phase: prd
Rationale: product owner, at the PRD gate, confirming D-037's proposed bar. Supports R-012.
Alternatives rejected: 95%; 80%.

## D-046 — The design phase is skipped this iteration
Decided by: human | Date: 2026-10-11 | Phase: router
Rationale: product owner: "Skip design." The PRD's non-goals rule out any user interface of the Server's own, so there are no screens to design. The wording of messages the Agent receives (Refusals, Cut-short results, the not-authenticated reply of D-044, the Created object notice) is left to system spec and slice-spec. No design artifact exists; later phases that list designs as an input are told so, and must not assume one. The owner also accepted the PRD's open risks (D-043 resting on Q-015 and Q-019; the benchmark resting on the Query check's supported SQL), to iterate on later.
Alternatives rejected: running design for the docs, the Security material and the Agent-facing messages.

## D-047 — The walking skeleton runs PostgreSQL on Cloudflare
Decided by: human | Date: 2026-10-11 | Phase: architecture
Rationale: product owner: "Postgres on Cloudflare". It is also the first Deployment the PRD's sequencing step 1 builds on. Supports R-001, R-002.
Alternatives rejected: MS SQL Server or AWS/Azure first (not chosen).

## D-048 — Architecture's answers to six open questions, pending confirmation
Decided by: model | Date: 2026-10-11 | Phase: architecture
Rationale: the architecture ADRs answer six questions, and the human gate should see each one.
- Q-002: the Agent's `request_text` is accepted as the Request text, and the Security material discloses that it cannot be verified (ADR-011).
- Q-006: any OpenID Connect provider with discovery is supported, and Entra ID and Google are tested at release (ADR-004).
- Q-009: one Database per Deployment (ADR-012).
- Q-014: a signed Conversation token that the Agent carries (ADR-007), so D-039 is not triggered.
- Q-015: the Allow-list travels in the connector URL path (ADR-006).
- Q-019: the Server brokers sign-in through Client ID Metadata Documents or stateless registration (ADR-004).
Q-015 and Q-019 stay open until a live connection from Claude and ChatGPT proves them (skeleton.md). Supports R-002, R-003, R-009, R-010, R-016, R-017.
Alternatives rejected: as listed in each ADR.