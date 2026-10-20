# S-001 — Signing in from Claude and ChatGPT

Delivers: from Claude or ChatGPT, a Staff member proves who they are with their work account at Entra ID or Google, and their AI tool then reports the Server as connected, with nothing to ask it yet. An unsigned caller learns nothing beyond the not-authenticated reply.
Traces: J-002, R-009, R-017

## Screens
The Server has no designed screens (D-046). During Sign-in, the Staff member's browser passes through the Server's `/authorize` and `/oauth/callback`, which either redirect or show a plain-text page. This slice builds every one of those outcomes:
- redirect onward (to the Identity provider, or back to the AI tool);
- "Sign-in is not configured on this Deployment" (D-017);
- "This AI tool's sign-in request is not valid": status 400, shown by `/authorize` when redirecting back would be unsafe. That is an unknown or altered `client_id`, a Client ID Metadata Document that could not be fetched or accepted, or a missing or unregistered `redirect_uri`. It never names which;
- "The Identity provider at <IDP_ISSUER> did not answer";
- "This sign-in started more than 10 minutes ago. Start again from your AI tool";
- "This sign-in was started in a different browser. Start again from your AI tool";
- "The Identity provider refused the sign-in: <its error code>";
- "The sign-in could not be verified. Start again from your AI tool": status 400, shown for an ID token that fails any check and for a `state` that cannot be decrypted or read. It never says which check failed;
- "The sign-in failed on the Server. Start again from your AI tool": status 500, for a fault in the Server itself rather than in what was presented. It writes a `signin_error` line and never the error's text (code review, D-070).

## Interface
All paths are on the Deployment's origin. Each takes and returns what ADR-004 and data-model.md define, and nothing else.

```
GET  /.well-known/oauth-protected-resource/<path>  → authorization_servers: [origin] once IDP_* are set (exists; now conditional on full config)
GET  /.well-known/oauth-authorization-server       → RFC 8414 metadata: issuer, authorization/token/registration endpoints,
                                                       response_types [code], grant_types [authorization_code, refresh_token],
                                                       code_challenge_methods [S256], token_endpoint_auth_methods [none],
                                                       client_id_metadata_document_supported: true
POST /register         → 201 {client_id (Client registration JWS), redirect_uris, client_name, token_endpoint_auth_method: "none"}; 400 invalid_redirect_uri / invalid_client_metadata
GET  /authorize        → 302 to the Identity provider, with the Authorization request in `state` and the __Host-sqlmcp-auth cookie set;
                         the 400 not-valid page when redirecting back would be unsafe (Screens);
                         302 to the client's redirect_uri with error=invalid_request for every other refusal;
                         503 while Sign-in is not configured
GET  /oauth/callback   → 302 to the client's redirect_uri with `code` and the client's `state`; the plain-text pages above on failure
POST /token            → 200 {access_token, token_type: "Bearer", expires_in, refresh_token?}; 400 invalid_grant / invalid_request / unsupported_grant_type;
                         401 invalid_client; 503 temporarily_unavailable when the provider does not answer a refresh; 500 server_error
ANY  /mcp, /mcp/*      → a valid Sign-in reaches the MCP handler, which lists no tools; anything else gets 401 + WWW-Authenticate (error="invalid_token" when a token was presented)
```

The Identity provider redirect URI the Operator registers is `<origin>/oauth/callback`. `/authorize` requests the scopes in `IDP_SCOPES`. When that is unset, it requests `openid profile email offline_access`, or `openid profile email` when `IDP_ISSUER` is `https://accounts.google.com`, which instead also gets `access_type=offline` and `prompt=consent` (D-069).

## Operational log lines
This slice is the first to emit lines of `"type":"op"` (security.md, operations.md), in the envelope D-068 fixes for every slice. These are the events it emits:

```
{"type":"op","event":"config_invalid","variable":"SERVER_SECRET","ts":"…"}
{"type":"op","event":"idp_unreachable","issuer":"<IDP_ISSUER>","endpoint":"discovery|jwks|token","ms":5000,"ts":"…"}
{"type":"op","event":"idp_invalid_response","issuer":"<IDP_ISSUER>","endpoint":"discovery|jwks|token","ts":"…"}
{"type":"op","event":"cimd_fetch_failed","host":"<client_id host>","reason":"redirect|size|timeout|network|status|content_type|invalid_document|client_id_mismatch","ts":"…"}
{"type":"op","event":"signin_error","endpoint":"callback|token","ts":"…"}
{"type":"op","event":"server_fault","path":"<request path>","ts":"…"}
```

`idp_unreachable` means the provider gave no answer in time. `idp_invalid_response` means it answered with something unusable: a 5xx, a malformed document, or a token error carrying no OAuth error code. In both cases a refresh answers 503 `temporarily_unavailable`, so an AI tool keeps its Refresh token through a provider outage. `signin_error` and `server_fault` mean a fault in the Server itself. Neither ever carries the error's text.

## Security material
This slice writes `docs/security-material/sign-in.md` (D-067). For a Security reviewer, it says who can call the Server and how that is checked. It names every token the Server issues, its lifetime and what voids it, and the threats accepted in D-051. It discloses that blocked calls leave no Audit record but do appear in the platform's request logs (D-056).

## Data
No stores. It issues and checks Sign-in, Refresh token, Client registration, Authorization request and Authorization code exactly as data-model.md defines them, all at `v: 1`, with keys derived from `SERVER_SECRET` and verified against `SERVER_SECRET_PREVIOUS` too. Conversation tokens and Audit records are not touched.

## Proven by
- With any of `IDP_ISSUER`, `IDP_CLIENT_ID` or `IDP_CLIENT_SECRET` unset, every `/mcp` call gets 401, and `/authorize` gets 503 with the not-configured page.
- With `SERVER_SECRET` missing or shorter than 32 bytes, every `/mcp` call gets 503 "Deployment misconfigured: SERVER_SECRET", and `/healthz` reports `config: invalid` naming the variable but not its value.
- A token signed or encrypted under any other secret, altered by one byte, or carrying `v: 2` is rejected.
- After a rotation, with the old value in `SERVER_SECRET_PREVIOUS`, a Sign-in issued before the rotation still reaches `/mcp`, and every newly issued token verifies under the new secret alone.
- Protected-resource metadata lists this origin as authorization server only when all three `IDP_*` variables are set, and an empty list otherwise.
- Authorization-server metadata carries every field listed under Interface, with `code_challenge_methods_supported` exactly `["S256"]`.
- A valid `/register` request gets 201 and a `client_id` that `/authorize` then accepts. The same `client_id` altered by one byte is refused.
- `/register` refuses zero redirect URIs, more than 5, any that is not `https://` or `http://localhost`/`http://127.0.0.1`, and a `client_name` over 100 characters.
- A Client ID Metadata Document URL that is not `https://` on 443, has no path, or has a query, fragment or userinfo, or that names an IP address or `localhost`, is refused without being fetched. A fetch that redirects, exceeds 16 KiB, takes more than 3 s, is not `application/json`, or returns a `client_id` other than its URL ends in `invalid_client`.
- `/authorize` refuses a `response_type` other than `code`, PKCE `plain`, a missing challenge, a `redirect_uri` not exactly in the Client registration, and a `resource` outside this Deployment's `/mcp`.
- The `__Host-sqlmcp-auth` cookie is set with HttpOnly, Secure, SameSite=Lax, Path=/ and Max-Age=600.
- With `IDP_ISSUER` set to `https://accounts.google.com`, the redirect to the Identity provider carries `access_type=offline` and `prompt=consent` (D-069). With any other issuer it carries neither.
- The redirect's `scope` is `IDP_SCOPES` when set. Unset, it is `openid profile email offline_access`, or `openid profile email` for Google.
- An unknown or altered `client_id`, an unfetchable metadata document, or a missing or unregistered `redirect_uri` gets the 400 not-valid page and no redirect. Every other `/authorize` refusal redirects to the registered `redirect_uri` with `error=invalid_request` and the client's `state`.
- `/oauth/callback` refuses a missing or mismatched cookie, and an Authorization request older than 10 minutes. It refuses an ID token with `alg` `none`, `HS256` or `RS384`, or any other algorithm than RS256, PS256 or ES256. It refuses each of a wrong `iss`, a wrong `aud`, a past `exp` and a wrong `nonce` separately, and a `state` altered by one byte. Each of these shows the could-not-be-verified page. An `error` returned by the Identity provider shows the provider-refused page with that code.
- A failed Client ID Metadata Document fetch writes one `cimd_fetch_failed` line, naming the host and the reason and never the URL's path or query. A fetch that gets no answer at all gives the reason `network`.
- A metadata document URL whose host is `localhost.` or ends in `.localhost.` is refused unfetched, like one without the dot. A document URL that redirects is not followed, even to a valid document.
- An Identity provider that sends headers and then stalls the body is cut off at 5 s, like one that sends nothing. A provider that answers with something other than OpenID Connect's documents writes `idp_invalid_response`, not `idp_unreachable`.
- A Server fault during the callback or a refresh shows the server-error page (500), or answers `server_error` at `/token`, and writes `signin_error`. It is never shown as a failed verification. A fault anywhere else answers 500 and writes `server_fault` with the path, never the error's message or stack.
- A 5xx from the provider's token endpoint shows the provider-did-not-answer page during sign-in, and gives 503 `temporarily_unavailable` on a refresh, with an `idp_invalid_response` line. It is never `invalid_grant`.
- A Client ID Metadata Document client completes the code exchange and reaches `/mcp`. Once its document is gone, its refresh is refused with `invalid_client`.
- Discovery and keys are fetched once per 10 minutes. An ID token whose `kid` is not in the cached keys causes one refetch, and a second unknown `kid` within the same minute does not.
- An Identity provider call that has not answered after 5 s ends the sign-in with the page naming `IDP_ISSUER`.
- `/token` refuses a code older than 60 s, a wrong `code_verifier`, and a `client_id`, `redirect_uri` or `resource` different from the one the code was issued for.
- `/token` refuses a Refresh token presented by a different `client_id`, for a different `resource`, or carrying an `iss` other than `IDP_ISSUER`.
- When the provider rotates its refresh token, the renewed Refresh token keeps the presented one's expiry. Renewals made every 10 days still end 30 days after the first Sign-in (D-071).
- A Sign-in issued before a `SERVER_SECRET` rotation still reaches `/mcp` while the old secret is `SERVER_SECRET_PREVIOUS`, and is refused once it is removed.
- No log line carries the Server's Authorization code or the provider's ID token.
- An issued Sign-in's `exp` is the ID token's `exp`, or `iat` + 24 h if that is sooner.
- No Refresh token comes back from `/token` unless the Identity provider sent one. A Refresh token presented 30 days and one second after issue is refused, and so is one presented after a shorter expiry the provider stated.
- A refresh goes back to the Identity provider, and a refusal there yields `invalid_grant` and no new Sign-in. The provider's response must carry an ID token, verified exactly as at `/oauth/callback` (except `nonce`) and with the same `sub` as the Refresh token. The new Sign-in's `exp`, `sub` and `name` come from that ID token. A response with no ID token, or one that fails verification or names a different `sub`, yields `invalid_grant`. When the provider returns a new refresh token, the new Refresh token carries it.
- A Sign-in is accepted at `/mcp` 59 s after its `exp` and refused 61 s after. It is refused if its `iss` differs from `IDP_ISSUER`. A Sign-in for one connector URL is refused on a connector URL with a different Allow-list segment.
- A refused token gets 401 with `WWW-Authenticate: Bearer error="invalid_token", resource_metadata="…"`. A request with no token gets the challenge without `error`.
- The MCP handler receives the Staff member's `sub`, `name` and `iss` from the Sign-in on every accepted request, and from nowhere else (R-009).
- A blocked `/mcp` call writes no line to standard output (D-044).
- `config_invalid` and `idp_unreachable` lines are written in the shapes above, and no operational line ever contains a token, an ID token, an authorization code, `SERVER_SECRET`, `SERVER_SECRET_PREVIOUS` or `IDP_CLIENT_SECRET`.
- `docs/security-material/sign-in.md` exists and covers every point under Security material above.
- Live, on the project test Deployment with the product owner's Entra ID tenant: Claude and ChatGPT each add the connector, complete Sign-in, and show it connected with no tools. Q-019 is then answered for Entra ID.
- Live, with a Google OAuth client: the same, from at least one of Claude and ChatGPT.

## Out of scope
- Any tool, Tool call or Audit record (S-002, D-061).
- The connect-time address check on Client ID Metadata Document fetches. It needs the Node runtime adapter (security.md), which arrives with S-006. On Workers, the platform's egress already refuses private ranges, and IP-literal and `localhost` URLs are refused here.
- Sign-in on Azure (S-006).

## Needs from the product owner before live verification
- From Entra: the tenant ID (for `IDP_ISSUER` = `https://login.microsoftonline.com/<tenant>/v2.0`), an app registration of the Web platform type with redirect URI `https://sql-mcp-server.prinsloopower.workers.dev/oauth/callback`, and its client ID and a client secret. The product owner enters the secret with `wrangler secret put`, never in a message.
- A Google OAuth client, web application type, with the same redirect URI (Q-023).

## Tasks

### T-001 — An unconfigured or misconfigured Deployment refuses Sign-in and says why
Verified by: authorize_503_when_idp_unset, mcp_401_when_idp_unset, misconfigured_secret_returns_503, healthz_names_invalid_variable_not_value, config_invalid_op_line_written

### T-002 — The Server describes itself as an authorization server
Verified by: as_metadata_lists_endpoints_and_s256, prm_names_origin_only_when_configured

### T-003 — Every token kind round-trips, and nothing forged, altered or unknown passes
Verified by: token_roundtrip_each_kind, tampered_token_rejected, foreign_secret_token_rejected, unknown_version_rejected, previous_secret_verifies_but_never_issues

### T-004 — AI tools can register, statelessly or by metadata document, and bad registrations are refused
Verified by: register_issues_signed_client_id, register_rejects_bad_redirect_uris, register_rejects_long_client_name, cimd_rejects_unsafe_url_without_fetching, cimd_rejects_redirect_oversize_or_slow, cimd_rejects_non_json, cimd_rejects_client_id_mismatch, cimd_fetch_failed_op_line_names_host_only, cimd_rejects_localhost_with_trailing_dot, cimd_does_not_follow_redirects, cimd_network_failure_logged_as_network

### T-005 — /authorize accepts only a correct request and hands the Staff member to the Identity provider
Verified by: authorize_unsafe_errors_show_page_not_redirect, authorize_sends_idp_scopes_or_default, authorize_rejects_non_code_response_type, authorize_rejects_plain_or_missing_pkce, authorize_rejects_unregistered_redirect_uri, authorize_rejects_foreign_resource, authorize_redirects_to_idp_with_state_and_cookie, auth_cookie_attributes, authorize_requests_offline_from_google

### T-006 — /oauth/callback accepts only the browser and sign-in that started, with a verified ID token
Verified by: callback_rejects_cookie_mismatch, callback_rejects_expired_request, callback_rejects_wrong_iss, callback_rejects_wrong_aud, callback_rejects_expired_id_token, callback_rejects_wrong_nonce, callback_rejects_disallowed_id_token_alg, callback_rejects_tampered_state, callback_shows_provider_refusal, callback_idp_timeout_names_provider, idp_unreachable_op_line_written, jwks_cached_and_refetch_limited, callback_redirects_with_code_and_client_state, idp_body_stall_times_out, idp_invalid_response_op_line_written, unexpected_signin_error_is_logged_not_hidden, uncaught_fault_logged_without_stack

### T-007 — /token turns a code or Refresh token into a Sign-in bounded by the ID token
Verified by: token_requires_matching_verifier, token_rejects_expired_code, token_rejects_mismatched_client_redirect_or_resource, signin_exp_capped_at_24h, refresh_rejects_other_client_resource_or_issuer, refresh_token_only_when_idp_issues_one, refresh_token_exp_30_days_or_provider, refresh_renews_through_idp, refresh_requires_verified_id_token_same_sub, refresh_carries_rotated_idp_refresh_token, refresh_rejected_when_idp_refuses, refresh_rotation_keeps_original_expiry, cimd_client_completes_token_exchange, token_endpoint_outage_is_temporary, refresh_server_fault_is_logged

### T-008 — /mcp lets in only a valid Sign-in for this resource, passes on who it is, and blocked calls leave nothing behind
Verified by: mcp_accepts_valid_signin_with_no_tools, mcp_handler_receives_staff_identity, mcp_accepts_within_skew, mcp_rejects_expired_beyond_skew, mcp_rejects_wrong_issuer, mcp_rejects_wrong_audience, invalid_token_challenge_names_error, blocked_call_writes_no_log_line, op_lines_never_contain_secrets, signin_issued_before_rotation_still_reaches_mcp, no_log_line_carries_code_or_id_token

### T-009 — The whole Sign-in runs end to end against a stand-in Identity provider
Verified by: signin_flow_end_to_end

### T-010 — A new contributor can go from a fresh clone to a running local Server (D-059)
Verified by: manual — `.dev.vars.example` lists every variable in environments.md, with secrets blank. One run of the local sequence in environments.md from a fresh clone is recorded in this spec, and any step that failed is fixed in environments.md.

Run 2026-10-19, from a fresh clone of commit 05ed77a, on Windows 10 with Node 24 and Docker Desktop. Every documented step worked as written:
- `npm ci`, then `npm run db:up`.
- `npm test`: 72/73 on the first run, then 73/73 on two reruns. The one first-run failure was `test/mcp.test.ts`'s workerd test, which came from the architecture phase. On a cold checkout, workerd's first boot took about 12 s, beyond Vitest's default 5 s per test.
- `.dev.vars` copied from `.dev.vars.example`, with `SERVER_SECRET` filled.
- `npm run dev`, then `npm run smoke -- http://127.0.0.1:8799`: 6/6 checks passed, including `healthz` reaching the Docker PostgreSQL.

No step needed fixing in environments.md. The cold-start timeout is recorded as Q-024.

### T-011 — Claude and ChatGPT sign in to the deployed Server through Entra ID and Google
Verified by: npm run smoke -- https://sql-mcp-server.prinsloopower.workers.dev, manual — the smoke test also checks the authorization-server metadata. The product owner adds the connector in Claude and in ChatGPT, completes Sign-in with Entra ID, and sees it connected. They repeat it with Google from at least one of the two. The outcome for each, with the date, is recorded in this spec and answers Q-019.

### T-012 — A Security reviewer can read how Sign-in works and what it does not protect against
Verified by: manual — `docs/security-material/sign-in.md` is read against the Security material section above, and every point is present, each pointing to its rule in security.md or its decision.

## Critique findings

Gate 1, 2026-10-18, critique in fresh context. Verdict: hold (0 blockers, 6 gaps, 1 nit).

- **gap — no Security material section** for Sign-in, though D-014 and ADR-004 require one.
- **gap — operational log lines (`config_invalid`, `idp_unreachable`) are neither built nor proven free of secrets,** though operations.md alerts on them.
- **gap — system-spec numbers and rules missing from Proven by:** the Refresh token's 30 days, no Refresh token without a provider refresh token, `client_name` of at most 100 characters, at least 1 redirect URI, the cookie attributes, `response_type=code` only, CIMD `application/json` with a path, the 10-minute key cache with at most one refetch a minute, and Sign-in `iss` checked at `/mcp`.
- **gap — Proven-by lines with no test:** the callback's `iss`/`aud`/`exp` checks, the provider-refused page, acceptance within the 60 s skew, and the `invalid_token` challenge.
- **gap — R-009 and J-002 only partly delivered:** nothing shows the MCP handler receiving the Staff member's identity from Sign-in.
- **gap — Q-023 read as answered by D-060**, because of a misplaced line in questions.md. Fixed at once: the line belonged to Q-021. Q-022 had read the same way since commit 2fa9112.
- **nit — `prm_names_origin_only_when_configured` has no Proven-by line.**

Revision 2, 2026-10-18, directed by the product owner:

- Security material → a Security material section and T-012, writing `docs/security-material/sign-in.md` (D-067).
- Operational log lines → their shapes are defined, with tests that they are written and never carry secrets.
- Missing numbers and rules → all added to Proven by, each with a test.
- Untested lines → tests named for the callback's `iss`/`aud`/`exp` checks, the provider-refused page, acceptance within the skew, and the `invalid_token` challenge.
- Identity → the handler receives `sub`, `name` and `iss` from Sign-in (`mcp_handler_receives_staff_identity`).
- Nit → a Proven-by line for protected-resource metadata.

Gate 2, 2026-10-18, critique in fresh context. Verdict: hold (0 blockers, 5 gaps, 2 nits). All gate-1 findings confirmed resolved.

- **gap — the Refresh token's bindings are never tested.**
- **gap — `cimd_fetch_failed` is defined but nothing proves it is written.**
- **gap — no page for an ID token that fails checks, or for an unreadable `state`.**
- **gap — the operational line format is decided inside this slice.**
- **gap — the algorithm test is narrower than its Proven-by line.**
- **nits —** three tests without a Proven-by line, the Google offline choice in no D-###, and T-012 before T-010.

Revision 3, 2026-10-19, directed by the product owner:

- Refresh bindings → a Proven-by line and `refresh_rejects_other_client_resource_or_issuer`.
- `cimd_fetch_failed` → a Proven-by line and `cimd_fetch_failed_op_line_names_host_only`.
- Failed verification → a seventh page, the 400 could-not-be-verified page, with `callback_rejects_tampered_state`.
- Line format → recorded system-wide as D-068.
- Algorithms → `callback_rejects_disallowed_id_token_alg` covers `none`, HS256 and RS384.
- Nits → Proven-by lines for the metadata, registration and Google tests; the Google parameters recorded as D-069; T-012 moved last.

Gate 3, 2026-10-19, critique in fresh context. Verdict: hold (0 blockers, 3 gaps). All gate-2 findings confirmed resolved.

- **gap — a refresh does not say where the new Sign-in's `exp`, `sub` and `name` come from.**
- **gap — `IDP_SCOPES` is never built or tested.**
- **gap — the `/authorize` 400 page has no wording and no test.**

Revision 4, 2026-10-19, directed by the product owner, who passed the gate without a fourth critique:

- Refresh → a verified ID token with the same `sub` is required, and a rotated provider refresh token is carried. Tests `refresh_requires_verified_id_token_same_sub` and `refresh_carries_rotated_idp_refresh_token`.
- Scopes → `IDP_SCOPES` is read, with a Google default that leaves out `offline_access`. Test `authorize_sends_idp_scopes_or_default`.
- `/authorize` errors → the 400 not-valid page for unsafe redirects, `error=invalid_request` otherwise. Test `authorize_unsafe_errors_show_page_not_redirect`.
