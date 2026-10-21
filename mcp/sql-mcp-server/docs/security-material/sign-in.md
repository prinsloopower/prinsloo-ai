# Sign-in: who can call the Server

This section answers one of R-014's four questions: *who can call it*. It covers what this release does (slice S-001). Later sections cover what the Agent can see, what it can run, and what is logged.

## In short

- Nobody reaches the Server's tools without first signing in through **your organisation's own Identity provider**: Microsoft Entra ID, Google, or any OpenID Connect provider that publishes discovery metadata. Who may sign in is decided there, not in the Server (D-015).
- Until the Operator configures that provider, the Server refuses every call (D-017).
- A call without a valid Sign-in gets one reply, "The MCP connection has not been authenticated. Sign in to use this server.", and nothing else. It sees no tool list, no Database contact, and leaves no Audit record (D-044).

## How a Sign-in happens

The Server is its own OAuth 2.1 authorization server, and it hands the actual sign-in to your Identity provider (ADR-004).

1. The AI tool (Claude or ChatGPT) calls the connector URL, gets a 401, and reads the Server's protected-resource and authorization-server metadata.
2. The AI tool registers, either by presenting a Client ID Metadata Document URL or through stateless dynamic registration. It then sends the Staff member's browser to the Server's `/authorize` with a PKCE S256 challenge. Plain PKCE is refused. The browser is only ever sent back to a redirect URI the AI tool registered. The one exception is a desktop AI tool listening on its own machine (`http://127.0.0.1`, `[::1]` or `localhost`), which may use any port, as OAuth requires for native apps (RFC 8252, D-072).
3. The Server sends the browser on to your Identity provider as a confidential OpenID Connect client, with its own PKCE challenge and a nonce. It also sets a short-lived cookie that ties the sign-in to that browser.
4. On the way back, the Server checks the cookie and verifies the ID token. The signature must be RS256, PS256 or ES256 against the provider's published keys, and the issuer, audience, expiry and nonce must all match. Only then does it give the AI tool a short-lived code. The code is valid for 60 seconds and useless without the AI tool's PKCE verifier; see "Accepted" below.
5. The AI tool exchanges the code, with its PKCE verifier, for a **Sign-in** (an access token) bound to the exact connector URL it asked for.

Every MCP request then carries that Sign-in. The Server accepts it only if it decrypts under the Deployment's key, comes from the configured Identity provider, is bound to the connector URL being called, and has not expired, with 60 seconds of allowance for clock differences.

## What the Server issues

| Value | Lifetime | What ends it early |
|---|---|---|
| Sign-in (access token) | Until the ID token's expiry, and never more than 24 hours | Rotating `SERVER_SECRET` without keeping the previous one |
| Refresh token | 30 days from the first Sign-in, or the provider's stated refresh lifetime if shorter. Renewing never extends it, even when the provider issues a new refresh token (D-071). Each use goes back to the Identity provider, which refuses a removed or disabled account | As above |
| Client registration | Does not expire | Rotating `SERVER_SECRET` past it. AI tools then re-register by themselves |
| Authorization request (during sign-in) | 10 minutes | — |
| Authorization code | 60 seconds | — |

All of these are encrypted or signed with keys derived from the one deployment secret, `SERVER_SECRET`. The Server stores none of them, and it has no database of its own for Sign-in. Every value carries its kind, so one kind can never be presented as another.

## What this means for you

- **Removing someone.** Remove or disable them in your Identity provider. Their current Sign-in keeps working until it expires, at most 24 hours later. Their next renewal is refused (D-024).
- **Revoking everyone at once.** Rotate `SERVER_SECRET` without setting `SERVER_SECRET_PREVIOUS`. Every Staff member has to sign in again.
- **Planned rotation.** Set the new value as `SERVER_SECRET` and the old one as `SERVER_SECRET_PREVIOUS`. Nobody is signed out. Remove the old value after 30 days.

## Accepted, and why

- **No per-token revocation** (D-051). The Server keeps no store, by design (ADR-004), so it cannot revoke one Sign-in, Refresh token or registration on its own. An Authorization code could in principle be replayed within its 60 seconds, but only by someone who also holds the AI tool's PKCE verifier.
- **Platform request logs** (D-056). Blocked calls leave no Audit record, but the hosting platform's own request logs record each request's URL, including the connector URL. Since D-074 that URL is plain `/mcp` and names no tables. Those logs are Workers Logs on Cloudflare and Container Apps logs on Azure.
- **No rate limit** (D-057). Unauthenticated calls and registrations store nothing and never reach the Database. Use your platform's own protection if you want a limit.
- **Client metadata fetches.** When an AI tool identifies itself by a metadata document URL, the Server fetches that document. It fetches only `https` URLs on port 443 that name a host, never an IP address or `localhost`. It follows no redirects, reads at most 16 KiB and waits at most 3 seconds. On Cloudflare, the platform cannot reach private network ranges at all.

## What is never logged

The Server's operational log lines name events, such as a configuration problem, an Identity provider that did not answer, or a metadata document that could not be fetched. They never contain tokens, ID tokens, authorization codes, `SERVER_SECRET`, `SERVER_SECRET_PREVIOUS`, `IDP_CLIENT_SECRET`, or the path of a metadata document URL (D-068).
