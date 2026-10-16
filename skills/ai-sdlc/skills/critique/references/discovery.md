# Checklist — discovery

ID uniqueness, trace coverage, and staleness are checked by the lint script. Do
not spend attention on them.

Answer each item. Items 1–4 ask you to *name something*; "none" is a valid
answer only after you have actually looked.

1. **Solutions smuggled in as requirements.** Name every requirement that states
   a mechanism rather than a need. *"Users authenticate via OAuth"* is a
   mechanism; *"users sign in without creating a new password"* is a need.
   Mechanism in a requirement is a `blocker` — it removes a decision the
   architecture phase should be making with reasons on the record.

2. **Requirements a stranger cannot test.** For each requirement, state the
   observation that would show it unmet, as someone who was not in the discovery
   conversation. A requirement with no such observation is a `blocker`.

3. **Conflicting pairs.** Name any two requirements that cannot both be
   satisfied, or that trade off against each other with no stated priority.
   Unstated priority between conflicting requirements is a `blocker`.

4. **Source laundering.** The lint checks that a `Source:` line exists. You check
   whether it holds up. For each requirement, does the cited material actually
   support it, or has an inference been dressed as a citation? A ticket volume
   showing people contact support about logins does not establish *why*. An
   inference attributed to a real source is a `blocker` — it is strictly worse
   than `assumed`, because it has laundered an assumption into evidence and no
   later phase will question it.

5. **Assumed requirements carrying weight.** List the requirements sourced
   `assumed`. Name any that a later phase will build something expensive on. Those
   need confirming before they are built on, not after — `gap` unless a `Q-###`
   already flags them.

6. **Problem statements.** Each names who has the problem and what it costs them.
   A problem statement with no cost attached cannot be prioritised against
   another; missing cost is a `gap`.

7. **Scope of the artifact.** Requirements describe the product, not the project.
   Delivery dates, team structure, and budget are not requirements.
