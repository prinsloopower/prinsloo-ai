import { generateKeyPair } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  begin,
  callback,
  captureConsole,
  CLIENT_REDIRECT,
  flip,
  harness,
  IDP_CLIENT_SECRET,
  ISSUER,
  opLines,
  timersArmed,
  type Harness,
} from "./helpers.js";

const NOT_VERIFIED = "The sign-in could not be verified. Start again from your AI tool";

async function expectNotVerified(res: Response) {
  expect(res.status).toBe(400);
  expect(res.headers.get("location")).toBeNull();
  expect(await res.text()).toBe(NOT_VERIFIED);
}

function idTokenWith(h: Harness, over: Record<string, unknown>) {
  h.idp.tokenHandler = async () => Response.json({ token_type: "Bearer", access_token: "a", id_token: await h.idp.idToken(over) });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("/oauth/callback", () => {
  it("callback_rejects_cookie_mismatch", async () => {
    const h = await harness();
    const b = await begin(h);
    const other = await begin(h);
    for (const cookie of [null, other.cookie, "x".repeat(43)]) {
      const res = await callback(h, { state: b.state, cookie });
      expect(res.status).toBe(400);
      expect(await res.text()).toBe("This sign-in was started in a different browser. Start again from your AI tool");
    }
  });

  it("callback_rejects_expired_request", async () => {
    const h = await harness();
    const late = await begin(h);
    h.clock.advance(601);
    const res = await callback(h, late);
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("This sign-in started more than 10 minutes ago. Start again from your AI tool");
    const inTime = await begin(h);
    h.clock.advance(599);
    expect((await callback(h, inTime)).status).toBe(302);
  });

  it("callback_rejects_wrong_iss", async () => {
    const h = await harness();
    const b = await begin(h);
    idTokenWith(h, { iss: "https://evil.example.com" });
    await expectNotVerified(await callback(h, b));
  });

  it("callback_rejects_wrong_aud", async () => {
    const h = await harness();
    const b = await begin(h);
    idTokenWith(h, { aud: "some-other-client" });
    await expectNotVerified(await callback(h, b));
  });

  it("callback_rejects_expired_id_token", async () => {
    const h = await harness();
    const b = await begin(h);
    idTokenWith(h, { exp: h.clock.sec - 120 });
    await expectNotVerified(await callback(h, b));
  });

  it("callback_rejects_wrong_nonce", async () => {
    const h = await harness();
    const b = await begin(h);
    idTokenWith(h, { nonce: "not-the-nonce-we-sent" });
    await expectNotVerified(await callback(h, b));
  });

  it("callback_rejects_disallowed_id_token_alg", async () => {
    const h = await harness();
    const rs384 = await generateKeyPair("RS384", { extractable: true });
    h.idp.extraKeys.push({ kid: "k384", alg: "RS384", key: rs384.publicKey });
    const forged = [
      () => h.idp.idToken({}, { alg: "none" }),
      () => h.idp.idToken({}, { alg: "HS256", key: new TextEncoder().encode(IDP_CLIENT_SECRET) }),
      () => h.idp.idToken({}, { alg: "RS384", kid: "k384", key: rs384.privateKey }),
    ];
    for (const make of forged) {
      const b = await begin(h);
      h.idp.tokenHandler = async () => Response.json({ token_type: "Bearer", access_token: "a", id_token: await make() });
      await expectNotVerified(await callback(h, b));
    }
  });

  it("callback_rejects_tampered_state", async () => {
    const h = await harness();
    const b = await begin(h);
    await expectNotVerified(await callback(h, { ...b, state: flip(b.state) }));
    await expectNotVerified(await callback(h, { ...b, state: "not-a-token" }));
  });

  it("callback_shows_provider_refusal", async () => {
    const h = await harness();
    const b = await begin(h);
    const denied = await callback(h, { ...b, error: "access_denied" });
    expect(denied.status).toBe(400);
    expect(await denied.text()).toBe("The Identity provider refused the sign-in: access_denied");
    const c = await begin(h);
    h.idp.tokenHandler = () => Response.json({ error: "invalid_grant" }, { status: 400 });
    const refused = await callback(h, c);
    expect(refused.status).toBe(400);
    expect(await refused.text()).toBe("The Identity provider refused the sign-in: invalid_grant");
  });

  it("callback_idp_timeout_names_provider", async () => {
    const h = await harness();
    const b = await begin(h);
    const c = await begin(h);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const answerAfter = (ms: number) => async () => {
      const idToken = await h.idp.idToken();
      return new Promise<Response>((resolve) => setTimeout(() => resolve(Response.json({ token_type: "Bearer", access_token: "a", id_token: idToken })), ms));
    };
    h.idp.tokenHandler = answerAfter(5100);
    const slow = callback(h, b);
    await timersArmed(2);
    await vi.advanceTimersByTimeAsync(5200);
    const res = await slow;
    expect(res.status).toBe(502);
    expect(await res.text()).toBe(`The Identity provider at ${ISSUER} did not answer`);
    h.idp.tokenHandler = answerAfter(4900);
    const quick = callback(h, c);
    await timersArmed(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect((await quick).status).toBe(302);
  });

  it("idp_unreachable_op_line_written", async () => {
    const h = await harness();
    const b = await begin(h);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    h.idp.tokenHandler = () => new Promise<Response>(() => {});
    const lines = await captureConsole(async () => {
      const pending = callback(h, b);
      await timersArmed(1);
      await vi.advanceTimersByTimeAsync(5100);
      await pending;
    });
    expect(opLines(lines)).toContainEqual(expect.objectContaining({ event: "idp_unreachable", issuer: ISSUER, endpoint: "token", ms: 5000 }));
  });

  it("jwks_cached_and_refetch_limited", async () => {
    const h = await harness();
    expect((await callback(h, await begin(h))).status).toBe(302);
    expect((await callback(h, await begin(h))).status).toBe(302);
    expect(h.idp.callsTo("/keys")).toBe(1);
    expect(h.idp.callsTo("/.well-known/openid-configuration")).toBe(1);

    h.idp.key = await generateKeyPair("RS256", { extractable: true });
    h.idp.kid = "k2";
    expect((await callback(h, await begin(h))).status).toBe(302);
    expect(h.idp.callsTo("/keys")).toBe(2);

    const unknown = await begin(h);
    h.idp.tokenHandler = async () => Response.json({ token_type: "Bearer", access_token: "a", id_token: await h.idp.idToken({}, { kid: "k-unknown" }) });
    await expectNotVerified(await callback(h, unknown));
    expect(h.idp.callsTo("/keys")).toBe(2);

    h.clock.advance(61);
    await expectNotVerified(await callback(h, await begin(h)));
    expect(h.idp.callsTo("/keys")).toBe(3);

    h.idp.tokenHandler = undefined;
    h.clock.advance(601);
    expect((await callback(h, await begin(h))).status).toBe(302);
    expect(h.idp.callsTo("/.well-known/openid-configuration")).toBe(2);
  });

  it("callback_redirects_with_code_and_client_state", async () => {
    const h = await harness();
    const b = await begin(h);
    const res = await callback(h, b);
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location")!);
    expect(`${loc.origin}${loc.pathname}`).toBe(CLIENT_REDIRECT);
    expect(loc.searchParams.get("state")).toBe("client-state-xyz");
    expect(loc.searchParams.get("code")).toBeTruthy();
    expect(loc.searchParams.get("code")).not.toBe("idp-code-1");
    expect(res.headers.get("set-cookie")?.toLowerCase()).toContain("max-age=0");
    expect(h.idp.lastTokenBody?.get("code")).toBe("idp-code-1");
    expect(h.idp.lastTokenBody?.get("code_verifier")).toBeTruthy();
    expect(h.idp.lastTokenBody?.get("redirect_uri")).toBe("https://sql.example.com/oauth/callback");
  });
});
