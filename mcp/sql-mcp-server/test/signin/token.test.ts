import { describe, expect, it } from "vitest";
import {
  CLIENT_REDIRECT,
  Clock,
  codeFor,
  harness,
  IDP_CLIENT_SECRET,
  ORIGIN,
  pkce,
  registeredClient,
  RESOURCE,
  signIn,
  token,
  type Harness,
} from "./helpers.js";

async function exchange(h: Harness, c: { code: string; clientId: string; verifier: string }, over: Partial<Record<string, string>> = {}) {
  return token(h, {
    grant_type: "authorization_code",
    code: c.code,
    redirect_uri: CLIENT_REDIRECT,
    client_id: c.clientId,
    code_verifier: c.verifier,
    resource: RESOURCE,
    ...over,
  });
}

async function refresh(h: Harness, refreshToken: string, clientId: string, over: Record<string, string> = {}) {
  return token(h, { grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, resource: RESOURCE, ...over });
}

async function errorOf(res: Response) {
  expect(res.status).toBe(400);
  return ((await res.json()) as { error: string }).error;
}

function idpAnswersRefresh(h: Harness, answer: (body: URLSearchParams) => Promise<Response> | Response) {
  const initial = h.idp.routes.get(`${h.idp.issuer}/token`)!;
  h.idp.tokenHandler = undefined;
  h.idp.routes.set(`${h.idp.issuer}/token`, (req, body) => (body.get("grant_type") === "refresh_token" ? answer(body) : initial(req, body)));
}

describe("/token", () => {
  it("token_requires_matching_verifier", async () => {
    const h = await harness();
    const c = await codeFor(h);
    const { verifier: wrong } = await pkce();
    expect(await errorOf(await exchange(h, c, { code_verifier: wrong }))).toBe("invalid_grant");
    const c2 = await codeFor(h);
    const ok = await exchange(h, c2);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ token_type: "Bearer" });
  });

  it("token_rejects_expired_code", async () => {
    const h = await harness();
    const late = await codeFor(h);
    h.clock.advance(61);
    expect(await errorOf(await exchange(h, late))).toBe("invalid_grant");
    const inTime = await codeFor(h);
    h.clock.advance(59);
    expect((await exchange(h, inTime)).status).toBe(200);
  });

  it("token_rejects_mismatched_client_redirect_or_resource", async () => {
    const h = await harness();
    const otherClient = await registeredClient(h);
    for (const over of [{ client_id: otherClient }, { redirect_uri: `${CLIENT_REDIRECT}/other` }, { resource: `${ORIGIN}/mcp/a/AAAA` }]) {
      const c = await codeFor(h);
      expect(await errorOf(await exchange(h, c, over))).toBe("invalid_grant");
    }
  });

  it("signin_exp_capped_at_24h", async () => {
    const h = await harness();
    h.idp.idClaims = { exp: h.clock.sec + 48 * 3600 };
    expect((await signIn(h)).expires_in).toBe(24 * 3600);
    h.idp.idClaims = { exp: h.clock.sec + 3600 };
    expect((await signIn(h)).expires_in).toBe(3600);
  });

  it("refresh_rejects_other_client_resource_or_issuer", async () => {
    const clock = new Clock();
    const h = await harness({}, { clock });
    const s = await signIn(h);
    const otherClient = await registeredClient(h);
    expect(await errorOf(await refresh(h, s.refresh_token!, otherClient))).toBe("invalid_grant");
    expect(await errorOf(await refresh(h, s.refresh_token!, s.clientId, { resource: `${ORIGIN}/mcp/a/AAAA` }))).toBe("invalid_grant");
    const elsewhere = await harness({ IDP_ISSUER: "https://login.example.org/other/v2.0" }, { clock });
    expect(await errorOf(await refresh(elsewhere, s.refresh_token!, s.clientId))).toBe("invalid_grant");
    expect((await refresh(h, s.refresh_token!, s.clientId)).status).toBe(200);
  });

  it("refresh_token_only_when_idp_issues_one", async () => {
    const h = await harness();
    expect((await signIn(h)).refresh_token).toBeTruthy();
    h.idp.refreshToken = undefined;
    expect((await signIn(h)).refresh_token).toBeUndefined();
  });

  it("refresh_token_exp_30_days_or_provider", async () => {
    const h = await harness();
    const month = 30 * 24 * 3600;
    const a = await signIn(h);
    const b = await signIn(h);
    h.clock.advance(month - 1);
    expect((await refresh(h, a.refresh_token!, a.clientId)).status).toBe(200);
    h.clock.advance(2);
    expect(await errorOf(await refresh(h, b.refresh_token!, b.clientId))).toBe("invalid_grant");

    const p = await harness();
    p.idp.tokenHandler = async () =>
      Response.json({ token_type: "Bearer", access_token: "a", id_token: await p.idp.idToken(), refresh_token: "idp-refresh-short", refresh_token_expires_in: 3600 });
    const short = await signIn(p);
    p.idp.tokenHandler = undefined;
    p.clock.advance(3601);
    expect(await errorOf(await refresh(p, short.refresh_token!, short.clientId))).toBe("invalid_grant");
  });

  it("refresh_renews_through_idp", async () => {
    const h = await harness();
    const s = await signIn(h);
    h.clock.advance(1800);
    const res = await refresh(h, s.refresh_token!, s.clientId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    expect(body.access_token).not.toBe(s.access_token);
    expect(body.expires_in).toBe(3600);
    expect(h.idp.lastTokenBody?.get("grant_type")).toBe("refresh_token");
    expect(h.idp.lastTokenBody?.get("refresh_token")).toBe("idp-refresh-1");
    expect(h.idp.lastTokenBody?.get("client_secret")).toBe(IDP_CLIENT_SECRET);
  });

  it("refresh_requires_verified_id_token_same_sub", async () => {
    const h = await harness();
    const s = await signIn(h);
    const answers = [
      async () => Response.json({ token_type: "Bearer", access_token: "a" }),
      async () => Response.json({ token_type: "Bearer", access_token: "a", id_token: await h.idp.idToken({ sub: "someone-else" }) }),
      async () => Response.json({ token_type: "Bearer", access_token: "a", id_token: await h.idp.idToken({ aud: "other" }) }),
      async () => Response.json({ token_type: "Bearer", access_token: "a", id_token: await h.idp.idToken({}, { alg: "none" }) }),
    ];
    for (const answer of answers) {
      idpAnswersRefresh(h, answer);
      expect(await errorOf(await refresh(h, s.refresh_token!, s.clientId))).toBe("invalid_grant");
    }
    idpAnswersRefresh(h, async () => Response.json({ token_type: "Bearer", access_token: "a", id_token: await h.idp.idToken({ exp: h.clock.sec + 600, nonce: undefined }) }));
    const ok = await refresh(h, s.refresh_token!, s.clientId);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { expires_in: number }).expires_in).toBe(600);
  });

  it("refresh_carries_rotated_idp_refresh_token", async () => {
    const h = await harness();
    const s = await signIn(h);
    idpAnswersRefresh(h, async () => Response.json({ token_type: "Bearer", access_token: "a", id_token: await h.idp.idToken(), refresh_token: "idp-refresh-2" }));
    const first = (await (await refresh(h, s.refresh_token!, s.clientId)).json()) as { refresh_token: string };
    expect(first.refresh_token).toBeTruthy();
    expect(first.refresh_token).not.toBe(s.refresh_token);
    await refresh(h, first.refresh_token, s.clientId);
    expect(h.idp.lastTokenBody?.get("refresh_token")).toBe("idp-refresh-2");
  });

  it("refresh_rejected_when_idp_refuses", async () => {
    const h = await harness();
    const s = await signIn(h);
    idpAnswersRefresh(h, () => Response.json({ error: "invalid_grant", error_description: "user removed" }, { status: 400 }));
    const res = await refresh(h, s.refresh_token!, s.clientId);
    expect(await errorOf(res)).toBe("invalid_grant");
  });
});
