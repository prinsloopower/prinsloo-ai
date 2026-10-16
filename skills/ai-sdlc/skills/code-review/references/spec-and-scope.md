# Review axis — spec and scope

You are checking whether the diff does what the slice promised, and nothing
besides. You are not checking style; another reviewer has that.

Answer every item. An item left unanswered is recorded as a `gap`.

1. **Delivers.** Read the slice's `Delivers:` line and trace the path through the
   diff that makes it true — from the entry point to the data and back. Any part
   of that path missing is a `blocker`.

2. **Tasks against code.** For each `T-###`, find the code that satisfies it.
   Name any task with no corresponding change — `blocker`.

3. **Tests that cannot fail.** For each test named on a `Verified by:` line, read
   it. Would it fail if the behaviour it names were wrong? A test asserting a
   truism, asserting on a mock it configured, or asserting only that no exception
   was raised is a `blocker`. The lint has already confirmed these tests exist;
   existence is not the question.

4. **Proven by, unproven.** For each line under **Proven by**, name the test that
   establishes it. Where a requirement carries a number, does the test assert the
   number or merely the behaviour? An untested limit is a `gap` and becomes an
   aspiration.

5. **Error paths.** For each state the slice claimed to build, find it in the
   code. A state designed, listed as in scope, and absent from the diff is a
   `blocker` — it will render as an exception or an empty screen.

6. **Changes that trace to nothing.** Name every changed file or function that no
   task in this slice asked for. Refactoring done in passing, reformatting of
   adjacent code, and improvements to things that were not broken are each a
   `gap`: they enlarge the diff a human must verify and hide the change that
   matters.

7. **Decisions taken silently.** Name every place the code answers a question the
   spec left open — a default value, an ordering, a timeout, an error format. Is
   there a `Q-###` or a `D-###` for it? Unrecorded is a `gap`, and this is how a
   system and its specification diverge one sensible choice at a time.

8. **Scope belonging to the system.** Name anything decided here that the next
   slice will also need. A `blocker`: the next slice will decide it again,
   differently, and both will be defensible.
