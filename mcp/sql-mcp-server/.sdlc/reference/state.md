# State

What `state.json` holds and how an artifact's status moves. Written only by
`sdlc_lint.py`; read here by the router, which reports position from it.

```json
{
  "product": "acme-portal",
  "iteration": 1,
  "size": "product",
  "phase": "architect",
  "artifacts": {
    "discovery":       { "status": "approved", "hash": "sha256:a1b2…",
                     "gate": { "result": "pass", "by": "human", "at": "2026-07-27T10:00:00Z" } },
    "journeys":    { "status": "approved", "hash": "sha256:c3d4…", "gate": { … } },
    "prd":         { "status": "stale",    "hash": "sha256:e5f6…", "gate": { … } },
    "architecture":{ "status": "draft" }
  },
  "slices": [
    { "id": "S-001", "title": "Sign-in", "status": "deployed", "traces": ["R-001","R-004"] }
  ],
  "blocked_on": null,
  "open_questions": ["Q-003"]
}
```

**Artifact status:** `absent → draft → critiqued → approved`, plus `stale`.

**Slice status:** `planned → specified → built → reviewed → deployed → verified`. Checks
that only make sense against code — that a task's named tests exist — apply from
`built` onward, so a slice spec is not judged against code nobody has written.

**Nothing writes this file by hand.** `sdlc_lint.py next` says what runs now;
`sdlc_lint.py gate` records a result and advances. Every field it sets is a
measurement — an upstream hash, an elapsed time, a count of revisions — and a
model reporting a measurement is reporting a guess. Editing `state.json`
directly puts the pipeline in a state the script did not produce and cannot
verify.

**Staleness.** On a pass, the script records the hash of the phase's upstream
inputs. When an upstream file later changes, the hash no longer matches and the
artifact reads `stale`. Nothing sets `stale` by judgement, and nothing has to
remember to compute it.
