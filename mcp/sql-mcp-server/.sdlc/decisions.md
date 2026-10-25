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
Decided by: human (confirmed 2026-10-17 at the architecture gate) | Date: 2026-10-11 | Phase: architecture
Rationale: the architecture ADRs answer six questions, and the human gate should see each one.
- Q-002: the Agent's `request_text` is accepted as the Request text, and the Security material discloses that it cannot be verified (ADR-011).
- Q-006: any OpenID Connect provider with discovery is supported, and Entra ID and Google are tested at release (ADR-004).
- Q-009: one Database per Deployment (ADR-012).
- Q-014: a signed Conversation token that the Agent carries (ADR-007), so D-039 is not triggered.
- Q-015: the Allow-list travels in the connector URL path (ADR-006).
- Q-019: the Server brokers sign-in through Client ID Metadata Documents or stateless registration (ADR-004).
Q-015 and Q-019 stay open until a live connection from Claude and ChatGPT proves them (skeleton.md). Supports R-002, R-003, R-009, R-010, R-016, R-017.
Alternatives rejected: as listed in each ADR.

## D-049 — The walking skeleton runs against a borrowed Supabase project
Decided by: human | Date: 2026-10-17 | Phase: architecture
Rationale: the skeleton needs a PostgreSQL that Hyperdrive can reach, and the product has no Database of its own yet. The product owner chose to restore the paused "AI Golf App" Supabase project (`dwsikgvekndbmowzdcnx`, us-east-2) as a throwaway test Database. Hyperdrive config `eb6eadef54d546ae84c12c419a4c2d9f` points at its session pooler (port 5432), because the direct host is IPv6-only.
Alternatives rejected: a new dedicated Supabase project (free-tier project limit and possible cost); the active "Gruvd Golf" project (a live app's Database).
Consequence: the skeleton's Database belongs to another product. Before any slice writes Created objects or runs real Tool calls, the Deployment needs a Database of its own.

## D-050 — Four data-model entities exist only to serve stateless OAuth
Decided by: human (confirmed 2026-10-18 at the system-spec gate) | Date: 2026-10-18 | Phase: system-spec
Rationale: Refresh token, Client registration, Authorization request and Authorization code are not domain terms. They are the values an OAuth authorization server needs, made self-contained because ADR-004 allows no store. No product concept is missing from the domain model.
Alternatives rejected: adding them as domain terms. Staff members, Operators and reviewers never meet them as concepts, and the Security material names them only as OAuth mechanics.

## D-051 — Without a store, some OAuth values cannot be revoked or used just once
Decided by: human (confirmed 2026-10-18 at the system-spec gate) | Date: 2026-10-18 | Phase: system-spec
Rationale: follows from ADR-004. An Authorization code can be replayed within its 60 seconds, but only by whoever also holds the PKCE verifier. Refresh tokens are not rotated on use and last at most 30 days, and each use goes back to the Identity provider, which refuses a removed account. Dynamic Client registrations never expire. All three stop working when `SERVER_SECRET` rotates.
Alternatives rejected: a replay cache or token denylist. Either needs a store per cloud, which ADR-004 rejected.

## D-052 — Audit record retention is the Operator's own policy; answers Q-010
Decided by: human | Date: 2026-10-18 | Phase: system-spec
Rationale: product owner's answer at system-spec. The Server sets no retention period and no default. Each Operator applies their organisation's policy in the Host log facility. The AWS and Azure templates require it as a parameter with no default, and on Cloudflare the Security material states Workers Logs' fixed window.
Alternatives rejected: no minimum but a 90-day template default (it hides the choice); a fixed minimum period everywhere (Cloudflare cannot meet it on the Host without revisiting D-006).

## D-053 — A broken connector URL or invalid tool input ends in a Refusal of its own class
Decided by: human (confirmed 2026-10-18 at the system-spec gate) | Date: 2026-10-18 | Phase: system-spec
Rationale: R-010 says every Tool call, run or refused, leaves an Audit record. So a call whose Allow-list segment cannot be decoded, or whose inputs breach a limit, is a Refusal (`invalid_allow_list`, `invalid_input`) and not a bare protocol error that leaves no trace. Telling the Agent the connector URL is invalid lets an Organisation admin find a broken URL from the first call, rather than having every Staff member see nothing.
Alternatives rejected: treating a broken Allow-list as no Allow-list (D-012). It fails silently, and J-003 cannot tell a typo from an empty list.

## D-054 — SERVER_SECRET, SERVER_SECRET_PREVIOUS, PUBLIC_URL and PORT are deployment configuration, not Server settings
Decided by: human (confirmed 2026-10-18 at the system-spec gate) | Date: 2026-10-18 | Phase: system-spec
Rationale: the Operator owns them, as R-017 requires, but none of them changes what a Staff member can see or run, so the domain's Server setting list stays as it is.
Alternatives rejected: listing them as Server settings. That widens a gated domain term for plumbing.

## D-055 — The Security material follows R-014's four questions and maps to no external framework; answers Q-011
Decided by: human | Date: 2026-10-18 | Phase: system-spec
Rationale: product owner's answer at system-spec. No framework is named by any adopting organisation, and a mapping claimed without an assessment invites the wrong kind of trust.
Alternatives rejected: a cross-reference to SOC 2 / ISO 27001 control areas; a cross-reference to the OWASP LLM and MCP guidance.

## D-056 — The Host platform's own request logs hold connector URLs, Allow-list included
Decided by: human (confirmed 2026-10-18 at the system-spec gate) | Date: 2026-10-18 | Phase: system-spec
Rationale: Workers Logs, and load-balancer logs on AWS and Azure, record request URLs outside the Server's control, including for blocked calls that D-044 says leave no Audit record. The Allow-list names Objects but grants nothing (ADR-006). Accepted and disclosed in the Security material.
Alternatives rejected: moving the Allow-list out of the URL. ADR-006 rejected every other channel.

## D-057 — The Server applies no rate limit this iteration
Decided by: human (confirmed 2026-10-18 at the system-spec gate) | Date: 2026-10-18 | Phase: system-spec
Rationale: unauthenticated calls, `/register` and metadata fetches store nothing and reach no Database, so a flood costs compute but exposes nothing. The platform's own protection (Cloudflare, AWS WAF, Azure Front Door) is the Operator's option, and the Deployment kit names it.
Alternatives rejected: an in-process limiter. It is per isolate or task, so it gives no real bound without a shared store.

## D-058 — The system spec's defaults and limits are model-chosen numbers
Decided by: human (confirmed 2026-10-18 at the system-spec gate) | Date: 2026-10-18 | Phase: system-spec
Rationale: the numbers in data-model.md, operations.md and security.md were picked to be testable and none rests on a measurement yet: Row limit default 500 (max 10,000), the 5 s and 3 s fetch time limits, the Allow-list caps, 50 Created objects per Conversation token, the 24-hour Sign-in cap, the 30-day Refresh token, the 10-minute Authorization request, the 60-second Authorization code, 1–5 `redirect_uris` and 100-character `client_name` per Client registration, the monitoring thresholds, and the volume and latency targets. The release test harness and the first Operator Deployments are expected to revise them.
Alternatives rejected: leaving them to each slice. Every slice would choose differently.

## D-059 — The clean-checkout setup is first run by the Sign-in slice
Decided by: human (confirmed 2026-10-18 at the system-spec gate) | Date: 2026-10-18 | Phase: system-spec
Rationale: environments.md gives the clean-checkout sequence, but nobody has run it, and `.dev.vars.example` does not exist yet. The Sign-in slice (PRD sequencing step 2) is the first to need `SERVER_SECRET` and the `IDP_*` variables. Its done-condition therefore includes adding `.dev.vars.example` with every variable from environments.md, secrets blank, and one run of the local sequence from a fresh clone, with any step that fails fixed in environments.md.
Alternatives rejected: running it now. Half the variables it needs have no code reading them yet, so the run would prove only the skeleton's steps, which the architecture phase already ran.

## D-060 — The AI Golf App Supabase project stays the test Database for the project test Deployment and other tests; answers Q-021
Decided by: human | Date: 2026-10-18 | Phase: system-spec
Rationale: product owner's answer to Q-021. The borrowed project from D-049 serves the deployment and every other test that needs a reachable PostgreSQL, including Tool calls, Created objects and the benchmark's sample Database. This lifts D-049's "a Database of its own before real Tool calls" consequence.
Alternatives rejected: a new dedicated Supabase project; another host; Docker on a reachable machine.
Consequence: tests write tables and rows into a project named for another product, so test objects should live in their own schema (for example `sqlmcp_test`), which the Boundary for the project test Deployment names. Anything else in that project is outside the Boundary and stays hidden (D-012). If the AI Golf App product is revived, the test schema has to move.

## D-061 — Sign-in ships alone; the Audit record arrives with the first Tool call
Decided by: human (confirmed 2026-10-18 at the slices gate) | Date: 2026-10-18 | Phase: slices
Rationale: PRD sequencing step 2 pairs Sign-in with the Audit record so that no Tool call ever runs unrecorded. S-001 offers no tools, so it has no Tool call to record. The Audit logger ships in S-002 with the first Tool call, the visibility listing, and step 2's condition still holds. Splitting them lets Sign-in, the riskiest integration (Q-019), go live and be proven from Claude and ChatGPT on its own. Visibility (step 3) also ships before any row is read, in S-002, ahead of reads in S-003.
Alternatives rejected: one slice for Sign-in, Audit record and visibility, which bundles two live unknowns (Q-019 and Q-015) into one deployment; an Audit logger in S-001 with nothing to log, which can't be shown to work.

## D-062 — The benchmark, each cloud, MS SQL Server and private Deployments are separate slices
Decided by: human (confirmed 2026-10-18 at the slices gate) | Date: 2026-10-18 | Phase: slices
Rationale: PRD step 5 is too large to deploy as one piece. Each cloud, the second Engine, and the private variant has its own deployment definition and its own trial (ADR-009), and can be shown to work on its own. The benchmark (S-004) is split from S-003 so the first usable read ships without waiting for the question set. The order is Cloudflare, then AWS, then Azure, because the container image is built once in S-006 and reused in S-007. MS SQL Server waits for the containers, because ADR-008 runs it there first.
Alternatives rejected: one step-5 slice (nothing deployable until all three clouds work); MS SQL Server before the containers (it has no runtime to run on until S-006).
Superseded in part by D-063: AWS is deferred, so the cloud order in this rationale no longer applies.

## D-063 — This release supports two pairings: PostgreSQL on Supabase served from Cloudflare, and MS SQL Server served from Azure; AWS is deferred; answers Q-001
Decided by: human | Date: 2026-10-18 | Phase: slices
Rationale: product owner's direction at the slices gate. The release supports exactly two pairings:
- PostgreSQL: the Server runs as a Cloudflare Worker, and the Database is hosted on Supabase, reached through Hyperdrive. Other PostgreSQL hosts are not supported or documented this iteration.
- MS SQL Server: the Server runs as a container on Azure Container Apps, and the Database is Azure SQL Database or SQL Server reachable from Azure.

Private Deployments are supported on both: Cloudflare behind Access, and Azure behind an internal ingress. This narrows D-041 to these two clouds. MS SQL Server on Cloudflare and PostgreSQL on Azure are not offered, so ADR-008's open `tedious`-on-Workers question is moot, and D-020 never has to be invoked. This answers Q-001.
Alternatives rejected: all three clouds with both Engines, the PRD's original scope; Azure alone for both Engines; PostgreSQL on Supabase from both Cloudflare and Azure; any PostgreSQL host with Supabase as the tested example.
Consequence: R-001's AWS part is deferred to a later iteration. The README says AWS is planned. The container image serves MS SQL Server only, and the Worker serves PostgreSQL only, so the Engine adapters carry one driver per runtime. An organisation whose PostgreSQL is not on Supabase, or whose MS SQL Server is not reachable from Azure, is unsupported this iteration. The Deployment kit is a Wrangler config and a Bicep template, each with a public and a private variant. Amends the PRD's scope (Scope and the deployment-time metric), ADR-002, ADR-008, ADR-009 and ADR-013, the overview, the components, the skeleton record and the system spec. Each amended artifact notes the change.

## D-064 — Private Deployments are deferred; this release is public Deployments only
Decided by: human | Date: 2026-10-18 | Phase: slices
Rationale: product owner's decision after the D-063 consistency critique. The intended use is a public Deployment that Claude and ChatGPT reach as a connector, the way vendor MCP servers are reached. Claude's and ChatGPT's connectors call from the vendors' own infrastructure, so they cannot reach a Deployment that only the organisation's network can reach. The only clients that could reach one connect from the Staff member's own machine, such as Claude Code or a local Claude Desktop configuration, and ChatGPT offers none. Narrows D-018 and D-041 for this iteration.
Alternatives rejected: private Deployments for local clients only (Claude Code, local Claude Desktop config), which leaves ChatGPT unsupported; an open question for the slice specs to settle.
Consequence: the PRD's private trial metric is dropped, and the Deployment kit has a public variant only. An organisation that will not expose any endpoint to the internet is unsupported this iteration, and the Security material says so.

## D-065 — The product owner provides an Azure subscription and an Azure SQL Database for MS SQL Server testing
Decided by: human | Date: 2026-10-18 | Phase: slices
Rationale: product owner's answer at the D-063 consistency critique. The MS SQL Server slices need an Azure subscription to deploy to and an Azure SQL Database to test against, including the benchmark's sample Database. As with D-060, test objects live in a `sqlmcp_test` schema, which is the only schema in that Deployment's Boundary. Integration tests also run against MS SQL Server 2022 in Docker (ADR-010).
Alternatives rejected: Docker only, deciding the Azure environment when S-006 is specified.
Consequence: S-006 cannot deploy until the subscription and database exist (Q-022).

## D-066 — The MS SQL Server Deployment is split into two slices
Decided by: human | Date: 2026-10-18 | Phase: slices
Rationale: product owner's answer at the D-063 consistency critique. A single slice would carry the first container image, the Node runtime adapter, Bicep and Key Vault, Sign-in on Node, MS SQL Server visibility, the T-SQL Query check and T-SQL Redaction all together. The first of the two slices delivers sign-in and the table listing on Azure. The second adds answering questions. Each can be deployed and shown to work on its own.
Alternatives rejected: one slice accepted as large and irreducible, with verification staged by task.

## D-067 — The Security material lives in docs/security-material/, one file per section
Decided by: human | Date: 2026-10-18 | Phase: slice-spec (S-001)
Rationale: D-014 has each slice write its own part of the Security material, and the components define the material without giving it a home. One Markdown file per section, starting with `sign-in.md`, lets each slice add its own file without editing another's. S-009's reviewer walkthrough reads the folder as a whole.
Alternatives rejected: a single SECURITY.md at the repository root, which every slice would edit and conflict over; a documentation site, which is one more thing to deploy before a reviewer can read anything.

## D-068 — Operational log lines share one envelope
Decided by: human | Date: 2026-10-19 | Phase: slice-spec (S-001)
Rationale: operations.md alerts on operational events, so every slice and both runtimes must write them alike. Each line is one JSON object on standard output, with `"type":"op"`, an `event` in snake_case, `ts` in RFC 3339 UTC, and then only that event's own fields. The fields name things (a variable, an issuer, a host, an endpoint, a reason) and never carry values, tokens or URLs with paths or queries (security.md). A slice that adds an event documents its shape in its own spec. Events so far: `startup`, `config_invalid` (`variable`), `idp_unreachable` (`issuer`, `endpoint`, `ms`), and `cimd_fetch_failed` (`host`, `reason`).
Alternatives rejected: free-text log lines, which the alerts cannot match reliably; deciding the shape per slice, which lets S-002 and S-006 drift from S-001.

## D-069 — With Google as the Identity provider, the Server asks for offline access by request parameter
Decided by: human | Date: 2026-10-19 | Phase: slice-spec (S-001)
Rationale: Google issues refresh tokens only when the authorization request carries `access_type=offline`, with `prompt=consent` to get one on every sign-in. It ignores the `offline_access` scope that environments.md defaults to. Without these parameters a Google Sign-in could never be renewed (D-024). The parameters are sent only when `IDP_ISSUER` is `https://accounts.google.com`.
Alternatives rejected: an Operator setting for extra authorization parameters, which is one more variable for a single provider's quirk; sending the parameters to every provider, which some reject.

## D-070 — Small choices made while building S-001
Decided by: human (confirmed 2026-10-20 at the S-001 verification gate) | Date: 2026-10-19 | Phase: build (S-001)
Rationale: the spec left these open, and each follows from it without changing behaviour a Staff member sees:
- Each token carries its kind in the JOSE protected header (`typ: sqlmcp-<kind>`), so an Authorization code, a Refresh token or an Authorization request can never be presented as a Sign-in. data-model.md's payload fields are unchanged.
- `/authorize` requires `resource`. Without it a Sign-in would have no audience to bind to, so its absence is refused like any other bad request, with `error=invalid_request`.
- `cimd_fetch_failed` has one more `reason` than D-068 listed: `invalid_document`, for a document that is not JSON or has no usable `redirect_uris`.
- `/token` answers `invalid_client` (401) for an unknown client_id, and `temporarily_unavailable` (503) when the Identity provider does not answer a refresh.
- The Worker creates the app once per isolate instead of per request, so the Identity provider's discovery and keys are actually cached as security.md requires.
- Only `jose` is used for OAuth and JOSE. The overview's `oauth4webapi` was not needed: the broker makes three plain requests to the provider.
- A Client registration also carries a random `jti`. Without it, two registrations with the same redirect URIs and name in the same second would get byte-identical client_ids.
- With no Tool registered yet, `tools/list` answers an empty list rather than "method not found", so Claude and ChatGPT show the connector as connected. S-002 replaces this handler with its first Tool.
- Recording failures: `mcp_401_when_idp_unset` and `blocked_call_writes_no_log_line` guard behaviour the walking skeleton already had, so they passed on first run. They were recorded failing against a deliberate break of the skeleton (401 → 403, plus a log line on block), which was then reverted. Four tests were edited after their first record: three only to wait for fake timers to be armed, and one for a type error. Each was re-recorded failing against a deliberate break (the 5 s limit raised to 7 s, `HttpOnly` dropped), then the code was restored.

Added after the S-001 code review (docs/slices/S-001/review.md):
- Status codes: a misconfigured `PUBLIC_URL`, `IDP_ISSUER` or secret makes every sign-in and MCP path answer 503, because no request can be answered correctly without them. The provider-did-not-answer page is 502. `/token` answers 401 `invalid_client`, 400 `unsupported_grant_type`, and 500 `server_error` for a fault in the Server.
- A fault in the Server during sign-in is not a forged token. The callback shows a 500 page ("The sign-in failed on the Server…"), `/token` answers `server_error`, and both write the operational event `signin_error` (`endpoint`) without the error's text.
- More operational events in the D-068 envelope: `idp_invalid_response` (`issuer`, `endpoint`) for a provider that answered with something other than OpenID Connect's documents, and `cimd_fetch_failed` reason `network` for a host that gave no answer at all. Reason `status` means the host answered with an error.
- The Authorization code carries `idp_refresh_exp`, the provider's own stated refresh lifetime when it gives one, so the Refresh token cannot outlive it. data-model.md does not list this field.
- Accepted: one sign-in per browser at a time. Starting a second one replaces the first one's cookie, so the first then ends on the different-browser page.
- Accepted: `/mcp` answers a misconfigured Deployment with a plain-text 503 and a missing Sign-in with a JSON-RPC 401. The 503 is for the Operator, and the 401 is what an AI tool's sign-in discovery reads.
- environments.md says variables are read at the start of each request on Workers. Since this slice, they are read once per isolate (above). environments.md was corrected after the second code review.
- The test helper keeps the property name `h.idp`. Renaming it would rewrite every test body and void the recorded failures. The source no longer uses the "IdP" alias.
- Second code review: a token-endpoint answer that is not a 4xx with an OAuth error code (a 5xx, an HTML page) is an outage, not a refusal. Sign-in shows the provider-did-not-answer page, a refresh answers 503 `temporarily_unavailable`, and `idp_invalid_response` is written, so AI tools keep their Refresh tokens through a provider outage. The error class covering no answer and an unusable answer alike is `IdentityProviderUnavailable`. Any fault the routes do not catch answers 500 and writes `server_fault` (`path`), never the error's message or stack. The test helper class is `FakeIdentityProvider`.
Alternatives rejected: storing the kind as a payload field (it would sit beside the data-model fields as if it were one); defaulting a missing `resource` to `/mcp` (it would sign a Staff member in to the Allow-list-less URL without their AI tool asking for it).

## D-071 — A renewed Refresh token keeps the presented token's expiry; answers Q-025
Decided by: human | Date: 2026-10-19 | Phase: review (S-001)
Rationale: product owner's answer to Q-025. Entra ID rotates its refresh token on every use. If each renewal started a fresh 30 days, a Sign-in could be renewed without end, and earlier Refresh tokens would stay valid alongside the new ones. That breaks D-051's 30-day bound and the Security material's promise. The renewed Refresh token therefore expires when the presented one did, or sooner if the provider states a shorter lifetime. A Staff member signs in again at most 30 days after their first Sign-in.
Alternatives rejected: a fresh 30 days on every renewal. Regular users would never sign in again, and stolen Refresh tokens could be renewed indefinitely while the provider allowed it.

## D-072 — A plain-http loopback redirect URI may carry any port (RFC 8252)
Decided by: human | Date: 2026-10-20 | Phase: verify (S-001)
Rationale: found in S-001's live verification. ChatGPT's desktop client, identifying itself as "Codex" by a Client ID Metadata Document, registers `http://127.0.0.1/callback/<id>` and `http://localhost/callback/<id>` without a port. It then asks to return on whichever port it opened, such as `:54414`. RFC 8252 section 7.3 requires an authorization server to accept any port on a loopback redirect URI. security.md's exact-match rule refused it. A requested URI now matches a registered one if both are `http` on `127.0.0.1`, `[::1]` or `localhost` and agree on everything but the port. Every other redirect URI, `https` included, still matches exactly. A loopback address only ever reaches the Staff member's own machine, and the Authorization code stays bound to the exact URI it was issued for, port included, at `/token`.
Alternatives rejected: keeping exact matching, which leaves every native desktop AI tool unsupported; editing security.md now, which re-gates the system spec and the slices and clears S-001's state again. The wording waits for the next system-spec revision (Q-026).

## D-073 — Google is dropped from the release's sign-in requirements; Entra ID is the tested provider; answers Q-023
Decided by: human | Date: 2026-10-20 | Phase: verify (S-001)
Rationale: product owner's decision at S-001's verification: "pass S-001 for Entra now, drop Google client from requirements". Release testing covers Microsoft Entra ID only. That narrows ADR-004 ("Release testing covers Microsoft Entra ID and Google") and D-048's answer to Q-006. Any OpenID Connect provider that publishes discovery still works in principle, since nothing in the code is Entra-specific. Google's quirk (D-069) stays in the code and its tests, but no live Google run is required. S-001 passes on Claude and ChatGPT signing in through Entra ID.
Alternatives rejected: holding S-001 until a Google client exists; keeping Google as a release requirement for a later slice.
Consequence: the PRD's sign-in metric ("for each supported Identity provider") is measured against Entra ID alone. The slice list's S-001 line and ADR-004 still mention Google. They are corrected at the next revision of those documents (Q-026), because editing them now re-gates the slice list and clears the declared slice from the pipeline state.

## D-074 — The Database account's grants are the Allow-list; the Allow-list leaves the AI tool
Decided by: human | Date: 2026-10-20 | Phase: discovery (amendment, iteration 2)
Rationale: product owner's decision after weighing where the Allow-list should live. The person who knows which tables and columns an AI may read is whoever administers the database, not the AI tool's workspace admin. The list changes rarely. Anything the AI tool sends is only a narrowing hint (D-009), and a Staff member can widen it within the Boundary with a personal connector. Database grants are owned by the database administrator, enforced by the database itself, reviewable, identical for every AI tool, and effective at once without a redeploy or reconnect. PostgreSQL and MS SQL Server both grant SELECT per table and per column, and both let the Server read the grants back (`has_table_privilege`/`has_column_privilege`; `HAS_PERMS_BY_NAME`/`sys.fn_my_permissions`).
Alternatives rejected: the connector URL path (ADR-006), which leaks into URLs and request logs, forces a reconnect on every change, and Staff members can alter it; a request header (Q-027), which Claude stores write-only, ChatGPT may not offer, and Staff members can still alter; a Server-side list setting, which works but splits ownership between the Server's settings and the database's own grants.
Consequence: amends R-003 and R-017, and supersedes D-009, D-011, D-040 and ADR-006. D-012 is restated for grants. It retires or redefines the domain terms Allow-list, Organisation admin and Managed client configuration, and rewrites J-003 and parts of J-006. The Database account must be dedicated and must not bypass grants: no PostgreSQL superuser or table-owner role, no SQL Server `db_owner`, `db_datareader` or `sysadmin`. Created objects the account owns stay visible only in their Conversation. Different lists for different groups would later come from Identity provider groups mapped to database roles. Q-015 and Q-027 lapse.
Superseded in part: D-075 restates what an unset Boundary means; D-076 makes table ownership a reason to hide tables, not to refuse to serve; D-077 gives the full list of what bypasses grants, and when it is checked.

## D-075 — With no Boundary set, the grants alone decide; nothing granted means only Created objects; restates D-012
Decided by: human | Date: 2026-10-21 | Phase: discovery (amendment, iteration 2)
Rationale: product owner's answer to the D-074 consistency critique. Under D-074 the grants are already an explicit, deny-by-default list: nothing is visible that the Database administrator has not granted. A second, mandatory list in the Boundary would make two people act before anything is visible, without adding safety. An unset Boundary therefore excludes nothing. With nothing granted, only Created objects are visible. System catalogs are never visible, granted or not (D-077).
Alternatives rejected: keeping D-012's "no Boundary means nothing visible", which makes the Operator's Boundary a mandatory duplicate of the grants.
Consequence: D-012 now reads, for this product: nothing granted means only Created objects are visible, and no Boundary means no extra exclusion. The Deployment kit's default for `BOUNDARY` is unset.

## D-076 — A Created object is shared by the Database administrator taking it over
Decided by: human | Date: 2026-10-21 | Phase: discovery (amendment, iteration 2)
Rationale: product owner's answer to the D-074 consistency critique. A table the Server creates is owned by the Database account, and an owner's access cannot be granted or revoked. Tables the Database account owns are therefore never on the Allow-list. They are visible only as Created objects in the Conversation whose token names them (R-016). To share one, the Database administrator takes it over by changing its owner to another role (`ALTER TABLE … OWNER TO …` on PostgreSQL, `ALTER AUTHORIZATION ON OBJECT::…` on MS SQL Server), then grants SELECT on it to the Database account. From then on it is on the Allow-list like any other table. The creation response says so.
Alternatives rejected: leaving the mechanism to S-012's spec; treating table ownership as bypassing grants, which would stop the Deployment after its first create.
Consequence: owning tables is not a reason to refuse to serve, only a reason to hide them. A Database account that owns business tables sees none of them, which is a safe failure, and the Security material says so. On MS SQL Server a table's owner is normally its schema's owner, not its creator, so how Created objects are owned and found there is open (Q-029).

## D-077 — The Database account check: what bypasses grants, when it runs, how it is reported
Decided by: human (confirmed 2026-10-21 at the D-074 amendment gates) | Date: 2026-10-21 | Phase: architecture (amendment, iteration 2)
Rationale: the consistency critique found three versions of the start-up check. There is now one, defined in ADR-006 and referenced elsewhere:
- **What bypasses grants:** any grant that reaches every table at once. On PostgreSQL that is `rolsuper`, `rolbypassrls`, or membership (direct or inherited, `pg_has_role`) of `pg_read_all_data` or `pg_write_all_data`. On MS SQL Server it is membership of `sysadmin`, `db_owner` or `db_datareader`, database-level `CONTROL` or `SELECT`, or server-level `CONTROL SERVER` or `SELECT ALL USER SECURABLES`, each held directly or through a role (`fn_my_permissions(NULL, 'DATABASE')` and `(NULL, 'SERVER')`).
- **When it runs:** on every Tool call, in the same catalog Server statement that reads the grants. A Worker has no start-up moment, and a role granted later is caught on the next call.
- **How it is reported:** MCP calls answer 503 "Deployment misconfigured: Database account bypasses grants", and the line `config_invalid` with `variable` `HYPERDRIVE` (Workers) or `DATABASE_URL` (Azure) is written. `/healthz`, Sign-in and the metadata endpoints keep answering. `/healthz` runs the same check as its health-check Server statement and reports `database: unsafe`.
- **System schemas** (`pg_catalog`, `information_schema` and `pg_toast*`; `sys` and `INFORMATION_SCHEMA`) are never on the Allow-list. Every account can read them, and they list every Hidden object.
- **The test Database** connects as a dedicated role, `sqlmcp_reader`, created by the slice that first reads grants (S-002), not as Supabase's `postgres`.
Alternatives rejected: a once-per-isolate check, which misses later role grants; refusing every endpoint, which would also hide the reason from `/healthz`.

## D-078 — Choices made specifying S-002
Decided by: human (confirmed 2026-10-22 at the S-002 verification gate) | Date: 2026-10-21 | Phase: slice-spec (S-002)
Rationale: the slice needs answers the system spec does not give:
- `list_tables` is a Typed tool that produces no Statements, only catalog Server statements (D-026). The domain model's Typed tool "produces … one or more" Statements when not refused; this is the first exception, queued for the domain model's next revision (Q-030).
- An MCP request made while the Database account bypasses grants (D-077) is a Tool call refused with a new Refusal class, `unsafe_account`, so R-010's "run or refused" still leaves an Audit record. data-model.md's class list gains it at its next revision (Q-030).
- The listing stops at 500 tables, sorted by schema then table, and says so with `complete: false`. An optional `schema` input narrows it.
- `request_text` is validated in the tool, not by the SDK's input schema, so that a bad value is still a Tool call with an Audit record.
- Build: without a Database (in tests that pass none) no Tool is registered, and `tools/list` stays empty, so S-001's tests keep their recorded failures. A `tools/call` of `list_tables` with valid inputs reads the catalog once, before the SDK dispatches it, so an unsafe account can answer an HTTP 503. `no_audit_for_initialize_or_tools_list` passed on its first run, because nothing wrote Audit records yet, and was recorded failing against a deliberate break (an Audit line on every request). Two tests were edited after their first record, because the hidden fake table `staff` collided with the `staff` field and the domain word. The table became `payroll`, and both tests were re-recorded failing against deliberate breaks (an Object name in the description, the driver's message logged), then the code was restored.
Alternatives rejected: the listing as an MCP resource rather than a tool (resources carry no `request_text`, so they would leave no Request text in the Audit record); a 503 with no Audit record for an unsafe account (it breaks R-010).

## D-079 — Hyperdrive query caching is off for every Cloudflare Deployment
Decided by: human (confirmed 2026-10-22 at the S-002 verification gate) | Date: 2026-10-21 | Phase: slice-spec (S-002)
Rationale: Hyperdrive caches read queries for up to 60 s by default. The Allow-list and the account check are reads, so a revoke or a bypassing role could go unseen for a minute, and Agent-written queries (S-003) would return stale rows. The project test Deployment's config is updated with caching disabled. The Deployment kit (S-005) creates Operator configs the same way, and environments.md says so at its next revision (Q-030).
Alternatives rejected: keeping the cache and stating "within 60 s" (it contradicts R-017's "takes effect without a redeploy" in spirit, and stale query results are wrong for answering questions); a `max_age` of a few seconds (it still makes revocation non-immediate, for little gain on the volumes in operations.md).

## D-080 — Database error classes, their fixed sentences, and which refusals are Tool calls
Decided by: human (confirmed 2026-10-22 at the S-002 verification gate) | Date: 2026-10-21 | Phase: slice-spec (S-002)
Rationale: every slice that sends SQL needs the same answer, so it is fixed once here. S-006 adds the MS SQL Server mapping.
- **PostgreSQL code to `reason_class`:**
  - SQLSTATE class `08`, or a socket or TLS failure before any reply, is `connection`;
  - `57014` (query cancelled) and `57P01`–`57P05` are `timeout`;
  - `42501` is `permission`;
  - class `23` is `constraint`;
  - anything else is `other`.
- **The Agent's sentence for each class.** These are fixed and name nothing (D-005), and each ends with " (reference <Audit record id>)" so an Operator can find the record:
  - `connection`: "The database could not be reached."
  - `timeout`: "The database stopped the query before it finished."
  - `permission`: "The database refused this for lack of permission."
  - `constraint`: "The database refused the change because it breaks a rule on the data."
  - `other`: "The database could not complete this."
- **Which refusals are Tool calls.** A setting that makes the whole Deployment misconfigured (`SERVER_SECRET`, `BOUNDARY`, `IDP_*`, `PUBLIC_URL`) is caught before any MCP method is dispatched. Like a call with no Sign-in (D-044), it is not a Tool call and leaves no Audit record, only `config_invalid`. An unsafe Database account is found inside the Tool call's own catalog statement, so it is a Tool call, refused with `unsafe_account`, and audited (D-078).
- Refusal sentences also end with the reference.
Alternatives rejected: passing driver messages through after scrubbing (D-005 prefers rebuilding); auditing config-misconfigured requests (no Staff member's call has run, and the Deployment cannot even read its own settings).

## D-081 — The account check refuses every route to a bypassing role; Boundary names fail closed; answers Q-031
Decided by: human | Date: 2026-10-22 | Phase: review (S-002)
Rationale: product owner's answers after the S-002 code review.
- **Account check (extends D-077).** The Database account is refused if:
  - it is a member, with or without inherited rights (`pg_has_role(…, 'MEMBER')`), of any role that is a superuser, has `BYPASSRLS`, or is or reaches `pg_read_all_data` or `pg_write_all_data`;
  - it has `CREATEROLE`;
  - the `session_user` it connected as is a superuser, even if `current_user` is not.

  Every one of these is judged for `session_user`, the login role, which can always `SET ROLE NONE` back to itself. Its memberships include `current_user`'s (added after the S-002 re-review).

  Each of these is a route by which `SET ROLE` or `RESET ROLE` reaches every table. S-003 will run the Agent's SQL as this account.
- **Ownership, conservatively.** A table owned by any role the account is a member of, with or without inherited rights, is never on the Allow-list (`pg_has_role(…, 'MEMBER')`), because the account can `SET ROLE` to the owner.
- **Boundary letter case.** Exclusions match ignoring letter case, so `"Payroll"` excludes `payroll`. Included schemas match exactly, so a case typo shows less, never more. A mistake in the Boundary always hides rather than reveals.
- **Column types.** A column's type is shown by name only when it is a built-in type (`pg_catalog`). Any other type is shown as `user-defined`, because a type's name can carry a hidden schema's or table's name (every table has a row type of the same name).
Alternatives rejected: relying on S-003's Query check to refuse `SET ROLE` (one more place that must never fail); exact Boundary matching everywhere (a case slip in an exclusion would show what it meant to hide).

## D-082 — Choices made specifying S-003
Decided by: model | Date: 2026-10-23 | Phase: slice-spec (S-003)
Rationale: the Query check needs answers that ADR-005 and security.md do not give. Revised after the S-003 gate-1 critique (docs/slices/S-003/spec.md).

**Shared by both Engines.** S-007 repeats these for MS SQL Server, where R-002 asks for the same tools.
- **The `query` tool.**
  - It takes `request_text` and `sql`.
  - It returns `{ columns: [ { name, type } ], rows: [ [ value, … ] ], row_count, cut_short }`. `type` follows `list_tables`' rule (D-081): a built-in type's name with its modifier, or `user-defined`.
  - Values are JSON `null`, booleans, numbers for 16- and 32-bit integers and floats (with `NaN` and infinities as strings), and the Database's own text output for every other type. Bigints, numerics and timestamps are therefore never altered by JavaScript.
- **Cut-short notice.** A cut-short result's text content ends with "The result was cut short at the Row limit of <N> rows; more rows match."
- **Refusals.** Each sentence ends with D-080's reference. No sentence echoes a name from the query, and each depends only on the query's text and what the listing shows.

  | case | `reason_class` | sentence |
  |---|---|---|
  | bad `request_text` | `invalid_input` | "The request was not accepted: request_text must be 1–4,000 characters." |
  | bad `sql` | `invalid_input` | "The request was not accepted: sql must be a non-empty string." |
  | over 64 KiB | `query_check` | "The query was not accepted: it is longer than 64 KiB." |
  | does not parse | `query_check` | "The query was not accepted: it is not valid <Engine name>." |
  | not exactly one read-only SELECT | `query_check` | "The query was not accepted: it must be exactly one SELECT, which only reads." |
  | unsupported node, function, operator or type | `query_check` | "The query was not accepted: it uses a clause, function, operator or type that is not supported here." |
  | unqualified table, or an unqualified, `NATURAL` or `USING` column reference | `query_check` | "The query was not accepted: qualify every table with its schema and every column with its table or alias." |
  | `*` over a table not fully readable | `query_check` | "The query was not accepted: name the columns instead of using *, because not every column of that table can be read." |
  | a column whose type reaches a `reg*` type or a composite, through domains, arrays, ranges or composite fields at any depth | `query_check` | "The query was not accepted: it reads a column of a type that queries cannot read." |
  | a subquery or CTE column with no name the check can read | `query_check` | "The query was not accepted: name every subquery and CTE column you use with AS, and refer to it by that name." |
  | a table or column that is not Visible, or does not exist | `hidden_object` | "The query was not accepted: it reads a table or column that is not available to you. Use list_tables to see what you may query." |
  | anything the Engine's plan step refuses | `query_check`; `hidden_object` when the plan reads a relation it cannot account for | "The query was not accepted: the database could not plan it. Check its names and types against list_tables, and its constant values." |

  A plan-step failure is a Refusal, never a Database error, because the query was not sent. That includes the planner folding a constant, as in `1/0`.

**PostgreSQL.**
- **Pinned `search_path`.** The query runs with `search_path` pinned to `pg_catalog`. Every table must be schema-qualified, and every column qualified with its table or alias. An unqualified operator or function could otherwise resolve to a user-schema object, which can be `SECURITY DEFINER` (D-038). An unqualified or `NATURAL`/`USING` column name could otherwise tell an ungranted column from a missing one, because PostgreSQL resolves names before it checks privileges. The one exception is an `ORDER BY` item equal to an explicit output name, which PostgreSQL resolves to the output column first.
- **No catalog lookups, and only built-in cast targets.** Casts and typed literals may name only an allow-list of built-in types, with no array types. A column cannot be read when its type reaches a `reg*` type or a composite, looking through domains, arrays, ranges, multiranges and composite fields at any depth. `reg*` values coerce literals to catalog entries and print catalog names, and a composite reveals its shape, which for a Hidden table's row type is that table's shape. Columns of other user-defined types are readable under D-085, which amended this entry on 2026-10-25. A bare name is accepted only as a whole item of the SELECT's own `ORDER BY`. Aggregate and window `ORDER BY` resolve against input columns. A subquery or CTE column must be one of its readable output names, because PostgreSQL reads `s.f` as `f(s)` otherwise. A table reference may not carry a column-alias list, because PostgreSQL counts hidden columns against it. A join may not carry an alias. A function in `FROM` exposes columns only through its column-alias list. Operator names are checked in `SubLink`s as well as expressions, and `ORDER BY … USING` is refused. `alias.*` is limited to whole select-list items over tables whose columns are all Visible and readable. Casts defined on the user-defined type of a Visible column run as their owner wrote them (D-085). User-defined operators are kept out by the pinned `search_path`, since `CREATE OPERATOR` needs no type ownership. Objects a superuser installs into `pg_catalog` are trusted like built-ins. Row-level security policies and the functions they call are trusted under D-083.
- **Columns checked before the Database.** Every column reference is checked against the Visible columns before anything is sent. The plan check accounts for each relation in the plan as follows:
  - a table the query names;
  - a partition or inheritance descendant of one;
  - a table that one of their row-level security policies reads, followed through nested policies, those tables' descendants and policy-read views to the end of the chain.

  PostgreSQL reads all of those under the named table's grant, so they are accepted even when outside the Boundary. A Visible table whose policy reads an ungranted table is unqueryable, and it gets the plan sentence. This tells the Agent the table cannot be used, never what it depends on.
- **Execution.** Rows are fetched through a cursor, `Row limit + 1` at a time, over the extended query protocol, inside a read-only transaction that is always rolled back.
- **Audit record.** A `query` Audit record has `inputs: {}`. The SQL is recorded once, in `statements` or `submitted_sql`, and `rows` is the count returned to the Agent. Redaction writes `normalize`'s `$n` placeholders as `?`, and uses that output only for a single SELECT whose normalised text holds no literal. Anything else is `<unparsed: N chars>`, because `normalize` keeps literals in `COPY`, `PREPARE`, `CREATE … AS` and other statement types. N counts UTF-16 code units.

Alternatives rejected:
- resolving names through the Database account's default `search_path`: it lets user-schema operators and functions resolve too;
- leaving column resolution to PostgreSQL: ambiguity and `NATURAL` joins reveal ungranted columns;
- a deny-list of `reg*` types: it misses their array types;
- reading user-defined-type columns behind a `pg_cast` check: it is more surface to prove. Q-034 then settled the question the other way (D-085);
- refusing queries whose plan reads a descendant or policy table: each such refusal would confirm a Hidden object exists;
- wrapping the query in `SELECT * FROM (…) LIMIT n`: ADR-005 rejects rewriting;
- returning every value as a JavaScript-parsed type: bigints and numerics lose precision, and timestamps shift zone.

## D-083 — Row-level security policies, and the functions they call, are trusted like grants
Decided by: human | Date: 2026-10-24 | Phase: slice-spec (S-003)
Rationale: product owner, after the S-003 gate-2 critique ("Trust them"). A policy on a Visible table runs whatever functions it calls, `SECURITY DEFINER` ones included, inside the Agent's read-only transaction, and the Query check cannot see them. Policies are the Database administrator's own configuration, as grants are (D-074). They decide which rows come back, not what the Agent wrote. Supabase policies routinely call functions such as `auth.uid()`. This narrows D-038, which keeps every user-defined function away from the Agent's own SQL but not from the Database administrator's policies. The Security material says so, and tells a Security reviewer to review policy functions as part of the grants.
Alternatives rejected: refusing any table whose policies call a function outside `pg_catalog` (on Supabase it would make most tables with row-level security unqueryable).

## D-084 — AT TIME ZONE and array constructors join the supported constructs; answers Q-032
Decided by: human | Date: 2026-10-25 | Phase: slice-spec (S-003)
Rationale: product owner ("Q-032: Add both now"). Without `AT TIME ZONE`, a question about daily figures in local time is answered in UTC days, which gives quietly wrong totals (R-012). Array constructors cost less to leave out, but the owner chose both. security.md's supported constructs gain:
- `AT TIME ZONE` and `AT LOCAL` (`timezone`) on PostgreSQL, and `AT TIME ZONE` on MS SQL Server, where T-SQL has it natively;
- `ARRAY[…]` and `ARRAY(subquery)` on PostgreSQL. T-SQL has no equivalent.

Array subscripts and casts to array types stay refused, so `_regclass` and `regclass[]` stay closed. Editing security.md re-gates the system spec and the slice list.
Alternatives rejected: waiting for S-004's benchmark (time-zone answers would be wrong in the meantime); adding `AT TIME ZONE` only.

## D-085 — Casts on user-defined column types are trusted like grants; answers Q-034
Decided by: human | Date: 2026-10-25 | Phase: slice-spec (S-003)
Rationale: product owner ("Q-034: Trust conversions like policies"). Columns of enums, domains and extension types are common in Supabase schemas, and refusing them would leave many questions unanswerable. They are therefore readable. Whatever casts their types carry run as the type's owner defined them, whether implicit or explicit, and whether functions or `SECURITY DEFINER` ones. The Server treats them, like row-level security policies (D-083), as the Database's own configuration. This narrows D-038 again: the Agent still cannot name a user-defined function, operator or cast target, but casts that already exist on a Visible column's type can run. `reg*` columns, their arrays and domains over them stay unreadable, because they reveal catalog names, not because of what they run. The Security material says so, and tells reviewers to review casts on user-defined column types as part of the grants. Types are created far more casually than policies, so this is a weaker guarantee than D-083, and the owner accepted that.
Amended 2026-10-25 by the product owner, after the amendment critique:
- **Composites are refused.** Columns whose type is, or reaches, a composite type are unreadable, table row types included, because a composite reveals the shape of the table it mirrors ("Refuse composites").
- **Domain constraints are trusted.** Domain `CHECK` constraints, which run when the Agent's literal is converted to a domain, are trusted with casts ("Yes, trust them").
- **`reg*` is checked at any depth.** The type is looked through at any depth, for `reg*` as for composites.
Alternatives rejected: refusing such columns (most enum questions unanswerable); admitting a type only when it has no user-written casts (more surface to prove, and the critiques found holes at each layer).

## D-086 — Choices made building S-003
Decided by: model | Date: 2026-10-25 | Phase: build (S-003)
Rationale: the spec left these open, or building showed one of its statements to be inexact:
- **The parser on Workers.** `@libpg-query/parser` is loaded from a compiled WebAssembly module through Emscripten's `instantiateWasm` hook. The Worker imports the `.wasm` file, and Node compiles it from disk. The package's own entry point is not used, because it instantiates on import through Node's file system. Its glue reads `__filename` and `__dirname`, which Workers lack, so `wrangler.jsonc` defines both at build time. The bundle is 585 KiB gzipped.
- **The query tool needs a parser.** `query` is registered only when the app is given a parser, as no Tool is registered without a Database (D-078). The Worker always gives one, and S-002's tests, which give none, keep their recorded failures.
- **Redaction keeps type modifiers.** "No literal left" ignores the constants in a type's modifiers (`numeric(12,2)`), which are part of the type, not values. `normalize` replaces every other literal, `NULL` and `true` included. `?` replaces each `$n` at the byte offsets the re-parse gives, so a quoted identifier containing `$1` is left alone.
- **The submitted SQL of every refused query is kept.** That covers SQL refused for an invalid `request_text` or an unsafe account, not only SQL the Query check refused, so R-010's attempted SQL is always traceable. A connection failure before the query was sent is a Database error, logged with the submitted SQL and no Statement.
- **Plan-stage failures.** An `EXPLAIN` failure with no SQLSTATE, or class `08`, is a lost connection, and so a Database error, not a Refusal.
- **Domains in results.** PostgreSQL describes a domain column's values by the domain's base type, so `query` types a domain over `integer` as `integer`, returns its values as numbers, and differs from `list_tables`, which names the column `user-defined`. The row description is the only source the spec allows.
- **Domain constraints on the Agent's literals.** PostgreSQL resolves `coalesce`, `ARRAY[…]` and comparisons over a domain column and a literal to the base type. A domain's `CHECK` therefore does not run on the Agent's literals in any accepted construct. The S-003 spec's line ("the constraint runs as defined") is met by PostgreSQL's own rules, and the test proves the query runs without invoking the constraint.
- **Accepted value functions.** `CURRENT_TIMESTAMP(n)` is accepted with `current_date` and `current_timestamp`. `FETCH … WITH TIES` is refused as a construct not listed. `ONLY` is accepted.
- **Subquery and CTE output names** are an explicit `AS`, a column-alias list, a qualified column's name, or an expanded `alias.*`. A function's output, such as `count(*)`, has no readable name until it is given one with `AS`.
- **The probe suite and `*`.** `SELECT *` over a partly granted table is refused because `all_columns` is false, which `list_tables` already shows (S-002). The suite therefore leaves out `*` over such a table: its answer differs between the two Databases by design, not by leak.
- **Tests corrected after their first record**, each recorded failing again:
  - `query_check_refuses_unlisted_node_types`: its `WITH TIES` line lacked the `ORDER BY` that PostgreSQL's grammar requires, so it tested a parse error. It was re-recorded against a break that accepts `WITH TIES`.
  - `user_defined_type_columns_readable`: a domain column's expected type was corrected while the test still failed.
  - `user_defined_casts_run_as_written` and `domain_constraints_run_as_written`: the fixture's cast recursed into itself, and a domain constraint cannot run on a literal (above). They were re-recorded against breaks that make enum or domain columns unreadable.
- **Tests guarding behaviour already present** were recorded against a named break:
  - `column_existence_probes_refused_alike` and `hidden_object_probe_suite_answers_identically`: bare names let through;
  - `query_refusals_never_echo_names`: the query appended to a Refusal;
  - `query_audit_never_holds_result_values`: the answer logged;
  - `probe_suite_never_runs_user_functions`: operators in `SubLink`s left unchecked.
Alternatives rejected: patching the package to load on Workers (a fork to maintain); registering `query` with a parser loaded from Node's file system in tests (S-002's recorded tests would change).

## D-087 — Resolving the S-003 code review; comments are stripped under Redaction
Decided by: human | Date: 2026-10-25 | Phase: review (S-003)
Rationale: the product owner's answers to the review hold (docs/slices/S-003/review.md): "Fix all 11 now", and, for SQL comments under Redaction, "Strip comments". With Redaction on, every comment PostgreSQL's lexer finds becomes one space before normalising, so values an Agent writes into a comment are never logged. A quoted identifier containing `--` is kept. The other gaps were fixed in this slice instead of deferred:
- **Behaviour fixed:**
  - a plan-step failure is classed by `classifyPostgresError`, so a socket error is a `connection` Database error;
  - a failure after the fetch keeps the Statement;
  - D-084's constructs run against PostgreSQL in a test;
  - the domain-constraint test is renamed to what it proves, and its Proven by line is corrected.
- **Restructured, with no behaviour change:**
  - an Engine's half of the Query check and of Redaction sits behind a `QueryEngine` in `src/engine/`, and its name fills D-082's parse sentence, so S-007 adds an MS SQL Server `QueryEngine` and changes nothing in `tools/query.ts`;
  - the structural step is `checkStructure`, not the whole Query check;
  - Refusal classes are the typed union `RefusalClass`;
  - one `SYSTEM_SCHEMA` serves the listing and the Query check;
  - each Tool is one record in the MCP endpoint, with its inputs checked once;
  - the Audit logger takes a list of Statements, declared once.
- **Kept, with the reason:** the Engine adapter's outcome kinds (`plan_refused`, `error`) are its own vocabulary, and the Tool maps them to the Audit record's `refusal` and `database_error`. The structural step's cases (`hidden`, `unqualified` and the rest) select D-082's sentences, and each maps to one class.
Alternatives rejected: logging any SQL containing a comment by its length only (it loses the SQL whenever an Agent comments its query); deferring the structural gaps to S-007 and S-010 as questions (the product owner chose to fix them now).
