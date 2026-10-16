# Checklist — journeys

Presence of `Traces:` and `Exits:` lines is checked by the lint script. You check
whether they hold up.

1. **Screen flows wearing journey clothes.** Name every journey whose steps are
   places in the interface rather than things a person does or decides. A journey
   with no decision point in it has not found the part that matters — `blocker`,
   because design and slicing both inherit a flow with nothing to design.

2. **Exits that are system behaviour.** An exit is what the person does when they
   do not get what they came for. *"Displays an error"* is not an exit; *"tries
   twice, then calls support"* is. Name every exit written from the system's side
   — `gap`, because the spec will implement an error message and call the path
   handled.

3. **The exit that is missing.** Name the way this journey most commonly fails in
   the real world, for the population described in `discovery.md`. If it is not in
   the artifact, that is a `gap` — and it is usually the one that decides the
   support burden.

4. **Traces that do not exercise.** For each `Traces:` reference, does the journey
   actually exercise that requirement, or has it been cited because it is
   topically related? A journey citing a requirement it never touches is a
   `blocker`: the lint will report that requirement as covered, and nothing
   downstream will look again.

5. **Sliceability.** Name any journey that could not be built, deployed, and put
   in front of a person as one vertical slice. Say whether it is too large — an
   epic — or too small to deliver value alone. Wrong granularity here is a `gap`
   the slicing phase inherits and usually cannot fix without coming back.

6. **Silent dependencies.** Name everything the journey assumes about the world
   outside the product — mail arrives, the person has their phone, an account
   already exists, they read the language. Anything not on a `Depends on:` line
   is a `gap`; these are where integrations break and where architecture finds
   surprises late.

7. **Naming drift.** Name any concept called something here that
   the discovery document — or the domain model where it exists — calls something
   else. A renamed concept is a `blocker`, because every later artifact inherits
   the ambiguity and someone eventually has to decide whether the two names were
   the same thing.
