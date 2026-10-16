# Checklist — slice-spec

The presence of `Delivers:`, a `Verified by:` on every task, rejected domain
names, and sentences copied from upstream are checked by the lint script. You
check what it cannot.

1. **Delivers that is not observable.** Read the `Delivers:` line. Could a person
   outside the system tell whether it happened? *"The session API is available"*
   is not observable; *"an account holder can end a session they no longer
   trust"* is. A slice whose delivery cannot be seen from outside is a `blocker`
   — the human verification gate at the end has nothing to verify.

2. **Vertical in name only.** Does the slice cross every layer it needs, or does
   it stop at one? A slice that adds an endpoint no screen calls, or a screen
   with no data behind it, is a `blocker` however its `Delivers:` line is worded.

3. **States that are neither built nor deferred.** For every screen this slice
   touches, compare its `States:` line in the designs against what the slice
   builds and what it lists out of scope. A state in neither list is a `gap`, and
   it is the one that ships broken — designed, unbuilt, and undecided.

4. **Proven-by lines that cannot be run.** For each, could someone determine it
   is true or false without asking the author? *"Revocation works correctly"*
   cannot. Where a requirement carries a number, does the line carry it too? A
   requirement's number missing here is a `gap`: it will not be tested and the
   limit becomes aspirational.

5. **Tasks that are steps.** Name every task that describes an activity rather
   than an outcome — *write the controller*, *add validation*, *update the
   model*. A `gap`: a step cannot be verified, so its `Verified by:` line will
   either be invented or name a test that proves nothing.

6. **Verified-by that names the wrong test.** Once the slice is built the lint
   confirms each named test exists, so a fabricated name cannot survive. What it
   cannot judge is whether the test proves the task: does each name correspond to
   a line under **Proven by**, or has a test been named that would pass whatever
   the code did? A test that cannot fail is a `blocker` — it satisfies both the
   lint and the gate while proving nothing.

7. **System-level decisions made here.** Name anything settled in this slice that
   the next slice would also need — a naming convention, an error format, an
   authentication approach. A `blocker`: it belongs to the whole system, and
   deciding it inside one slice means the second slice decides it again,
   differently.

8. **Out of scope that hides a dependency.** For each deferred item, is anything
   in this slice unusable without it? A slice deferring the thing that makes it
   work is a `gap`, and the deferral usually means the slice was cut in the wrong
   place.

9. **Traces that the slice does not deliver.** For each `Traces:` reference, does
   this slice actually satisfy that requirement or journey, or merely touch it? A
   partial trace is a `blocker` — the requirement will be reported as covered and
   nothing downstream will look again.
