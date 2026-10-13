import { describe, expect, it } from "vitest";
import { createApp, NOT_AUTHENTICATED } from "../src/app.js";

const healthy = { ping: async () => {} };
const BASE = "https://sql.example.com";

describe("healthz", () => {
  it("reports ok when the Database answers", async () => {
    const res = await createApp(healthy).request(`${BASE}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", database: "ok" });
  });

  it("reports unreachable without the driver's message when the Database fails", async () => {
    const app = createApp({
      ping: async () => {
        throw new Error('relation "payroll.salaries" does not exist');
      },
    });
    const res = await app.request(`${BASE}/healthz`);
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("salaries");
  });
});

describe("unauthenticated MCP calls", () => {
  it("are blocked with 401 and the not-authenticated message", async () => {
    const res = await createApp(healthy).request(`${BASE}/mcp`, { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe(NOT_AUTHENTICATED);
  });

  it("point the client at protected-resource metadata for the exact path, Allow-list included", async () => {
    const res = await createApp(healthy).request(`${BASE}/mcp/a/eJyrVkrOz0nNTVGyUkosyczPUyjJzE0FAEi_BvE`, {
      method: "POST",
    });
    expect(res.headers.get("www-authenticate")).toBe(
      `Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource/mcp/a/eJyrVkrOz0nNTVGyUkosyczPUyjJzE0FAEi_BvE"`,
    );
  });
});

describe("protected-resource metadata", () => {
  it("names the resource and no authorization server while Sign-in is unconfigured", async () => {
    const res = await createApp(healthy).request(`${BASE}/.well-known/oauth-protected-resource/mcp`);
    expect(await res.json()).toMatchObject({
      resource: `${BASE}/mcp`,
      authorization_servers: [],
    });
  });

  it("names this origin as the authorization server once an Identity provider is set", async () => {
    const app = createApp({ ...healthy, idpIssuer: "https://login.example.com" });
    const res = await app.request(`${BASE}/.well-known/oauth-protected-resource/mcp`);
    expect(await res.json()).toMatchObject({ authorization_servers: [BASE] });
  });
});
