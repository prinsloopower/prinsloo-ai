# Review — S-001

Reviewed: commit 0febdeb (rework; slice diff 2fa9112..0febdeb) against the slice spec. This is a re-review after the hold recorded at the end.
Tests: `npm test` → first run 82 passed, 1 failed; second run 13 files, 83 passed, 0 failed. The failure was test/mcp.test.ts:51, the architecture skeleton's workerd cold-boot timeout, already raised as Q-024 and not slice code. `npm run typecheck` → clean.

Each axis ran in its own fresh subagent, and neither saw the other's findings. The reviewer checked every cited line against the code as it now stands, and also made an independent pass of its own over the rework diff.

**What the rework fixed.**
- Refresh tokens: a renewal the provider rotates keeps min(presented `exp`, provider lifetime) (src/signin/broker.ts:293), as D-071 decides. `refresh_rotation_keeps_original_expiry` renews at 10, 20 and 29 days and is refused at 30 d + 1 s.
- Provider body: the provider's body is read inside the 5 s limit (src/signin/identity-provider.ts:82).
- `localhost.`: it is now refused (src/signin/clients.ts:47). `localhost..` still parses, but it does not resolve (checked with Node's DNS lookup).
- Test fake: it follows redirects unless the caller asks for `manual`, so the no-redirect test now has teeth.
- Server faults during the callback: they show a 500 page and log `signin_error` without the error's text.
- Naming: the "IdP" alias has gone from src.
- Secrets: no new log line carries a secret.

## Previous findings

| # | Previous finding | Now |
|---|---|---|
| G1 | Renewed Refresh token restarts 30 days | resolved (D-071; broker.ts:293; test) |
| G2 | 5 s limit does not cover body | resolved (identity-provider.ts:82; `idp_body_stall_times_out`) |
| G3 | `localhost.` passes | resolved (clients.ts:47; test) |
| G4 | Redirect test cannot detect following | resolved (test/signin/helpers.ts:130; `cimd_does_not_follow_redirects`) |
| G5 | Rotation proven only at unit level | resolved (`signin_issued_before_rotation_still_reaches_mcp`) |
| G6 | Metadata-document client never taken through /token | resolved (`cimd_client_completes_token_exchange`) |
| G7 | Secrets-in-logs test omits code and ID token | resolved (`no_log_line_carries_code_or_id_token`) |
| G8 | Status-code decisions taken silently | accepted on record (D-070); spec Interface updated |
| G9 | Security material calls the code one-time | resolved (docs/security-material/sign-in.md:18) |
| G10 | `idp_refresh_exp` not in data-model.md | accepted on record (D-070) |
| G11 | Catch-all hides errors as refusals | resolved at the callback (broker.ts:212). The refresh half is untested (gap below) |
| G12 | Network failures logged as `status` | resolved (clients.ts:86) |
| G13 | "IdP" alias in source names | resolved in src. `h.idp` is accepted (D-070). `FakeIdp` remains (nit below) |
| N1 | `invalid_client` 401 vs spec 400 | resolved (spec Interface) |
| N2 | Keys fetched twice | resolved (identity-provider.ts:120) |
| N3 | Second sign-in voids first | accepted on record (D-070) |
| N4 | T-011 live outcome not recorded | not resolved (nit below; expected before deploy) |
| N5 | 60 s skew defined twice | resolved (src/signin/util.ts:6) |
| N6 | `config()` returns discovery | resolved (`discovery()`) |
| N7 | Three types named `Env` | resolved (`RuntimeVariables`) |
| N8 | `/mcp` two error shapes | accepted on record (D-070) |
| N9 | environments.md per-request wording | accepted on record (D-070, to be corrected at the next system-spec revision) |
| N10 | `.dev.vars.example` omissions | resolved |
| N11 | `idp_unreachable` for a provider that answered | resolved (`idp_invalid_response`) |
| N12 | Stale comment | resolved (src/app.ts:61) |

## gap — a provider that answers with an error no longer raises the alert
Where: src/signin/identity-provider.ts:95
Axis: both
A discovery or keys answer that is non-2xx or malformed now writes `idp_invalid_response`, not `idp_unreachable`. The only Identity-provider alert, docs/system-spec/operations.md:42, matches `idp_unreachable` alone, and D-070 adds the new event without amending that alert. `signin_error` has no alert either.
Consequence: a mistyped `IDP_ISSUER` or a provider answering 5xx used to alert, and now raises nothing. The 5xx-rate alert needs 20 requests, so it misses a quiet Deployment. The deployment slices will build their alerts from operations.md and inherit the hole.

## gap — a token-endpoint outage is treated as a refusal
Where: src/signin/identity-provider.ts:176
Axis: both
Any non-2xx answer from the token endpoint, including a 500 or 503 with an HTML body, becomes `IdentityProviderRefused("unknown_error")`. The rework's docstring (:23) now says that class means "answered with an OAuth error". A 2xx answer that is not JSON becomes `IdTokenInvalid`. Neither path writes `idp_invalid_response`, although spec.md:73 introduces that event for exactly this.
Consequence: during a provider outage every refresh gets `invalid_grant` (broker.ts:277), not 503 `temporarily_unavailable`. Claude and ChatGPT then discard their Refresh tokens, and every Staff member has to sign in again. The callback shows "refused the sign-in: unknown_error", and the Operator gets no line at all. No test serves a 5xx from the token endpoint.

## gap — the refresh half of "a Server fault is not a failed verification" is untested
Where: src/signin/broker.ts:278
Axis: spec and scope
spec.md:74 promises the 500 response and the `signin_error` line for "the callback or a refresh". `unexpected_signin_error_is_logged_not_hidden` covers only the callback. No test asserts `server_error`, or `signin_error` with `endpoint: "token"`.
Consequence: folding lines 278–279 back into `invalid_grant` leaves the suite green, and a refresh fault would again look like a refused token.

## gap — the spec's log-line shapes were not updated
Where: docs/slices/S-001/spec.md:45
Axis: both
The block lists only `config_invalid`, `idp_unreachable` and `cimd_fetch_failed`, and the reasons it gives `cimd_fetch_failed` omit `network` and `invalid_document`. `idp_invalid_response` (`issuer`, `endpoint`) and `signin_error` (`endpoint`) appear only in D-070. D-068 asks each slice to document the shape of every event it adds in its own spec.
Consequence: S-006's Node adapter and the alert setup will be built from an incomplete list of events.

## gap — D-070's rejected alternatives now sit under D-071
Where: .sdlc/decisions.md:385
Axis: both
The rework inserted D-070's new bullets and all of D-071 above D-070's original closing line. That line rejects storing the kind as a payload field and defaulting a missing `resource`.
Consequence: D-071 now appears to reject those alternatives, and D-070 shows none. D-070 is the record later slices consult for the `typ` header and the required `resource`.

## nit — "Unreachable" is thrown for a provider that answered
Where: src/signin/identity-provider.ts:94
Axis: standards and naming
`invalid()` returns `IdentityProviderUnreachable`, but the class's docstring says "did not answer in time, or could not be reached". So a malformed answer shows the "did not answer" page. The behaviour is acceptable; the name misleads.

## nit — Server faults outside the try blocks bypass `signin_error`
Where: src/signin/broker.ts:216
Axis: spec and scope
A throw from `tokens.issue` or `tokens.open` reaches Hono's default handler. That handler writes the error and its stack through `console.error`, against spec.md:16, though such a throw is unlikely.

## nit — data-model.md still says Refresh tokens are not rotated
Where: docs/system-spec/data-model.md:41
Axis: spec and scope
Under D-071 a new Refresh token is issued when the provider rotates its own, and the earlier one stays valid until the shared `exp`. Correct the document at the next system-spec revision.

## nit — test helper keeps the rejected alias
Where: test/signin/helpers.ts:44
Axis: standards and naming
D-070 covers only the property `h.idp`. The class `FakeIdp` and the re-declared Google issuer at :8 remain. Renaming the class would touch helpers.ts alone.

## nit — T-011's live outcome is not yet recorded
Where: docs/slices/S-001/spec.md:145
Axis: spec and scope
Q-019 is still open. This is expected before deploy.

Verdict: hold (0 blockers, 5 gaps, 5 nits)

## Previous review

Commit e8fd168, reviewed against the same spec: hold (0 blockers, 13 gaps, 12 nits). The table above records how each was settled.
