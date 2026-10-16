# Checklist — system-spec

`Traces:` on entities, and rejected domain names appearing anywhere, are checked
by the lint script. You check what it cannot.

1. **Entities nobody named.** For each entity, is its name a term in the domain
   model? An entity that is not is either a concept the domain model missed — a
   `blocker`, because the vocabulary is wrong and every later artifact inherits
   it — or a table serving an implementation choice, which is fine only if a
   `D-###` says so.

2. **Fields that decide policy.** Name every field encoding a rule that no
   requirement states — a status enum with values nothing asked for, a flag
   controlling behaviour never specified. A `blocker`: the build will implement
   the rule the schema implies.

3. **Deletion and retention.** For each entity, what happens when the person it
   belongs to leaves? An entity with no retention answer is a `gap`, and the
   answer is usually a legal obligation rather than a preference.

4. **Migrations against data that exists.** For each migration, does it assume an
   empty table? Anything already deployed — including the walking skeleton — has
   rows. `gap`.

5. **Variables with no source.** Name every variable whose origin is unstated, and
   every secret not marked as one. A `blocker` for secrets: unmarked, they end up
   in logs and in version control.

6. **Setup that has never been run.** Does the clean-checkout sequence exist as
   commands, and does the artifact say whether anyone has executed it? Untested
   setup instructions are a `gap` that costs every new person a day.

7. **Rules enforced only at the edge.** For each permission rule, is the
   enforcement point named, and is it behind the interface? *Enforced in the UI*
   is a `blocker` — the API is the system.

8. **Adjectives where numbers belong.** Name every limit, target, or expectation
   written as *fast*, *scalable*, *reliable*, or *reasonable*. A `gap`: nothing
   can be built to it and no test can check it — the same failure as a success
   metric with no number, one phase later.

9. **Logging that captures what it must not.** Is there a statement of what is
   never logged — credentials, tokens, personal data? Absent, it is a `gap`, and
   the default is to log the whole request object.

10. **Slice-level detail.** Name anything here that concerns one feature rather
    than the whole system. It is a `gap` in the wrong direction: it makes this
    artifact stale the moment that feature changes, and every slice pays to read
    it.
