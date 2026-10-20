# Deployment — S-001

Deployed commit 8e6f065 to the project test Deployment (Cloudflare Worker `sql-mcp-server`) on 2026-10-20, as version `63bb5fd7-9b95-44cf-b018-811643236450`. Its `src/` is identical to the reviewed commit 318ca63. 8e6f065 adds only configuration and a smoke script: the Entra ID values as Wrangler vars (`IDP_ISSUER` for tenant `9416b60e-…`, and `IDP_CLIENT_ID`), and `scripts/smoke-signin.mjs`. `SERVER_SECRET` and `IDP_CLIENT_SECRET` were set beforehand as Wrangler secrets. `SERVER_SECRET` was generated and piped into Wrangler without ever being displayed. There are no migrations, because the Server stores nothing (data-model.md). The bundle is 1,217.93 KiB, 243.02 KiB gzipped, with a 49 ms startup.

Verified by: npm run smoke -- https://sql-mcp-server.prinsloopower.workers.dev && node scripts/smoke-signin.mjs https://sql-mcp-server.prinsloopower.workers.dev

Both passed on the deployed Worker: 6/6 and 7/7. The sign-in checks drive registration and `/authorize` through to Entra ID's own authorize page. Entra accepted the client ID and the redirect URI there, with no AADSTS error. `/oauth/callback` refuses a forged state, and `/mcp` refuses a forged Sign-in with `error="invalid_token"`.

Rollback: `npx wrangler rollback 809beefe-d126-4af3-919c-1205c7d1dc68`, the walking skeleton. It touches no data, because nothing this deployment did was one-way: no store, no migration. Every Sign-in and Refresh token issued meanwhile stops working, since the skeleton blocks every MCP call, and AI tools have to sign in again after a roll forward. The two secrets and the Entra vars can stay, because the skeleton ignores them. To roll back to this version later: `npx wrangler rollback 63bb5fd7-9b95-44cf-b018-811643236450`.

Try it:
- **Claude** (claude.ai or Claude Desktop): Settings → Connectors → Add custom connector. Name it `SQL MCP (test)` with URL `https://sql-mcp-server.prinsloopower.workers.dev/mcp`, leave the OAuth fields empty, and save. Then click Connect. A browser window opens at Microsoft's sign-in page. Sign in with an account in the product owner's Entra tenant and accept the consent prompt. You return to Claude, and the connector shows as connected, with no tools listed.
- **ChatGPT**: Settings → Connectors (with developer mode on) → Create. Use the same URL with authentication set to OAuth. Then connect and sign in the same way. It should show as connected with no actions.
- **Expected failures:** an account outside the tenant is refused by Entra, never by the Server. Calling the URL without signing in gets only the not-authenticated reply.

## Not covered by the smoke check
- **A real sign-in completing.** The script cannot type a Microsoft password, so the callback, the exchange with Entra's token endpoint, the ID token verified against Entra's published keys, and the Sign-in reaching `/mcp` are proven only against the stand-in provider in the test suite. T-011, the live run from Claude and ChatGPT, is what proves them on the deployed system, and it answers Q-019.
- **Refresh against Entra:** whether Entra rotates refresh tokens as D-071 assumes, and whether its refresh response carries an ID token, as the Server requires. If Entra omitted the ID token on refresh, every renewal would fail with `invalid_grant`, and Staff members would have to sign in again when the Sign-in expires. Watch for this on the first renewal, about an hour after sign-in.
- **Client ID Metadata Documents from the real AI tools.** The tests cover the mechanism, and only a live connection shows which registration path Claude and ChatGPT actually take.
- **Google sign-in** (Q-023). No Google client exists yet.
- **Workers Logs:** that `config_invalid`, `idp_unreachable` and the other operational lines actually arrive there. None has fired on this deployment.
