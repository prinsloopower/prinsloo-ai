# Checklist — domain

Presence of `Source:` and `Aliases:` lines, and rejected names reappearing
downstream, are checked by the lint script. You check what it cannot.

1. **Definitions that restate the term.** Name every definition that would teach
   nothing to someone who did not already know the word. *"Session: a user's
   session"* is the shape. This is a `gap` — every later artifact is written from
   these lines, and an empty definition means each phase supplies its own
   meaning.

2. **Homonyms left merged.** Name any single term that means two things in
   `discovery.md` or `journeys.md` — the record and the balance, the person and the
   login, the order and the order line. One word doing two jobs is a `blocker`:
   code will conflate them and the data model will encode the conflation.

3. **Synonyms left uncollapsed.** Name any two terms here that a reasonable
   reader could not tell apart. Two names for one thing is a `blocker` for the
   same reason in reverse — the system spec will model both.

4. **Imported vocabulary.** Name every term whose `Source:` is `assumed`. For
   each, does the upstream material actually need this concept, or has an
   industry-standard abstraction been imported because products like this usually
   have one? An unneeded `Tenant`, `Aggregate`, or `Policy` is a `blocker` — the
   architecture phase will build the abstraction the word implies.

5. **Sources that do not say it.** For each term, does the cited artifact
   actually use it, or has a term invented here been given a plausible citation?
   Same failure as source laundering upstream, and a `blocker` for the same
   reason: the lint reports the term as grounded and nothing looks again.

6. **Aliases claimed as none.** For each `Aliases: none`, search `discovery.md` and
   `journeys.md` for a competing word. An unfound alias is not merely missing —
   it disables the drift check for that term everywhere downstream. `gap`.

7. **Missing relationships and lifecycle.** Name every term with no stated
   cardinality to its neighbours, and every term with a lifecycle whose start and
   end are unstated. The data model in the system spec is built from these lines
   and will invent whatever is absent — `gap`.

8. **Names that are not the customer's.** Name any term that differs from the
   word the people in `discovery.md` actually use. Renaming the customer's vocabulary
   for internal tidiness is a `gap` and needs a `Q-###`, not a quiet decision.
