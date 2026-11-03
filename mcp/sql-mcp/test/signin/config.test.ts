import { base64url } from "jose";
import { describe, expect, it } from "vitest";
import { NOT_AUTHENTICATED } from "../../src/app.js";
import { captureConsole, harness, opLines, ORIGIN } from "./helpers.js";

const IDP_VARS = ["IDP_ISSUER", "IDP_CLIENT_ID", "IDP_CLIENT_SECRET"];

describe("configuration", () => {
  it("authorize_503_when_idp_unset", async () => {
    for (const missing of IDP_VARS) {
      const h = await harness({ [missing]: undefined });
      const res = await h.app.request(`${ORIGIN}/authorize?response_type=code&client_id=x`);
      expect(res.status).toBe(503);
      expect(await res.text()).toBe("Sign-in is not configured on this Deployment");
    }
  });

  it("mcp_401_when_idp_unset", async () => {
    for (const missing of IDP_VARS) {
      const h = await harness({ [missing]: undefined });
      const res = await h.app.request(`${ORIGIN}/mcp`, { method: "POST", body: "{}" });
      expect(res.status).toBe(401);
      expect(((await res.json()) as { error: { message: string } }).error.message).toBe(NOT_AUTHENTICATED);
    }
  });

  it("misconfigured_secret_returns_503", async () => {
    for (const secret of [undefined, base64url.encode(new Uint8Array(31).fill(1))]) {
      const h = await harness({ SERVER_SECRET: secret });
      const res = await h.app.request(`${ORIGIN}/mcp`, { method: "POST", body: "{}" });
      expect(res.status).toBe(503);
      expect(await res.text()).toBe("Deployment misconfigured: SERVER_SECRET");
    }
  });

  it("healthz_names_invalid_variable_not_value", async () => {
    const short = base64url.encode(new Uint8Array(31).fill(5));
    const h = await harness({ SERVER_SECRET: short });
    const res = await h.app.request(`${ORIGIN}/healthz`);
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ config: "invalid", variable: "SERVER_SECRET" });
    expect(text).not.toContain(short);
  });

  it("config_invalid_op_line_written", async () => {
    const lines = await captureConsole(async () => {
      const h = await harness({ SERVER_SECRET: "too-short" });
      await h.app.request(`${ORIGIN}/mcp`, { method: "POST", body: "{}" });
    });
    const ops = opLines(lines);
    expect(ops).toContainEqual(expect.objectContaining({ type: "op", event: "config_invalid", variable: "SERVER_SECRET" }));
    for (const op of ops) expect(Number.isNaN(Date.parse(String(op.ts)))).toBe(false);
    expect(lines.join("\n")).not.toContain("too-short");
  });
});
