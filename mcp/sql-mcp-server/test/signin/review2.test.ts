import { afterEach, describe, expect, it, vi } from "vitest";
import { IdentityProvider } from "../../src/signin/identity-provider.js";
import { Tokens } from "../../src/signin/tokens.js";
import { begin, callback, captureConsole, harness, ISSUER, opLines, RESOURCE, signIn, token } from "./helpers.js";

// More Sign-in edge cases.

afterEach(() => {
  vi.restoreAllMocks();
});

describe("more Sign-in edge cases", () => {
  it("token_endpoint_outage_is_temporary", async () => {
    const h = await harness();
    const s = await signIn(h);
    const initial = h.idp.routes.get(`${ISSUER}/token`)!;
    h.idp.routes.set(`${ISSUER}/token`, (req, body) =>
      body.get("grant_type") === "refresh_token" ? new Response("upstream down", { status: 503 }) : initial(req, body),
    );
    const lines = await captureConsole(async () => {
      const res = await token(h, { grant_type: "refresh_token", refresh_token: s.refresh_token!, client_id: s.clientId, resource: RESOURCE });
      expect(res.status).toBe(503);
      expect(((await res.json()) as { error: string }).error).toBe("temporarily_unavailable");
    });
    expect(opLines(lines)).toContainEqual(expect.objectContaining({ event: "idp_invalid_response", issuer: ISSUER, endpoint: "token" }));

    const b = await begin(h);
    h.idp.routes.set(`${ISSUER}/token`, () => Response.json({ error: "server_error" }, { status: 500 }));
    const cb = await callback(h, b);
    expect(cb.status).toBe(502);
    expect(await cb.text()).toBe(`The Identity provider at ${ISSUER} did not answer`);
  });

  it("refresh_server_fault_is_logged", async () => {
    const h = await harness();
    const s = await signIn(h);
    vi.spyOn(IdentityProvider.prototype, "verifyIdToken").mockRejectedValue(new Error("a bug in refresh"));
    const lines = await captureConsole(async () => {
      const res = await token(h, { grant_type: "refresh_token", refresh_token: s.refresh_token!, client_id: s.clientId, resource: RESOURCE });
      expect(res.status).toBe(500);
      expect(((await res.json()) as { error: string }).error).toBe("server_error");
    });
    expect(opLines(lines)).toContainEqual(expect.objectContaining({ event: "signin_error", endpoint: "token" }));
    expect(lines.join("\n")).not.toContain("a bug in refresh");
  });

  it("uncaught_fault_logged_without_stack", async () => {
    const h = await harness();
    const b = await begin(h);
    vi.spyOn(Tokens.prototype, "issue").mockRejectedValue(new Error("issuing broke"));
    const lines = await captureConsole(async () => {
      const res = await callback(h, b);
      expect(res.status).toBe(500);
    });
    expect(opLines(lines)).toContainEqual(expect.objectContaining({ event: "server_fault", path: "/oauth/callback" }));
    expect(lines.join("\n")).not.toContain("issuing broke");
  });
});
