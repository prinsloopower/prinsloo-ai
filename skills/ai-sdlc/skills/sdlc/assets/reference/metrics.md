# The record an iteration leaves

What is measured, what a reflection carries, and what a proposal must rest on.
Read by the router, which writes the metrics line, and by the two steps that
read across an iteration.

One JSON line per completed phase in `metrics.jsonl`, written by the script at
the gate:

```json
{"iteration":1,"phase":"prd","slice":null,"gate":"pass","duration_s":412,
 "rework_count":1,"defects_found":3,"output_bytes":9140}
```

Every field is measured. `duration_s` is wall clock between `next` and `gate`,
minus any span marked `wait` in between — the phase's own working time, not
the time spent waiting on the human to answer, approve, or merge something.
`wait` is closed by whatever call comes next, so nothing has to mark a resume;
a phase that never calls `wait` gets the older, uncorrected figure, which is
cycle time rather than process time and says so nowhere but here.
`rework_count` is how many times this phase has been sent back; `defects_found`
counts the blockers and gaps its gate wrote into the artifact, whichever phase
introduced them; `output_bytes` is the size of what it produced.

There is no token count, because nothing in the pipeline can observe one. A
figure a model writes about its own consumption is invented, and this register
exists to be the thing `improve` argues from. Where a real number is available —
a cost readout, an orchestrator's usage log — pass it as `--tokens` and it is
recorded as `tokens_source: human-reported`, so a later reader can tell the
measured fields from the supplied one.

**Proposals** in `proposals/` are `##` sections carrying `Target:`, the file and
the part of it being changed, and `Recurrence:` — the
reflection headings, verbatim, that this change answers. The lint counts how many
distinct iterations each named observation appears under and rejects a proposal
resting on fewer than two — unless `Recurrence:` instead reads `human-authorized`,
immediately followed by a `Quote:` line giving what the person said. That is the
one substitute for the count, not a way around having one: a model does not write
those two lines on its own initiative, and a `human-authorized` proposal with no
`Quote:`, or a quote that is not the person's own words, fails the same as a
citation with too few iterations. This is the blocking gate's own `by: human` +
`--quote` shape, for the same reason — a proposal resting on one occurrence is
still allowed, but only on the record of a person choosing that, never on a
model's judgement that they would have agreed. They also carry `Diff:`, the change itself rather than a description of it, and
`Eval:`, the result of running the target skill's evaluation before and after.

**Reflections** in `reflections.md` are `##` observations, each carrying
`Evidence:` — the metrics figure, finding, or `Q-###` it rests on. A recurring
pattern keeps the name it had in the previous iteration: recurrence is what
separates a process problem from a bad week, and it can only be counted if the
name is stable.
