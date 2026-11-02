import { describe, expect, it } from "vitest";
import { harness, ORIGIN, RESOURCE } from "./helpers.js";

describe("metadata", () => {
  it("as_metadata_lists_endpoints_and_s256", async () => {
    const h = await harness();
    const res = await h.app.request(`${ORIGIN}/.well-known/oauth-authorization-server`);
    expect(res.status).toBe(200);
    const m = (await res.json()) as Record<string, unknown>;
    expect(m).toMatchObject({
      issuer: ORIGIN,
      authorization_endpoint: `${ORIGIN}/authorize`,
      token_endpoint: `${ORIGIN}/token`,
      registration_endpoint: `${ORIGIN}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      client_id_metadata_document_supported: true,
    });
    expect(m.code_challenge_methods_supported).toEqual(["S256"]);
  });

  it("prm_names_origin_only_when_configured", async () => {
    const on = await harness();
    const configured = await on.app.request(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`);
    expect(await configured.json()).toMatchObject({ resource: RESOURCE, authorization_servers: [ORIGIN] });
    for (const missing of ["IDP_ISSUER", "IDP_CLIENT_ID", "IDP_CLIENT_SECRET"]) {
      const off = await harness({ [missing]: undefined });
      const res = await off.app.request(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`);
      expect(((await res.json()) as { authorization_servers: string[] }).authorization_servers).toEqual([]);
    }
  });
});
