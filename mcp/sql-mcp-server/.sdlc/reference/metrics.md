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

Every field is measured. `duration_s` is wall clock between `next` and `gate`;
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
resting on fewer than two. They also carry `Diff:`, the change itself rather than a description of it, and
`Eval:`, the result of running the target skill's evaluation before and after.

**Reflections** in `reflections.md` are `##` observations, each carrying
`Evidence:` — the metrics figure, finding, or `Q-###` it rests on. A recurring
pattern keeps the name it had in the previous iteration: recurrence is what
separates a process problem from a bad week, and it can only be counted if the
name is stable.
