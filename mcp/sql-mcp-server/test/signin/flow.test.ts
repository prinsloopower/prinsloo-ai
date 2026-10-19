import { describe, expect, it } from "vitest";
import { SERVER_INFO } from "../../src/mcp.js";
import { callback, CLIENT_REDIRECT, harness, ISSUER, JSON_HEADERS, ORIGIN, pkce, token } from "./helpers.js";

const ALLOW = "/mcp/a/eJyrVkrOz0nNTVGyUkosyczPUyjJzE0FAEi_BvE";

describe("S-001 T-009 end to end", () => {
  it("signin_flow_end_to_end", async () => {
    const h = await harness({}, { realMcp: true });
    const initialize = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "0" } },
    };
    const mcpHeaders = { ...JSON_HEADERS, accept: "application/json, text/event-stream" };

    // 1. The AI tool calls the connector URL and is told where to sign in.
    const blocked = await h.app.request(`${ORIGIN}${ALLOW}`, { method: "POST", headers: mcpHeaders, body: JSON.stringify(initialize) });
    expect(blocked.status).toBe(401);
    const prmUrl = blocked.headers.get("www-authenticate")!.match(/resource_metadata="([^"]+)"/)![1];
    const prm = (await (await h.app.request(prmUrl)).json()) as { resource: string; authorization_servers: string[] };
    expect(prm.resource).toBe(`${ORIGIN}${ALLOW}`);
    const as = (await (await h.app.request(`${prm.authorization_servers[0]}/.well-known/oauth-authorization-server`)).json()) as Record<string, string>;

    // 2. It registers and starts sign-in.
    const reg = (await (await h.app.request(as.registration_endpoint, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ redirect_uris: [CLIENT_REDIRECT], client_name: "Claude" }),
    })).json()) as { client_id: string };
    const { verifier, challenge } = await pkce();
    const q = new URLSearchParams({
      response_type: "code",
      client_id: reg.client_id,
      redirect_uri: CLIENT_REDIRECT,
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: prm.resource,
      state: "tool-state",
    });
    const toIdp = await h.app.request(`${as.authorization_endpoint}?${q}`);
    const idpUrl = new URL(toIdp.headers.get("location")!);
    expect(idpUrl.href.startsWith(`${ISSUER}/authorize`)).toBe(true);
    h.idp.nonce = idpUrl.searchParams.get("nonce");
    const cookie = toIdp.headers.get("set-cookie")!.match(/__Host-sqlmcp-auth=([^;]+)/)![1];

    // 3. The Identity provider sends the browser back; the Server hands the tool a code.
    const back = await callback(h, { state: idpUrl.searchParams.get("state")!, cookie });
    const toTool = new URL(back.headers.get("location")!);
    expect(toTool.searchParams.get("state")).toBe("tool-state");

    // 4. The tool exchanges it and calls the Server signed in.
    const issued = (await (await token(h, {
      grant_type: "authorization_code",
      code: toTool.searchParams.get("code")!,
      redirect_uri: CLIENT_REDIRECT,
      client_id: reg.client_id,
      code_verifier: verifier,
      resource: prm.resource,
    })).json()) as { access_token: string; refresh_token: string };
    const connected = await h.app.request(`${ORIGIN}${ALLOW}`, {
      method: "POST",
      headers: { ...mcpHeaders, authorization: `Bearer ${issued.access_token}` },
      body: JSON.stringify(initialize),
    });
    expect(connected.status).toBe(200);
    expect(((await connected.json()) as { result: { serverInfo: unknown } }).result.serverInfo).toEqual(SERVER_INFO);

    // 5. Later it renews without the Staff member signing in again.
    h.clock.advance(3000);
    const renewed = (await (await token(h, { grant_type: "refresh_token", refresh_token: issued.refresh_token, client_id: reg.client_id, resource: prm.resource })).json()) as { access_token: string };
    h.clock.advance(1200);
    const still = await h.app.request(`${ORIGIN}${ALLOW}`, {
      method: "POST",
      headers: { ...mcpHeaders, authorization: `Bearer ${renewed.access_token}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });
    expect(await still.json()).toMatchObject({ id: 2, result: { tools: [] } });
  });
});
