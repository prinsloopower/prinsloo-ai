# Domain model — sql-mcp-server

Every term below already appears in the discovery document, the journeys or the
decision register. Two upstream words did two jobs and are split here: *the
natural-language request* (Question vs Request text) and *analyst* (Analyst vs
Staff member). The rest collapses synonyms.

## Operator
The person who deploys and runs a Deployment in their organisation's cloud, and who owns every Server setting. Not the Organisation admin, who owns only the Allow-list; not someone who merely holds admin rights in the Identity provider, though one person may be both.
Source: discovery.md Problems, R-001, R-007, R-013, R-017; journeys.md J-001, J-002, J-009
Aliases: self-hosting engineer
Relates to: one Operator runs one or more Deployments; each Deployment has exactly one Operator role behind it.

## Organisation admin
The person who owns the Allow-list and pushes it to Staff members through Managed client configuration. Not the Operator, and not an administrator of the Identity provider — owning the Allow-list grants no other setting.
Source: discovery.md R-003, R-017; journeys.md J-003, J-006; decisions.md D-011
Aliases: none (bare "admin" is not rejected — because "admin-managed" and "admin rights in the identity provider" use it for other things — downstream artifacts write "Organisation admin" in full)
Relates to: an organisation has one or more Organisation admins; they maintain the Allow-list in each AI tool's Managed client configuration, and may push different Allow-lists to different AI tools or groups.

## Staff member
Anyone who asks Questions through an AI tool connected to a Deployment. Includes guest and external accounts the Identity provider authenticates (D-015), so "staff" names the role, not employment status. Not the Analyst, even when their job title is analyst.
Source: discovery.md Problems, R-012; journeys.md J-002, J-004, J-005, J-006; decisions.md D-015
Aliases: end user, person asking, signed-in person, business user
Relates to: a Staff member has many Conversations and makes many Tool calls through the Agent; each Tool call made after Sign-in is attributed to exactly one Staff member.

## Analyst
The SQL-capable person — analyst or developer — who answers data requests by hand today, and whom the product exists to relieve. Not a role in the product: an Analyst who asks Questions through an AI tool is acting as a Staff member.
Source: discovery.md Problems (first problem); journeys.md J-004
Aliases: none
Relates to: none inside the product.

## Security reviewer
The person at an adopting organisation who approves or rejects a Deployment, judging it against the Security material and the Deployment's actual settings. Not the Operator, who asks for approval and later traces Audit records on the reviewer's behalf.
Source: discovery.md Problems, R-014; journeys.md J-007, J-008
Aliases: compliance reviewer, auditor
Relates to: a Security reviewer reviews one Deployment at a time.

## Server
The software this project publishes. Not a running copy of it — that is a Deployment.
Source: discovery.md R-001, R-004, R-006; journeys.md J-001
Aliases: none ("MCP" and "MCP server" are not rejected — they name the protocol — but downstream artifacts write Server or Deployment and never "the MCP" for either)
Relates to: one Server release is run as many Deployments, by many Operators.

## Deployment
One running copy of the Server, in one Operator's cloud, connected to one Database, with its own Server settings. Either public, reachable over an HTTPS endpoint so hosted AI tools can call it, or private, reachable only inside the organisation's network (D-018). Starts when the Operator deploys it; refuses every Tool call until Sign-in is configured (D-017); changes to Server settings take effect on redeploy.
Source: discovery.md R-007, R-013, R-017; journeys.md J-001, J-002, J-009; decisions.md D-017, D-018
Aliases: none ("instance" is not rejected — because cloud services use it for their own resources)
Relates to: a Deployment has exactly one Database (pending Q-009), one Permission tier, one Boundary, one Row limit, one Redaction setting; it serves many Staff members.

## Host
The Operator's own runtime environment for a Deployment — the container, service or worker running it in AWS, Azure or Cloudflare, together with the log facility attached to it — which holds the Audit records. Not the cloud provider at large: a central logging account, another region or another service in the same provider is off the Host. Not the Database's server. On a runtime with no container, the platform's own log facility for that runtime (D-008).
Source: discovery.md R-001, R-010; journeys.md J-008; decisions.md D-006, D-008
Aliases: cloud container
Relates to: a Host runs one or more Deployments; Audit records never leave it.

## Database
The MS SQL Server or PostgreSQL database a Deployment answers Questions about. Not the Engine, which is the product family it runs on.
Source: discovery.md R-002; journeys.md J-001
Aliases: none
Relates to: a Database runs on exactly one Engine; it holds many Objects.

## Engine
The database product a Database runs on: MS SQL Server or PostgreSQL. MS SQL Server on Cloudflare is dropped if architecture finds it unworkable (D-020).
Source: discovery.md R-002; decisions.md D-020
Aliases: database engine
Relates to: each Engine has many Databases.

## Database account
The credentials a Deployment uses to connect to its Database. Its grants cap what any Permission tier can do; the Permission tier can only restrict them (D-004).
Source: discovery.md R-008; journeys.md J-001, J-005, J-006, J-009; decisions.md D-004
Aliases: SQL user account, SQL account
Relates to: a Deployment uses exactly one Database account.

## Identity provider
The organisation's existing service that authenticates Staff members, reached through OAuth (D-002). Who may sign in is governed here, not in the Server (D-015).
Source: discovery.md R-009; journeys.md J-002; decisions.md D-002, D-015
Aliases: IdP, OAuth provider
Relates to: a Deployment trusts exactly one Identity provider — the organisation's own (D-015); it authenticates many Staff members. Which providers are supported is Q-006.

## Sign-in
The act by which a Staff member proves who they are to a Deployment through the Identity provider, and the access it grants. Lasts as long as the Identity provider's issued lifetime, then must be renewed against the provider (D-024); an account removed in the provider keeps working until then. Not the Conversation that follows.
Source: discovery.md R-009; journeys.md J-002, J-004; decisions.md D-024
Aliases: log in ("login" is not rejected — because MS SQL Server uses it for its own server principals)
Relates to: a Staff member signs in through one AI tool; every later Tool call from it is attributed to them.

## AI tool
The application a Staff member uses to ask Questions, such as Claude, ChatGPT or Copilot, which connects to a Deployment. Not the Agent inside it, and not the AI provider that runs it.
Source: discovery.md Problems, R-012; journeys.md J-002, J-003, J-004
Aliases: AI client
Relates to: an AI tool hosts one Agent per Conversation; it reads the Managed client configuration.

## Agent
The AI model inside an AI tool that interprets a Question, writes Agent-written queries and makes Tool calls. Not the AI tool, and not the Staff member on whose behalf it acts.
Source: discovery.md R-003, R-004, R-006; journeys.md J-004, J-005, J-006
Aliases: none
Relates to: an Agent acts for exactly one Staff member in one Conversation; it may hold a Semantic model.

## AI provider
The vendor whose infrastructure runs the AI tool's model, outside the adopting organisation. Results the Server returns pass through it (Q-018).
Source: journeys.md J-007; questions.md Q-018
Aliases: AI vendor
Relates to: an AI tool has exactly one AI provider.

## Semantic model
Business-level guidance the Agent holds, as a skill, about what the data means, so it writes better Agent-written queries. Lives with the Agent; the Server neither holds nor checks for one (D-001). Not this domain model.
Source: discovery.md R-006; journeys.md J-004; decisions.md D-001
Aliases: semantic layer, data dictionary
Relates to: an Agent holds zero or one Semantic model per Database.

## Conversation
One continuous exchange between a Staff member and the Agent, as the Staff member experiences it. Begins when they start a new chat; reopening the same chat later continues it (D-025); ends only when the chat can no longer be reopened. Not a network connection between AI tool and Deployment; how the Server tells one Conversation from the next is Q-014.
Source: discovery.md R-016; journeys.md J-006; decisions.md D-025; questions.md Q-014
Aliases: chat
Relates to: a Conversation belongs to one Staff member; it contains many Tool calls and zero or more Created objects.

## Question
What the Staff member asks, in their own words, in the AI tool. The Server never sees it. Not the Request text, which is the Agent's account of it.
Source: discovery.md R-010, R-012; journeys.md J-004
Aliases: none ("prompt" is not rejected — because prompt injection is a distinct concern the later phases must name)
Relates to: one Question leads to one or more Tool calls.

## Request text
The Agent's account of the Question, passed to the Server with a Tool call and logged as received — never redacted (R-011). It cannot be verified against the Question (Q-002).
Source: discovery.md R-010, R-011; journeys.md J-007, J-008; questions.md Q-002
Aliases: natural-language request, NL request
Relates to: each Tool call carries exactly one Request text.

## Tool call
One call from the Agent to a Deployment, after Sign-in: a Typed tool, or the submission of an Agent-written query. Ends in one of three ways — it runs, it ends in a Refusal, or it ends in a Database error — and in every case leaves one Audit record. Discovery's "request" in R-010 means a Tool call. A call with no Sign-in is not a Tool call: the Deployment blocks it, replies only that the connection is not authenticated, and logs nothing (D-044).
Source: discovery.md R-004, R-009, R-010; journeys.md J-004, J-008; decisions.md D-044
Aliases: none ("request" is not rejected — because "Request text" uses it)
Relates to: a Tool call is made by one Agent for exactly one Staff member; it produces zero or more Statements and exactly one Audit record.

## Typed tool
A fixed tool the Server offers, whose Statement the Server builds from typed inputs. The only way to write, delete or change the schema (R-005), and limited to Visible objects (R-004). Which typed tools a Deployment offers follows from its Permission tier.
Source: discovery.md R-004, R-005, R-007; journeys.md J-005, J-006; inputs interview answer 5
Aliases: fixed tool, deterministic tool ("template" is not rejected — because cloud deployment templates use it)
Relates to: a Typed tool produces zero Statements when refused, otherwise one or more; how many is fixed by the tool, not by the Agent.

## Agent-written query
A read-only SELECT the Agent writes and submits. Runs only after it passes the Query check, and returns at most the Row limit. Never writes, deletes or changes the schema.
Source: discovery.md R-004, R-006, R-015; journeys.md J-004; decisions.md D-001, D-013
Aliases: free read, free SELECT, free query, generated query, NL2SQL query
Relates to: an Agent-written query that passes the Query check becomes exactly one Statement; one that fails it is never sent and becomes none, though its text is still recorded in the Audit record.

## Query check
The Server's analysis of an Agent-written query before it runs: read-only, a single statement, and touching only Visible objects. A query it cannot fully analyse fails (D-013). Not a check on Typed tools, whose Statements the Server builds itself.
Source: discovery.md R-004, R-006; decisions.md D-013
Aliases: SQL validation
Relates to: each Agent-written query gets exactly one Query check.

## Server statement
A metadata or health-check Statement the Server issues for its own work: at start-up, for health checks, or while serving a Tool call (catalog lookups for a Query check or a Typed tool). Not SQL run on the Staff member's behalf, and not recorded as the Tool call's Statement (D-026). Never puts a Hidden object in front of the Agent.
Source: discovery.md R-004; discovery.md Critique findings gate 2; inputs interview answer 17; decisions.md D-026
Aliases: introspection query
Relates to: a Deployment issues many Server statements; some are issued during a Tool call, none is attributed to a Staff member.

## Statement
Any SQL sent to the Database: built by a Typed tool, an Agent-written query that passed the Query check, or a Server statement. SQL that is refused is never sent and is not a Statement. Not a Question, and not a Tool call, which may produce several Statements or none.
Source: discovery.md R-004, R-010, R-011
Aliases: none
Relates to: a Typed-tool or Agent-written Statement belongs to exactly one Tool call; a Server statement is recorded against none.

## Refusal
A Deployment declining a Tool call: a Hidden object, a failed Query check, or a Permission tier that does not allow it. A call with no Sign-in is blocked before it becomes a Tool call, so it is not a Refusal (D-044). A Refusal caused by a Hidden object never confirms the object exists (D-005). Logged like any other Tool call (R-010).
Source: discovery.md R-003, R-004, R-010; journeys.md J-004, J-005; decisions.md D-005, D-013
Aliases: none
Relates to: a Tool call ends in at most one Refusal.

## Database error
The outcome of a Tool call whose Statement the Server sent but the Database rejected: a missing grant, a constraint violation, a timeout. Not a Refusal, which the Server decides before sending anything. Cleaned of any Hidden object's name before the Agent receives it (D-005); logged with its reason (R-010).
Source: discovery.md R-003, R-010; journeys.md J-005, J-006; decisions.md D-004, D-005
Aliases: none
Relates to: a Tool call ends in at most one Database error; it never also ends in a Refusal.

## Object
A table or a column of a table in the Database. Whether views and other schema items count is Q-020.
Source: discovery.md R-003, R-016; journeys.md J-003
Aliases: database object
Relates to: a Database holds many Objects; a table has many columns.

## Visible object
An Object the Agent may see and act on: inside the Boundary and on the Allow-list that arrives with the Tool call, or a Created object in the current Conversation. With no Allow-list or no Boundary, only Created objects are visible (D-012).
Source: discovery.md R-003, R-004, R-016; decisions.md D-009, D-012
Aliases: allowed object
Relates to: the set of Visible objects is decided per Tool call, from the Deployment's Boundary, the Allow-list arriving with that call, and the Conversation's Created objects; two Staff members on one Deployment may see different sets.

## Hidden object
Any Object that is not a Visible object. Never appears in anything the Agent receives.
Source: discovery.md R-003, R-004; decisions.md D-005
Aliases: none
Relates to: the complement of Visible objects within the Database.

## Boundary
The Server setting that bounds which Objects could ever be visible — for example, included schemas and excluded tables. Set by the Operator; changing it needs a redeploy. Not the Allow-list, which narrows within it.
Source: discovery.md R-003, R-017; journeys.md J-001, J-003; inputs interview answer 19
Aliases: ceiling, server ceiling, visibility boundary
Relates to: a Deployment has exactly one Boundary (possibly unset); every Allow-list it receives is narrowed to it.

## Allow-list
The tables and columns, within the Boundary, that the Organisation admin makes visible. Kept in Managed client configuration (D-011), arriving with each Tool call, and treated by the Server as untrusted narrowing input (D-009). The Server stores none. Changes without a redeploy.
Source: discovery.md R-003, R-017; journeys.md J-003, J-006; decisions.md D-009, D-011
Aliases: allowlist, whitelist, client allow-list, table allowlist
Relates to: one Allow-list per Managed client configuration; a Deployment may receive several different Allow-lists from different AI tools or groups, and applies each to the Tool calls it arrives with.

## Managed client configuration
The settings an Organisation admin pushes to Staff members' AI tools and that Staff members cannot edit. Holds the Allow-list. Whether target AI tools offer it is Q-015.
Source: discovery.md R-017; journeys.md J-003; decisions.md D-011; questions.md Q-015
Aliases: client config, admin-managed client config
Relates to: an organisation has one or more Managed client configurations per AI tool (for example, one per group); each holds one Allow-list.

## Created object
An Object a Typed tool creates during a Conversation. Visible in that Conversation — including when the chat is reopened later (D-025) — and nowhere else, until the Organisation admin adds it to an Allow-list, after which it is visible to Tool calls carrying that Allow-list; its creation response says so.
Source: discovery.md R-016; journeys.md J-006
Aliases: temporary table, session object
Relates to: a Created object belongs to exactly one Conversation until added to an Allow-list.

## Server setting
A setting the Operator owns, set in the Deployment: Database account and connection, Identity provider, Permission tier, Redaction, Row limit and Boundary. Nothing a Staff member sends can change one, and no Allow-list can widen one.
Source: discovery.md R-017; inputs interview answer 22
Aliases: operator setting, operator-owned setting
Relates to: a Deployment has one value for each Server setting.

## Permission tier
The Server setting that decides which Typed tools a Deployment offers, from an ordered set: read-only; read and write; read, write and delete; full (adds schema changes). Each includes those below it. Read-only when unset (D-019). Not the Database account's grants, which cap it.
Source: discovery.md R-007, R-008; journeys.md J-001, J-009; decisions.md D-004, D-019
Aliases: permission level, access level, authorization level
Relates to: a Deployment has exactly one Permission tier.

## Row limit
The Server setting capping how many rows an Agent-written query returns.
Source: discovery.md R-015; journeys.md J-004; decisions.md D-003
Aliases: max rows, result limit
Relates to: a Deployment has exactly one Row limit; each Agent-written query is subject to it.

## Cut-short result
The result of an Agent-written query that reached the Row limit, flagged as such to the Agent (D-010). Whether the Staff member is told depends on the AI tool.
Source: discovery.md R-015; journeys.md J-004; decisions.md D-010
Aliases: truncated result, partial result
Relates to: an Agent-written query yields at most one Cut-short result.

## Redaction
The Server setting deciding whether literal values are kept or replaced in the SQL an Audit record holds — Statements run and the submitted SQL of a refused Agent-written query alike — and in the Typed tool inputs it records (D-028). On by default (D-007). Never applies to the Request text.
Source: discovery.md R-011; journeys.md J-007, J-008; decisions.md D-007
Aliases: masking
Relates to: a Deployment has one Redaction setting; it applies to every Audit record.

## Audit record
The record a Tool call leaves on the Host: Staff member identity; Request text; for a Typed tool, which tool was called and the inputs it was given; every Statement the call ran — or, for a refused Agent-written query, the SQL it submitted — (all subject to Redaction), the outcome (row count, Refusal reason or Database error reason), and timing. Server statements issued during the call are not included (D-026). Never contains result rows.
Source: discovery.md R-010, R-011; journeys.md J-008; decisions.md D-006
Aliases: log entry, audit log entry
Relates to: each Tool call has exactly one Audit record; Audit records stay on the Host. How long they are kept is Q-010.

## Security material
The project's own description of what the Agent can see, what it can run, who can call it, and what is logged, written for the Security reviewer and grown with each slice (D-014). Must disclose what the Server does not enforce: the lock on Managed client configuration, that different AI tools or groups may carry different Allow-lists, and Request text logged as received.
Source: discovery.md R-011, R-014, R-017; journeys.md J-007; decisions.md D-014
Aliases: reviewer material, security documentation
Relates to: one body of Security material per Server release.

# Critique findings

Gate 1, 2026-10-10, critique in fresh context. Verdict: fail (2 blockers, 5 gaps, 2 nits).

- **blocker — Statement, Tool call and Audit record contradict each other on cardinality.** The Audit record holds one Statement while a Typed tool may issue several; a refused Agent-written query is never sent to the Database, so it is not a Statement, yet the Audit record must hold it.
- **blocker — "one Allow-list per Deployment" is a cardinality the Server cannot have.** Under D-009/D-011 the Server applies whatever list arrives with each call; different AI tools or groups can present different lists to one Deployment.
- **gap — Server statement excludes metadata lookups made while serving a Tool call** (for a Query check or Typed tool), leaving them outside R-004's permitted kinds.
- **gap — no term for a Tool call the Database itself rejects** (missing grant, constraint violation); D-005's error cleaning attaches only to Refusals.
- **gap — Sign-in has a start but no end** (expiry, sign-out, account removed in the Identity provider).
- **gap — Conversation's end is ambiguous for a resumed chat.**
- **gap — Host mixes the cloud provider with the operator's own runtime environment.**
- **nit — Server's Aliases says nothing about "MCP"/"MCP server".** **nit — Analyst's definition omits "developers".**
Revision 2, 2026-10-10. Product-owner answers 30–31 recorded as D-024 and D-025; Q-004 re-routed to the PRD by the router.

- Statement/Audit cardinality → Statement is SQL actually sent; a refused Agent-written query becomes no Statement but its submitted SQL is recorded; a Typed tool produces zero (refused) or one-or-more Statements; the Audit record holds every Statement the call ran.
- Allow-list cardinality → the Server stores none; each Tool call carries the Allow-list from its Managed client configuration; one Deployment may receive several; Visible objects are decided per Tool call. Security material must disclose that Staff members may see different Objects.
- Server statement → now includes catalog lookups made while serving a Tool call, not recorded as the call's Statements (D-026).
- Database rejections → new term Database error, distinct from Refusal, carrying D-005's cleaning; Tool call has three outcomes.
- Sign-in end → lasts the Identity provider's issued lifetime (D-024).
- Resumed chat → same Conversation (D-025); Created object follows.
- Host → the Operator's own runtime environment and its attached log facility, not the cloud provider at large.
- Nits → Server's Aliases note covers "MCP"; Analyst names developers.
Gate 2, 2026-10-10, critique in fresh context. Verdict: fail (2 blockers, 1 gap, 4 nits). All gate-1 findings confirmed resolved.

- **blocker — a Tool call requires a Staff member, but a no-Sign-in Refusal has none,** yet it is "logged like any other Tool call". The audit schema would either drop unsigned attempts or leave the gap undecided.
- **blocker — Redaction covers "Statements only", but a refused Agent-written query's SQL is not a Statement,** so with Redaction on its literals would be logged, breaking R-011. Introduced by revision 2's narrowing of Statement.
- **gap — the Audit record does not name the Typed tool called or its inputs;** a refused write aimed at a Hidden object leaves no trace of what or where (J-008 step 1).
- **nits —** Database error is defined as a Tool call rather than an outcome; Created object still reads as if there were one Allow-list; Identity provider cites Q-006 for "exactly one", which Q-006 does not ask; Server setting does not reject "operator setting".
Revision 3, 2026-10-10. No owner input needed; rework count had reached two, and the owner directed the fixes (and, for the retro, D-029).

- Unsigned calls → a Tool call has zero or one Staff member, zero only when refused for lack of Sign-in; its Audit record carries a "not signed in" mark (D-027).
- Redaction → now covers all SQL an Audit record holds, including a refused query's submitted SQL, and Typed tool inputs (D-028).
- Audit record → now names the Typed tool called and its inputs.
- Nits → Database error is an outcome; Created object reads against any Allow-list; Identity provider cites D-015 for "exactly one"; Server setting rejects "operator setting" and "operator-owned setting".
Gate 3, 2026-10-10, critique in fresh context. Verdict: pass (0 blockers, 0 gaps, 4 nits). All gate-2 findings confirmed resolved; no new contradictions.

- **nit —** Staff member and Agent read as if every Tool call has a Staff member; D-027 and the Audit record settle the unsigned case.
- **nit —** the Audit record says Statements the call "ran", while a Statement is SQL "sent"; a Database error was sent but did not succeed. R-010's "executed or attempted" settles the intent.
- **nit —** the Source lines of Audit record and Redaction omit D-026, D-027 and D-028, which their definitions use.
- **nit —** bare "query" has no note on Statement's Aliases line; later phases should write Statement for any SQL and Agent-written query only for the agent's SELECTs.
Amendment, 2026-10-11, at the PRD gate, directed by the product owner (D-044, superseding D-027). Not re-gated, at the owner's choice.

- Unsigned calls → a call with no Sign-in is blocked, is not a Tool call, and leaves no Audit record. Tool call now always has exactly one Staff member. Refusal no longer lists no Sign-in as a reason. Audit record drops the "not signed in" mark.