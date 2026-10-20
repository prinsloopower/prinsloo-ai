import { describe, expect, it } from "vitest";
import { authorize, callback, harness, ISSUER, pkce, RESOURCE, token } from "./helpers.js";

// Found in S-001 verification: native AI tools (ChatGPT desktop, Codex) register a loopback
// redirect URI without a port and listen on a random one (RFC 8252 section 7.3; D-072).

const CODEX = "https://client.example.com/oauth/codex/client.json";

describe("S-001 verification fix: loopback redirect ports", () => {
  it("loopback_redirect_port_may_vary", async () => {
    const h = await harness();
    h.idp.routes.set(CODEX, () =>
      Response.json({ client_id: CODEX, client_name: "Codex", redirect_uris: ["http://127.0.0.1/callback/abc", "http://localhost/callback/abc"] }),
    );
    const { verifier, challenge } = await pkce();

    for (const redirect of ["http://127.0.0.1:54414/callback/abc", "http://localhost:6001/callback/abc", "http://127.0.0.1/callback/abc"]) {
      const r = await authorize(h, { clientId: CODEX, challenge, redirect });
      expect(r.location?.href.startsWith(`${ISSUER}/authorize`)).toBe(true);
    }
    for (const redirect of [
      "http://127.0.0.1:54414/callback/other",
      "http://127.0.0.1:54414/callback/abc?x=1",
      "https://127.0.0.1:54414/callback/abc",
      "http://127.0.0.2:54414/callback/abc",
      "http://127.0.0.1.evil.example.com:54414/callback/abc",
    ]) {
      expect((await authorize(h, { clientId: CODEX, challenge, redirect })).res.status).toBe(400);
    }

    const httpsTool = await harness();
    httpsTool.idp.routes.set(CODEX, () => Response.json({ client_id: CODEX, redirect_uris: ["https://tool.example.com/cb"] }));
    expect((await authorize(httpsTool, { clientId: CODEX, challenge, redirect: "https://tool.example.com:8443/cb" })).res.status).toBe(400);

    const redirect = "http://127.0.0.1:54414/callback/abc";
    const started = await authorize(h, { clientId: CODEX, challenge, redirect });
    const back = await callback(h, { state: started.state!, cookie: started.cookie });
    const sentTo = new URL(back.headers.get("location")!);
    expect(`${sentTo.origin}${sentTo.pathname}`).toBe(redirect);
    const code = sentTo.searchParams.get("code")!;
    const form = { grant_type: "authorization_code", code, client_id: CODEX, code_verifier: verifier, resource: RESOURCE };
    expect((await token(h, { ...form, redirect_uri: "http://127.0.0.1:60000/callback/abc" })).status).toBe(400);
    expect((await token(h, { ...form, redirect_uri: redirect })).status).toBe(200);
  });
});
