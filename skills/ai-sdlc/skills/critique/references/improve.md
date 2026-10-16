# Checklist — improve

Recurrence across two iterations is counted by the lint script. You check what it
cannot, before a person is asked to approve anything.

1. **The same name, a different problem.** For each proposal, read the
   observations it cites in both iterations. Do they describe the same failure,
   or has one heading been reused for two unrelated things? A conflated
   recurrence is a `blocker`: it manufactures the evidence the rule requires.

2. **A change that does not answer the observation.** For each proposal, trace
   the diff to the problem. Would this change have prevented what was recorded?
   A `blocker` — the observation is real and the fix addresses something else,
   which leaves the problem in place and the process larger.

3. **Diffs that are descriptions.** Name every proposal whose `Diff:` paraphrases
   a change rather than stating it. A `blocker`: the human approves plausibility
   and someone later writes something different.

4. **Evaluations that could not have failed.** For each `Eval:`, do the cases
   exercise the behaviour the diff changes? Identical before-and-after scores on
   cases unrelated to the change prove the change was harmless, not that it
   helped. `gap`.

5. **Growth without removal.** What is the net line change across all proposals?
   If it is positive and nothing is proposed for removal, is there a stated
   reason? A `gap`, and the one that compounds — every iteration that only adds
   makes every later run more expensive.

6. **Rules built from one incident wearing two names.** Name any proposal whose
   two cited observations come from the same underlying event recorded twice.
   `blocker`.

7. **Removing a gate that works.** For any proposal removing a check or a gate,
   what did it catch across the iterations? A gate with few findings that caught
   one expensive defect is earning its cost. Removal on volume alone is a `gap`.

8. **Changes to a check that reported something unwelcome.** Name any proposal
   altering a check where the evidence is a finding the author disagreed with
   rather than a pattern across iterations. `blocker` — this is the failure mode
   that turns a set of checks into a set of preferences.

9. **Answered at the wrong layer.** For each proposal, could this have been a
   check in a lint script instead of a checklist item, or a checklist item
   instead of prose in a skill? A rule placed a layer higher than necessary is a
   `gap` — it costs model attention or context on every run to do what a script
   would do for nothing, and that cost is paid for as long as the rule exists.

10. **Cost if wrong.** Does each proposal state it, and is it honest? A proposal
   claiming no downside has not been thought through; every process change trades
   something.
