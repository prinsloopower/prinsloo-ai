# Checklist — slices

`Delivers:` and `Traces:` on every slice, full coverage of requirements and
journeys, and `After:` ordering are checked by the lint script. You check what it
cannot.

1. **Layers wearing slice clothing.** Read each `Delivers:` line. Does it name
   something a person can do, or something a developer can build? *"The session
   API is in place"* is a layer. A layer is a `blocker`: nothing can be verified
   at the end of it, and the pipeline's verification gate has nothing to open.

2. **Delivery that is not the whole path.** For each slice, walk it from the
   screen to the data and back. Does every part exist by the end of the slice, or
   does one end wait for a later one? A slice whose front end has no data behind
   it is a `blocker` however its `Delivers:` line reads.

3. **Deferrals with no reason.** For each ID on a `Deferred:` line, is there a
   reason, and where the decision was not the model's, a `Q-###`? A bare ID is a
   `gap` — indistinguishable from something dropped by accident, which is exactly
   what the line exists to prevent.

4. **Deferrals that break what ships.** For each deferred requirement, is any
   slice unusable without it? Deferring the confirmation email while shipping the
   sign-up that sends it is a `blocker`.

5. **Slices too large to deploy.** Name every slice that could not plausibly be
   built, deployed, and put in front of a person in one go. Size is a `gap` here
   and a crisis later: an oversized slice is discovered mid-build, when splitting
   it costs a rewrite of its spec.

6. **The first slice against the skeleton.** Does the first slice extend the path
   the walking skeleton already deploys, or open a new one? Starting somewhere
   the skeleton never reached is a `gap` — the first thing built is then also the
   first thing whose deployment has never been tested.

7. **Sequencing that contradicts the PRD.** Where the PRD states what must work
   first, does the backlog order match? A silent reordering is a `gap`: the PRD's
   sequencing usually encodes a commercial or contractual reason that is not
   visible here.

8. **Ordering that is really coupling.** Name every pair of slices where each
   needs something from the other. That is not an ordering problem — the cut is
   wrong, and the pair is either one slice or two plus a third that comes before
   both. `blocker`.

9. **Partial journeys presented as whole ones.** Where a journey is split across
   slices, does the earlier slice's `Delivers:` say what a person still cannot do?
   Silence is a `gap`, and it is how a slice gets verified as complete against a
   journey it only half delivers.
