# Review — S-001

Reviewed: commit e8fd168 (diff from 2fa9112) against the slice spec.
Tests: `npm test` → 12 files, 73 passed, 0 failed. `npm run typecheck` → clean.

Each axis ran in its own fresh subagent, and neither saw the other's findings. The reviewer checked the cited lines; the trailing-dot `localhost.` host was confirmed with Node's URL parser.

**What holds.** The Delivers path is complete in code:
1. the AI tool gets 401 and the protected-resource metadata;
2. it reads the authorization-server metadata;
3. it registers through `/register` or a metadata document;
4. `/authorize` sends the browser to the Identity provider;
5. `/oauth/callback` and then `/token` issue the Sign-in;
6. `/mcp` passes the Staff identity to the handler, and `tools/list` comes back empty.

Every one of the eight Screens pages exists and is tested. The security mechanics check out:
- PKCE accepts S256 only.
- `redirect_uri` must match exactly.
- The resource must sit under this origin's `/mcp`, and `aud` must equal the URL being called.
- The `__Host-` cookie has the right attributes, and only its hash is kept in the encrypted `state`.
- The ID token is checked for alg allow-list, keys, `iss`, `aud`, `exp` with 60 s skew, `nonce` and `sub`.
- Each token's kind is typed in its JOSE header, and `v` and the previous secret are handled.
- Refresh tokens are bound to client, resource and issuer.
- The metadata-document URL is checked before any fetch, with manual redirect, 16 KiB, 3 s, JSON only and an exact `client_id`.
- No op line carries a secret, and nothing outside the slice's scope was changed.

## gap — a renewed Refresh token restarts its 30 days
Where: src/signin/broker.ts:272
Axis: spec and scope
When the provider rotates its refresh token, a new Refresh token is issued with `exp` = now + 30 d (`issue`, broker.ts:319). The presented token's `exp` is not inherited. data-model.md says Refresh tokens are "not rotated on use", and D-051 says they last at most 30 days. The spec asks for the rotated provider token to be carried but does not say which `exp` applies, and no D-### records the choice. Consequence: Entra ID rotates on every use, so a Sign-in can be renewed without limit, and every earlier Refresh token stays valid in parallel. docs/security-material/sign-in.md:28 promises a bound that does not hold, and S-006 will decide this again. Raised as Q-025.

## gap — the 5 s Identity provider limit does not cover the response body
Where: src/signin/idp.ts:75
Axis: spec and scope
`within(CALL_MS, …)` wraps only the fetch. `res.json()` then runs with no limit for the token response (idp.ts:161), discovery (:85) and keys (:98). Consequence: a provider that sends headers and then stalls holds `/authorize`, `/oauth/callback` or `/token` past 5 s, and no `idp_unreachable` line is written, against Proven-by "has not answered after 5 s ends the sign-in". The metadata-document fetch does read its body inside its limit.

## gap — `localhost.` passes the no-localhost rule
Where: src/signin/clients.ts:47
Axis: spec and scope
`new URL("https://localhost./c.json").hostname` is `localhost.`, which is neither `=== "localhost"` nor `.endsWith(".localhost")`. Consequence: a URL the spec says is refused without fetching gets fetched. On Workers, egress still blocks it. On the S-006 Node adapter it reaches loopback unless the connect-time check catches it.

## gap — the redirect test cannot detect a fetch that follows redirects
Where: test/signin/register.test.ts:100
Axis: spec and scope
The fake fetch ignores `init.redirect` and always returns the 302 itself. Consequence: removing `redirect: "manual"` (clients.ts:65) leaves every test green while production follows redirects, breaking security.md's no-redirect rule.

## gap — rotation is proven only at the unit level
Where: test/signin/tokens.test.ts:41
Axis: spec and scope
No test sends an old-secret Sign-in through `createApp` with `SERVER_SECRET_PREVIOUS` set. Consequence: if app.ts:58 stopped passing `config.previousSecret`, every test would still pass, and a planned rotation would sign everyone out.

## gap — the metadata-document client is never taken through /token
Where: src/signin/broker.ts:245
Axis: spec and scope
Every CIMD test stops at `/authorize`, and the end-to-end flow uses `/register`. Consequence: the server advertises `client_id_metadata_document_supported`, so Claude may take this path live. Its `/token` half, including the "ends in `invalid_client`" promise, is untested.

## gap — the secrets-in-logs test omits two values the spec names
Where: test/signin/mcp-gate.test.ts:99
Axis: spec and scope
The list leaves out the Server-issued Authorization code and the ID token. Consequence: logging either would not fail the test.

## gap — decisions taken silently
Where: src/config.ts:53
Axis: spec and scope
These choices are in neither the spec nor D-070:
- An invalid `PUBLIC_URL`, or a non-https `IDP_ISSUER` (config.ts:56), puts the whole Deployment into the "Deployment misconfigured" 503, `/mcp` included. The spec defines that state only for `SERVER_SECRET`.
- The did-not-answer page uses status 502 (broker.ts:145, :208).
- `/token` answers `unsupported_grant_type` (broker.ts:283).

Consequence: S-006's Node adapter and later slices will choose these again, possibly differently.

## gap — Security material calls the Authorization code one-time
Where: docs/security-material/sign-in.md:18
Axis: spec and scope
It says "a one-time code", but the same document (line 43) and D-051 say a code can be replayed within 60 s. Consequence: the T-012 deliverable contradicts itself on an accepted threat a Security reviewer relies on.

## gap — Authorization code carries a field data-model.md does not define
Where: src/signin/broker.ts:223
Axis: standards and naming
`idp_refresh_exp` is written into the code and read back at broker.ts:310. It is not in data-model.md or D-070, though the spec says tokens are issued "exactly as data-model.md defines them". Consequence: the token format has drifted unrecorded, and the next `v` change and the Security material will be built from a wrong data model.

## gap — catch-all turns any error into a refusal with no log line
Where: src/signin/broker.ts:209
Axis: standards and naming
In the callback, and in refresh at broker.ts:269, every error that is not `IdpRefused` or `IdpUnreachable` becomes the could-not-be-verified page or `invalid_grant`. `IdTokenInvalid` is never tested for, and no comment says this is intended. Consequence: a programming error or an unexpected `jose` exception looks exactly like a forged token, and the Operator has no line to tell a bug from an attack.

## gap — network failures logged as `cimd_fetch_failed` reason `status`
Where: src/signin/clients.ts:85
Axis: standards and naming
DNS, connection and TLS failures are all logged as `status`, which line 67 uses for a non-2xx answer. Consequence: an Operator is told the host answered with an error when it was never reached.

## gap — rejected alias "IdP" in type and class names
Where: src/signin/idp.ts:17
Axis: standards and naming
These are `IdpUnreachable`, `IdpRefused` (idp.ts:23), `IdpSettings` (src/config.ts:6), `PAGES.idpDown` (broker.ts:26), `FakeIdp` (test/signin/helpers.ts:44) and the file name, while the same module's class is `IdentityProvider`. This is a gap rather than a blocker because the system spec itself fixes `IDP_*`, `idp_refresh` and `idp_unreachable`, but no document fixes these TypeScript names. Consequence: later slices copy `Idp*` as house style.

## nit — `/token` answers `invalid_client` with 401
Where: src/signin/broker.ts:245
Axis: spec and scope
D-070 records it, but the spec's Interface line still says 400.

## nit — keys fetched twice when the cache has expired and the `kid` is unknown
Where: src/signin/idp.ts:108
Axis: spec and scope
This costs one extra JWKS fetch, and is harmless.

## nit — a second sign-in in the same browser voids the first
Where: src/signin/broker.ts:179
Axis: spec and scope
The fixed cookie name means the earlier sign-in's callback shows the different-browser page.

## nit — T-011's live outcome is not yet recorded
Where: docs/slices/S-001/spec.md:135
Axis: spec and scope
Q-019 is still open. This is expected before deploy, but the Delivers line is not shown live until it is recorded.

## nit — 60 s skew defined twice
Where: src/signin/idp.ts:13
Axis: standards and naming
It is also at broker.ts:20, and test/signin/helpers.ts:8 re-declares `GOOGLE_ISSUER`.

## nit — `IdentityProvider.config()` returns the discovery document
Where: src/signin/idp.ts:82
Axis: standards and naming
The name collides with `Config` and `readConfig`.

## nit — three types named `Env`, one imported as `Settings`
Where: src/worker.ts:2
Axis: standards and naming
`Settings` echoes the domain term Server setting, but the type holds `SERVER_SECRET`.

## nit — `/mcp` has two error shapes
Where: src/app.ts:45
Axis: standards and naming
The 503 is plain text and the 401 is a JSON-RPC body.

## nit — environments.md still says variables are read per request on Workers
Where: src/worker.ts:16
Axis: standards and naming
The app is now built once per isolate (D-070), and the document was not updated.

## nit — `.dev.vars.example` omits variables without saying why
Where: .dev.vars.example:21
Axis: standards and naming
`HYPERDRIVE`, `DATABASE_URL` and `PORT` are left out unexplained, while `ENGINE`'s omission is explained.

## nit — `idp_unreachable` written for a provider that did answer
Where: src/signin/idp.ts:87
Axis: standards and naming
It is also written at line 100, for a non-2xx or malformed response, with `ms: 5000`.

## nit — stale comment
Where: src/app.ts:76
Axis: standards and naming
"Blocked until Sign-in exists" should now say "until Sign-in is configured".

Verdict: hold (0 blockers, 13 gaps, 12 nits)
