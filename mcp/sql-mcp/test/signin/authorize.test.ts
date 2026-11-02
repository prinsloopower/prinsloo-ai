import { describe, expect, it } from "vitest";
import {
  authorize,
  CLIENT_REDIRECT,
  flip,
  GOOGLE,
  harness,
  IDP_CLIENT_ID,
  ISSUER,
  ORIGIN,
  pkce,
  registeredClient,
  type Harness,
} from "./helpers.js";

async function expectClientError(h: Harness, r: Awaited<ReturnType<typeof authorize>>) {
  expect(r.res.status).toBe(302);
  expect(r.location?.href.startsWith(CLIENT_REDIRECT)).toBe(true);
  expect(r.location?.searchParams.get("error")).toBe("invalid_request");
  expect(r.location?.searchParams.get("state")).toBe("client-state-xyz");
}

describe("/authorize", () => {
  it("authorize_unsafe_errors_show_page_not_redirect", async () => {
    const h = await harness();
    const clientId = await registeredClient(h);
    const { challenge } = await pkce();
    const unsafe = [
      { clientId: "not-a-client" },
      { clientId: flip(clientId) },
      { clientId: "https://client.example.com/oauth/missing.json" },
      { clientId, redirect: null },
      { clientId, redirect: "https://evil.example.com/cb" },
    ];
    for (const p of unsafe) {
      const r = await authorize(h, { challenge, ...p });
      expect(r.res.status).toBe(400);
      expect(r.res.headers.get("location")).toBeNull();
      expect(await r.res.text()).toBe("This AI tool's sign-in request is not valid");
    }
  });

  it("authorize_sends_idp_scopes_or_default", async () => {
    const { challenge } = await pkce();
    const scopeOf = async (env: Record<string, string | undefined>) => {
      const h = await harness(env);
      const r = await authorize(h, { clientId: await registeredClient(h), challenge });
      return r.location?.searchParams.get("scope");
    };
    expect(await scopeOf({})).toBe("openid profile email offline_access");
    expect(await scopeOf({ IDP_SCOPES: "openid email" })).toBe("openid email");
    expect(await scopeOf({ IDP_ISSUER: GOOGLE })).toBe("openid profile email");
    expect(await scopeOf({ IDP_ISSUER: GOOGLE, IDP_SCOPES: "openid" })).toBe("openid");
  });

  it("authorize_rejects_non_code_response_type", async () => {
    const h = await harness();
    const clientId = await registeredClient(h);
    const { challenge } = await pkce();
    for (const responseType of ["token", "id_token", "code token"]) {
      await expectClientError(h, await authorize(h, { clientId, challenge, responseType }));
    }
  });

  it("authorize_rejects_plain_or_missing_pkce", async () => {
    const h = await harness();
    const clientId = await registeredClient(h);
    const { challenge } = await pkce();
    await expectClientError(h, await authorize(h, { clientId, challenge, method: "plain" }));
    await expectClientError(h, await authorize(h, { clientId, challenge: null }));
  });

  it("authorize_rejects_unregistered_redirect_uri", async () => {
    const h = await harness();
    const clientId = await registeredClient(h);
    const { challenge } = await pkce();
    for (const redirect of [`${CLIENT_REDIRECT}/`, CLIENT_REDIRECT.toUpperCase(), `${CLIENT_REDIRECT}?x=1`]) {
      const r = await authorize(h, { clientId, challenge, redirect });
      expect(r.res.status).toBe(400);
      expect(r.res.headers.get("location")).toBeNull();
    }
  });

  it("authorize_rejects_foreign_resource", async () => {
    const h = await harness();
    const clientId = await registeredClient(h);
    const { challenge } = await pkce();
    for (const resource of ["https://other.example.com/mcp", `${ORIGIN}/mcpx`, `${ORIGIN}/healthz`, "not a url"]) {
      await expectClientError(h, await authorize(h, { clientId, challenge, resource }));
    }
    const allowListed = await authorize(h, { clientId, challenge, resource: `${ORIGIN}/mcp/a/eJyrVkrOz0nNTVGyUkosyczPUyjJzE0FAEi_BvE` });
    expect(allowListed.location?.href.startsWith(`${ISSUER}/authorize`)).toBe(true);
  });

  it("authorize_redirects_to_idp_with_state_and_cookie", async () => {
    const h = await harness();
    const clientId = await registeredClient(h);
    const { challenge } = await pkce();
    const r = await authorize(h, { clientId, challenge });
    expect(r.res.status).toBe(302);
    const loc = r.location!;
    expect(`${loc.origin}${loc.pathname}`).toBe(`${ISSUER}/authorize`);
    expect(loc.searchParams.get("response_type")).toBe("code");
    expect(loc.searchParams.get("client_id")).toBe(IDP_CLIENT_ID);
    expect(loc.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/oauth/callback`);
    expect(loc.searchParams.get("code_challenge_method")).toBe("S256");
    expect(loc.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(loc.searchParams.get("code_challenge")).not.toBe(challenge);
    expect(loc.searchParams.get("nonce")).toMatch(/^[A-Za-z0-9_-]{22,}$/);
    expect(r.state).toBeTruthy();
    expect(r.state).not.toContain("client-state-xyz");
    expect(r.cookie).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("auth_cookie_attributes", async () => {
    const h = await harness();
    const { challenge } = await pkce();
    const r = await authorize(h, { clientId: await registeredClient(h), challenge });
    const attrs = r.setCookie!.split(";").map((s) => s.trim().toLowerCase());
    expect(attrs[0]?.startsWith("__host-sqlmcp-auth=")).toBe(true);
    for (const a of ["httponly", "secure", "samesite=lax", "path=/", "max-age=600"]) expect(attrs).toContain(a);
    expect(attrs.some((a) => a.startsWith("domain="))).toBe(false);
  });

  it("authorize_requests_offline_from_google", async () => {
    const { challenge } = await pkce();
    const google = await harness({ IDP_ISSUER: GOOGLE });
    const g = await authorize(google, { clientId: await registeredClient(google), challenge });
    expect(g.location?.searchParams.get("access_type")).toBe("offline");
    expect(g.location?.searchParams.get("prompt")).toBe("consent");
    const other = await harness();
    const o = await authorize(other, { clientId: await registeredClient(other), challenge });
    expect(o.location?.searchParams.has("access_type")).toBe(false);
    expect(o.location?.searchParams.has("prompt")).toBe(false);
  });
});
