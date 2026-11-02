import { afterEach, describe, expect, it, vi } from "vitest";
import { IdentityProvider } from "../../src/signin/identity-provider.js";
import {
  authorize,
  begin,
  callback,
  callMcp,
  captureConsole,
  CIMD,
  CLIENT_REDIRECT,
  Clock,
  harness,
  ISSUER,
  opLines,
  OTHER_SECRET,
  pkce,
  RESOURCE,
  SECRET,
  signIn,
  timersArmed,
  token,
  type Harness,
} from "./helpers.js";

// Sign-in edge cases.

function cimdDoc(over: Record<string, unknown> = {}) {
  return { client_id: CIMD, client_name: "Example AI tool", redirect_uris: [CLIENT_REDIRECT], token_endpoint_auth_method: "none", ...over };
}

function serve(h: Harness, url: string, respond: () => Response | Promise<Response>) {
  const u = new URL(url);
  h.idp.routes.set(`${u.origin}${u.pathname}`, respond);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Sign-in edge cases", () => {
  it("cimd_rejects_localhost_with_trailing_dot", async () => {
    const h = await harness();
    const { challenge } = await pkce();
    for (const url of ["https://localhost./c.json", "https://app.localhost./c.json"]) {
      serve(h, url, () => Response.json(cimdDoc({ client_id: url })));
      expect((await authorize(h, { clientId: url, challenge })).res.status).toBe(400);
    }
    expect(h.idp.calls.filter((c) => c.includes("localhost"))).toEqual([]);
  });

  it("cimd_does_not_follow_redirects", async () => {
    const h = await harness();
    const { challenge } = await pkce();
    const target = "https://cdn.example.com/oauth/client.json";
    serve(h, CIMD, () => new Response(null, { status: 302, headers: { location: target } }));
    serve(h, target, () => Response.json(cimdDoc()));
    expect((await authorize(h, { clientId: CIMD, challenge })).res.status).toBe(400);
    expect(h.idp.calls).not.toContain(target);
  });

  it("cimd_network_failure_logged_as_network", async () => {
    const h = await harness();
    const { challenge } = await pkce();
    serve(h, CIMD, () => {
      throw new TypeError("fetch failed");
    });
    const lines = await captureConsole(async () => {
      expect((await authorize(h, { clientId: CIMD, challenge })).res.status).toBe(400);
    });
    expect(opLines(lines)).toContainEqual(expect.objectContaining({ event: "cimd_fetch_failed", host: "client.example.com", reason: "network" }));
  });

  it("idp_body_stall_times_out", async () => {
    const h = await harness();
    const b = await begin(h);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    h.idp.tokenHandler = () =>
      new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "application/json" } });
    const lines = await captureConsole(async () => {
      const pending = callback(h, b);
      await timersArmed(1);
      await vi.advanceTimersByTimeAsync(5100);
      const res = await pending;
      expect(res.status).toBe(502);
      expect(await res.text()).toBe(`The Identity provider at ${ISSUER} did not answer`);
    });
    expect(opLines(lines)).toContainEqual(expect.objectContaining({ event: "idp_unreachable", endpoint: "token" }));
  });

  it("idp_invalid_response_op_line_written", async () => {
    const h = await harness();
    h.idp.routes.set(`${ISSUER}/.well-known/openid-configuration`, () => Response.json({ issuer: ISSUER }));
    const { challenge } = await pkce();
    const clientId = ((await (await h.app.request("https://sql.example.com/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ redirect_uris: [CLIENT_REDIRECT] }),
    })).json()) as { client_id: string }).client_id;
    const lines = await captureConsole(async () => {
      expect((await authorize(h, { clientId, challenge })).res.status).toBe(502);
    });
    const ops = opLines(lines);
    expect(ops).toContainEqual(expect.objectContaining({ event: "idp_invalid_response", issuer: ISSUER, endpoint: "discovery" }));
    expect(ops.some((o) => o.event === "idp_unreachable")).toBe(false);
  });

  it("unexpected_signin_error_is_logged_not_hidden", async () => {
    const h = await harness();
    const b = await begin(h);
    vi.spyOn(IdentityProvider.prototype, "verifyIdToken").mockRejectedValue(new Error("a bug, not a forgery"));
    const lines = await captureConsole(async () => {
      const res = await callback(h, b);
      expect(res.status).toBe(500);
      expect(await res.text()).toBe("The sign-in failed on the Server. Start again from your AI tool");
    });
    expect(opLines(lines)).toContainEqual(expect.objectContaining({ event: "signin_error", endpoint: "callback" }));
    expect(lines.join("\n")).not.toContain("a bug, not a forgery");
  });

  it("refresh_rotation_keeps_original_expiry", async () => {
    const h = await harness();
    let n = 0;
    const s = await signIn(h);
    const initial = h.idp.routes.get(`${ISSUER}/token`)!;
    h.idp.routes.set(`${ISSUER}/token`, async (req, body) =>
      body.get("grant_type") === "refresh_token"
        ? Response.json({ token_type: "Bearer", access_token: "a", id_token: await h.idp.idToken({ nonce: undefined }), refresh_token: `idp-refresh-r${++n}` })
        : initial(req, body),
    );
    let current = s.refresh_token!;
    const month = 30 * 24 * 3600;
    for (const step of [10 * 24 * 3600, 10 * 24 * 3600, 9 * 24 * 3600]) {
      h.clock.advance(step);
      const res = await token(h, { grant_type: "refresh_token", refresh_token: current, client_id: s.clientId, resource: RESOURCE });
      expect(res.status).toBe(200);
      current = ((await res.json()) as { refresh_token: string }).refresh_token;
    }
    h.clock.advance(month - 29 * 24 * 3600 + 1);
    const late = await token(h, { grant_type: "refresh_token", refresh_token: current, client_id: s.clientId, resource: RESOURCE });
    expect(late.status).toBe(400);
  });

  it("cimd_client_completes_token_exchange", async () => {
    const h = await harness({}, { realMcp: true });
    serve(h, CIMD, () => Response.json(cimdDoc()));
    const s = await signIn(h, { clientId: CIMD });
    expect(s.clientId).toBe(CIMD);
    expect((await callMcp(h, s.access_token)).status).toBe(200);
    serve(h, CIMD, () => new Response("gone", { status: 404 }));
    const res = await token(h, { grant_type: "refresh_token", refresh_token: s.refresh_token!, client_id: CIMD, resource: RESOURCE });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_client");
  });

  it("signin_issued_before_rotation_still_reaches_mcp", async () => {
    const clock = new Clock();
    const before = await harness({ SERVER_SECRET: OTHER_SECRET }, { clock });
    const s = await signIn(before);
    const rotated = await harness({ SERVER_SECRET: SECRET, SERVER_SECRET_PREVIOUS: OTHER_SECRET }, { clock });
    expect((await callMcp(rotated, s.access_token)).status).toBe(200);
    const finished = await harness({ SERVER_SECRET: SECRET }, { clock });
    expect((await callMcp(finished, s.access_token)).status).toBe(401);
  });

  it("no_log_line_carries_code_or_id_token", async () => {
    const h = await harness();
    let idToken = "";
    let code = "";
    const lines = await captureConsole(async () => {
      const b = await begin(h);
      h.idp.tokenHandler = async () => {
        idToken = await h.idp.idToken();
        return Response.json({ token_type: "Bearer", access_token: "a", id_token: idToken });
      };
      const res = await callback(h, b);
      code = new URL(res.headers.get("location")!).searchParams.get("code") ?? "";
      await token(h, { grant_type: "authorization_code", code, redirect_uri: CLIENT_REDIRECT, client_id: b.clientId, code_verifier: b.verifier, resource: RESOURCE });
    });
    expect(code).not.toBe("");
    expect(idToken).not.toBe("");
    const all = lines.join("\n");
    expect(all).not.toContain(code);
    expect(all).not.toContain(idToken.split(".")[2]);
  });
});
