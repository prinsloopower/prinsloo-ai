## Q-001 — Must both engines work on all three clouds?
Raised by: discovery | Blocks: architecture
Running on Cloudflare may limit which databases the server can reach directly, especially MS SQL Server. Concerns R-001 and R-002.
Answered (conditionally) by the product owner, interview answer 29: see D-020. Architecture still establishes feasibility.

## Q-002 — Is the agent's own account of the question acceptable as the logged natural-language request?
Raised by: discovery | Blocks: architecture
The server sees tool calls, not what the person typed. Concerns R-010.

## Q-003 — What counts as a typical question and a correct answer, and who supplies the representative set?
Raised by: discovery | Blocks: prd
Concerns R-012.

## Q-004 — Who writes the semantic model, and does the project help keep it in step with the allow-list?
Raised by: discovery | Blocks: prd (re-routed from domain by the router, 2026-10-10: no domain term depends on the answer; it is a scope question alongside Q-005)
Concerns R-003 and R-006.

## Q-005 — Do semantic models ship with the project, or does each operator write their own?
Raised by: discovery | Blocks: prd
Concerns R-006 and R-013.

## Q-006 — Which identity providers must sign-in support at first release?
Raised by: discovery | Blocks: architecture
Concerns R-009.

## Q-007 — Is there any figure for the cost of the analyst queue?
Raised by: discovery | Blocks: prd
Concerns R-012.

## Q-008 — Which schema changes are in scope for the DDL tools?
Raised by: discovery | Blocks: prd
Concerns R-005 and R-007.

## Q-009 — Is one deployment connected to one database, or several?
Raised by: discovery | Blocks: architecture
Concerns R-002 and R-007.

## Q-010 — Must audit records be retained on the host for a set period?
Raised by: discovery | Blocks: system-spec
Shipping is answered: records stay on the host (answer 13). Retention is not. Concerns R-010.

## Q-011 — Is there a framework security reviewers will check against?
Raised by: discovery | Blocks: system-spec
Concerns R-014.

## Q-012 — Which AI client and model is answer correctness measured with?
Raised by: discovery | Blocks: prd
Answer quality depends on the client's model and the semantic model, not only the server. Concerns R-012.

## Q-013 — May the agent create an object outside the server's visibility boundary?
Raised by: discovery | Blocks: prd
If so, it is visible for the conversation (R-016) but no allow-list could ever make it visible later. Concerns R-003 and R-016.

## Q-014 — How does the server tell one conversation from the next?
Raised by: discovery | Blocks: architecture
A connection may span many chats or drop mid-chat. Concerns R-016.

## Q-015 — Do the target AI tools have admin-managed configuration that can carry an allow-list to a remote server?
Raised by: journeys | Blocks: architecture
D-011 places the allow-list in admin-managed client configuration. If Claude, ChatGPT or Copilot (interview answer 2) offer no channel for an admin to pass it to a remote MCP server, J-003 cannot complete for that tool. Concerns R-003, R-017, J-003.

## Q-016 — Does the person asking approve a write, delete or schema change before it runs?
Raised by: journeys | Blocks: prd
Nothing in the discovery document says. Without it, a misunderstood instruction changes data with no chance to stop it (J-005 exits). Concerns R-005, J-005, J-006.

## Q-017 — Does the project give the organisation admin a way to see the names inside the boundary?
Raised by: journeys | Blocks: prd
The agent cannot show hidden objects, so to write an allow-list (J-003) the admin needs another view of the schema — their own database tools, or something the project provides. Concerns R-003, R-017, J-003.

## Q-018 — Is query data passing to the AI tool's provider in scope for this product to address?
Raised by: journeys | Blocks: prd
Results the server returns go to whichever AI provider the client uses, outside the organisation. A reviewer may reject on that alone (J-007). Is it a stated non-goal, a disclosure in the reviewer material, or something the product mitigates? Concerns R-014, J-007.

## Q-019 — Can the target AI tools complete sign-in against the organisation's identity provider?
Raised by: journeys | Blocks: architecture
MCP clients (Claude, ChatGPT, Copilot) commonly expect what some enterprise identity providers do not offer, such as dynamic client registration. If a client cannot complete sign-in, J-002 and J-004 stop for that tool. Concerns R-009, J-002, J-004.
## Q-020 — Do views (and other schema items such as functions) count as Objects?
Raised by: domain | Blocks: prd
Upstream speaks only of tables and columns. Reporting databases often expose data through views; whether the Boundary and Allow-list can name them, and whether the Query check treats them as Objects, changes what Staff members can ask. Concerns R-003, R-004.