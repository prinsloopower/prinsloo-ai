# Checklist — design

Presence of `Traces:` and `States:` lines, and rejected domain names appearing in
screens, are checked by the lint script. You check what it cannot.

1. **Exits with nowhere to happen.** For every `Exits:` entry in
   the journeys, name the screen and the state that handles it. An exit
   with no designed state is a `blocker` — the journey says people leave there,
   and the build will ship a screen that has no answer for them.

2. **States that are labels.** For each state listed, does the artifact say what
   the person sees and what they can do next? *"error"* on a `States:` line with
   nothing describing it is a `gap`; the spec will turn it into a generic
   message and consider the case handled.

3. **Empty states that are blank.** Name every empty state that shows an absence
   rather than an explanation. First use of a product is almost entirely empty
   states, so this is a `gap` and usually a significant one.

4. **Adjectives standing in for tokens.** Name every style value that cannot be
   implemented as written — *calm green*, *generous spacing*, *a modern
   typeface*. A `blocker`: the build will choose, and nobody will know a choice
   was made.

5. **Focus and contrast.** Is there a focus style, and is it distinguishable from
   hover? Are contrast ratios stated for text tokens? Absent focus styling is a
   `blocker` — the default implementation removes the browser outline for looks
   and ships a keyboard trap.

6. **Destructive actions.** Name every action that cannot be undone. For each,
   does the design confirm, name what is being acted on, or offer a way back?
   Missing is a `gap`.

7. **Copy that has not been written.** Name every place where the design says
   *an appropriate message* or leaves placeholder text. Error and empty-state
   wording is design work, and deferring it to the build means it will be written
   by whoever is holding the keyboard — `gap`.

8. **Screens tracing nothing.** Name every screen whose `Traces:` line points at
   no journey the PRD put in scope. A screen nobody asked for is a `gap` and will
   be built.

9. **Mechanism.** Name any framework, component library, or CSS approach named
   here. That is the architecture phase's decision, and naming it here hands it
   over as a given — `blocker`. A genuine constraint (*must sit inside the
   customer's existing design system*) is fine; the implementation of it is not.
