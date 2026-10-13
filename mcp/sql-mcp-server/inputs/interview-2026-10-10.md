# Discovery interview — product owner, 2026-10-10

Multiple-choice answers given in the session. Recorded as chosen; nothing added.

1. **Who deploys and runs the server?** Open-source / self-host. Published for
   anyone to deploy themselves; the operator is an engineer working from the docs.
2. **Who sends the natural-language questions?** Non-technical business staff
   (managers, analysts, ops people) using AI tools such as Claude, ChatGPT, Copilot.
3. **What do they do today, and what does it cost?**
   - Wait on analysts / developers: business staff file requests and wait for
     someone who knows SQL; the cost is delay and analyst time.
   - Generic SQL MCP servers are too risky: they hand the agent raw SQL and the
     full schema, so security or compliance will not approve them.
   - No figures were given for either cost.
4. **What does "must not risk schema exposure" mean?** Only allowed objects are
   visible: the agent may see real table/column names, but only for tables and
   columns explicitly allow-listed; everything else is hidden.
5. **How much freedom may the agent have to write SQL when a semantic model is
   present?** Templates + free reads: writes go only through fixed, typed tools;
   the agent may write free SELECT queries over allowed objects, validated before
   they run.
6. **Are read/write/delete/DDL permissions per deployment or per user?** Per
   deployment: one setting for the whole instance; everyone signed in gets the
   same permission level.
7. **What has to be true at first release for this to be worth building?** All four:
   - Security review passes: a security/compliance reviewer at an adopting
     organisation would sign off on deploying it.
   - Answers are correct: business users get correct answers to typical questions
     without an analyst checking each one.
   - Deploys in under an hour: a self-hosting engineer gets it running in their
     cloud from the docs alone.
   - Full audit trail: every question and every query run can be traced to the
     person who asked it.
8. **What may the logs contain?** User identity, the natural-language request, the
   SQL that ran, row counts and timing — never result data.

## Round 2 (same day, after the first discovery gate)

9. **Values reused from earlier results appear as literals in logged SQL — how is
   that handled?** "Configurable, not set by the user asking the NL questions."
   (Free-text answer: the operator decides; the person asking cannot.)
10. **What shape do the permission settings take?** Fixed tiers, ordered:
    read-only < read + write < read + write + delete < full (including DDL).
11. **Should the server know about semantic models?** No — free reads always on.
    The server does not know about semantic models; free SELECTs over allow-listed
    objects are allowed whenever reads are; the semantic-model skill only helps the
    agent write better queries.
12. **Where does the one-hour deployment bar end?** When the server is deployed in
    the engineer's cloud, connected to the database, and reachable. Identity-provider
    and allow-list setup may take longer.

## Round 3 (same day, after the second discovery gate)

Free-text answers, verbatim where quoted.

13. **May audit records be shipped out of the deployment (e.g. to a SIEM)?**
    "Log exports stay on the host."
14. **Should refused attempts (e.g. a query touching a hidden table) be logged with
    who tried?** "Yes."
15. **At the full tier, can the agent see a table it has just created?** "Yes, all
    new objects created via the MCP should be visible to the MCP, but only for that
    conversation. A message should be presented that the objects should be added to
    the allowlist."
16. **Should agent-written reads have row/time limits, and concurrency limits?**
    "Row limits, configurable." (Time and concurrency limits not asked for.)
17. **Can the server run its own metadata and health-check queries?** "Yes."
18. **Unprompted:** "Table allowlist should be configurable at the client level
    rather than the server so that new objects can be created via the MCP without
    redeploying the MCP to the cloud. Let's clarify the types of configuration
    options and define which are client-level and server level."
19. **How should the allow-list work, given anything client-side can be changed by
    whoever runs the client?** Server ceiling, client narrows: the server holds a
    broad boundary (e.g. included schemas, excluded tables); the client allow-list
    picks objects within it. New tables inside the boundary need no redeploy;
    nothing outside it is ever visible, whatever the client says.
20. **Whose client config holds the client-level settings?** Admin-managed client
    config: an organisation admin pushes it to users; end users cannot edit it.
21. **Who sets the row limit?** Server only: one limit set by the operator for the
    whole deployment.
22. **Configuration split proposed in the session and not contested:** server-level —
    database connection and credentials, identity-provider settings, permission tier,
    literal redaction in logs, log destination, row limit, allow-list ceiling;
    client-level (admin-managed) — allow-list within the ceiling; client-side skill —
    semantic model; server-tracked per conversation — objects created in it.

## Round 4 (same day, at the discovery hold)

23. **Can typed write, delete and schema-change tools act on objects the agent
    cannot see?** No — same visibility rule: typed tools act only on objects the
    agent can see (boundary ∩ allow-list, plus objects created this conversation);
    anything else is refused without confirming it exists.
24. **With redaction on, is the logged natural-language request also redacted?**
    SQL only; disclose it: redaction applies to SQL literals only, and the project's
    docs state clearly that request text is logged as received.

## Round 5 (same day, at the second journeys gate)

25. **Who counts as staff allowed to use the server once sign-in works?** Every
    account in the provider: anyone the organisation's identity provider
    authenticates, including guest and external accounts.
26. **When the agent makes a wrong change, what protects the person?** Nothing
    beyond the tier: no extra safeguard; recovery is the organisation's own backups
    and the audit record.
## Round 6 (same day, at the journeys hold)

27. **Is a public HTTPS endpoint the deployment model?** Public, private also
    supported: public by default, but a private-network deployment is also
    supported for desktop or self-hosted clients inside the organisation's network.
28. **What tier does a deployment get if the operator does not set one?** Read-only.
## Round 7 (same day, after journeys passed)

29. **Q-001 — must both engines work on all three clouds?** "If SQL doesn't run on
    Cloudflare, remove that requirement." Clarified: just that combination —
    Cloudflare stays supported for PostgreSQL; MS SQL Server is then supported on
    AWS and Azure only.
## Round 8 (same day, at the first domain-model gate)

30. **When someone is removed or disabled in the identity provider, how quickly must
    they lose access?** Provider's own policy: whatever lifetime the organisation's
    identity provider issues; the server does not set one.
31. **A staff member reopens yesterday's chat — are tables they created in it still
    visible?** Yes, same chat = same: a resumed chat is the same conversation;
    created objects stay visible in it for as long as the chat exists.