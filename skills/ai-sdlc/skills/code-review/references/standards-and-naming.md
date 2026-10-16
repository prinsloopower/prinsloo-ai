# Review axis — standards and naming

You are checking whether this code belongs in this codebase. You are not checking
whether it does the right thing; another reviewer has that.

Answer every item. An item left unanswered is recorded as a `gap`.

1. **Documented standards.** Where the repository states its conventions — a
   contributing guide, a linter configuration, an editor config — name every
   place the diff departs from them. A documented standard broken is a `gap`;
   broken silently and repeatedly is a `blocker`, because the standard stops
   being one.

2. **Undocumented conventions.** Where nothing is written down, read the code
   around the change. Name every place the diff does something differently from
   its neighbours for no stated reason — error handling, module layout, how
   things are named, how tests are arranged. `nit` individually; a `gap` when the
   diff reads as though it came from a different codebase.

3. **Domain names.** Do modules, classes, functions, tables and columns use the
   terms in the domain model? Name every use of a term the domain model rejected,
   and every concept given a name that model does not have. A `blocker`: the lint
   checks the documents for drift but not the code, and a column name outlives
   every document in this pipeline.

4. **Names that mislead.** Name every identifier whose name and behaviour
   disagree — a `get` that writes, a `validate` that mutates, a plural holding
   one thing. `gap`, and the cost lands on whoever trusts the name instead of
   reading the body.

5. **Duplication introduced.** Name anything the diff adds that already exists in
   the codebase. `gap` — two implementations diverge, and the second one is
   usually the one nobody updates.

6. **Errors swallowed.** Name every place an error is caught and discarded,
   logged and continued, or converted into a default. Where that is deliberate,
   is it stated? Silent recovery is a `blocker`: the system continues in a state
   nobody designed.

7. **Secrets and logging.** Name every value written to a log that the system spec
   says must never be logged, and every credential, token, or key appearing in
   source. A `blocker`, always.

8. **Comments that will become false.** Name every comment restating what the
   code does rather than why. `nit` — but flag any comment describing behaviour
   the diff has already changed as a `gap`.
