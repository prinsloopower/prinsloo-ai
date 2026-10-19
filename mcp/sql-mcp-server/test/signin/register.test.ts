import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authorize,
  captureConsole,
  CIMD,
  CLIENT_REDIRECT,
  flip,
  harness,
  ISSUER,
  opLines,
  pkce,
  register,
  type Harness,
} from "./helpers.js";

function cimdDoc(over: Record<string, unknown> = {}) {
  return { client_id: CIMD, client_name: "Example AI tool", redirect_uris: [CLIENT_REDIRECT], token_endpoint_auth_method: "none", ...over };
}

function serveCimd(h: Harness, url: string, respond: () => Response | Promise<Response>) {
  const u = new URL(url);
  h.idp.routes.set(`${u.origin}${u.pathname}`, respond);
}

function cimdCalls(h: Harness) {
  return h.idp.calls.filter((c) => !c.startsWith(ISSUER));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("S-001 T-004 registration", () => {
  it("register_issues_signed_client_id", async () => {
    const h = await harness();
    const res = await register(h);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { client_id: string };
    expect(body).toMatchObject({ redirect_uris: [CLIENT_REDIRECT], client_name: "Claude", token_endpoint_auth_method: "none" });
    const { challenge } = await pkce();
    const accepted = await authorize(h, { clientId: body.client_id, challenge });
    expect(accepted.res.status).toBe(302);
    expect(accepted.location?.href.startsWith(`${ISSUER}/authorize`)).toBe(true);
    const altered = await authorize(h, { clientId: flip(body.client_id), challenge });
    expect(altered.res.status).toBe(400);
  });

  it("register_rejects_bad_redirect_uris", async () => {
    const h = await harness();
    const bad = [
      [],
      ["http://evil.example.com/cb"],
      ["ftp://files.example.com/cb"],
      ["not a url"],
      Array.from({ length: 6 }, (_, i) => `https://tool.example.com/cb/${i}`),
    ];
    for (const uris of bad) {
      const res = await register(h, uris);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe("invalid_redirect_uri");
    }
    for (const uris of [["http://localhost:33418/cb"], ["http://127.0.0.1/cb"], Array.from({ length: 5 }, (_, i) => `https://tool.example.com/cb/${i}`)]) {
      expect((await register(h, uris)).status).toBe(201);
    }
  });

  it("register_rejects_long_client_name", async () => {
    const h = await harness();
    const long = await register(h, [CLIENT_REDIRECT], "x".repeat(101));
    expect(long.status).toBe(400);
    expect(((await long.json()) as { error: string }).error).toBe("invalid_client_metadata");
    expect((await register(h, [CLIENT_REDIRECT], "x".repeat(100))).status).toBe(201);
  });

  it("cimd_rejects_unsafe_url_without_fetching", async () => {
    const h = await harness();
    const { challenge } = await pkce();
    const unsafe = [
      "http://client.example.com/c.json",
      "https://client.example.com:8443/c.json",
      "https://client.example.com/",
      "https://client.example.com/c.json?x=1",
      "https://client.example.com/c.json#frag",
      "https://user:pw@client.example.com/c.json",
      "https://203.0.113.5/c.json",
      "https://[2001:db8::1]/c.json",
      "https://localhost/c.json",
    ];
    for (const url of unsafe) {
      serveCimd(h, url, () => Response.json(cimdDoc({ client_id: url })));
      const r = await authorize(h, { clientId: url, challenge });
      expect(r.res.status).toBe(400);
    }
    expect(cimdCalls(h)).toEqual([]);
  });

  it("cimd_rejects_redirect_oversize_or_slow", async () => {
    const h = await harness();
    const { challenge } = await pkce();
    serveCimd(h, CIMD, () => new Response(null, { status: 302, headers: { location: "https://elsewhere.example.com/c.json" } }));
    expect((await authorize(h, { clientId: CIMD, challenge })).res.status).toBe(400);

    const padded = JSON.stringify(cimdDoc({ pad: "x".repeat(16 * 1024) }));
    serveCimd(h, CIMD, () => new Response(padded, { headers: { "content-type": "application/json" } }));
    expect((await authorize(h, { clientId: CIMD, challenge })).res.status).toBe(400);

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const after = (ms: number) => () => new Promise<Response>((resolve) => setTimeout(() => resolve(Response.json(cimdDoc())), ms));
    serveCimd(h, CIMD, after(3100));
    const slow = authorize(h, { clientId: CIMD, challenge });
    await vi.advanceTimersByTimeAsync(3200);
    expect((await slow).res.status).toBe(400);
    serveCimd(h, CIMD, after(2900));
    const quick = authorize(h, { clientId: CIMD, challenge });
    await vi.advanceTimersByTimeAsync(3000);
    expect((await quick).res.status).toBe(302);
  });

  it("cimd_rejects_non_json", async () => {
    const h = await harness();
    const { challenge } = await pkce();
    serveCimd(h, CIMD, () => new Response(JSON.stringify(cimdDoc()), { headers: { "content-type": "text/html" } }));
    expect((await authorize(h, { clientId: CIMD, challenge })).res.status).toBe(400);
    serveCimd(h, CIMD, () => Response.json(cimdDoc()));
    expect((await authorize(h, { clientId: CIMD, challenge })).res.status).toBe(302);
  });

  it("cimd_rejects_client_id_mismatch", async () => {
    const h = await harness();
    const { challenge } = await pkce();
    serveCimd(h, CIMD, () => Response.json(cimdDoc({ client_id: "https://client.example.com/oauth/other.json" })));
    expect((await authorize(h, { clientId: CIMD, challenge })).res.status).toBe(400);
    serveCimd(h, CIMD, () => Response.json(cimdDoc()));
    expect((await authorize(h, { clientId: CIMD, challenge })).res.status).toBe(302);
  });

  it("cimd_fetch_failed_op_line_names_host_only", async () => {
    const h = await harness();
    const { challenge } = await pkce();
    const url = "https://client.example.com/private-path-segment/client.json";
    serveCimd(h, url, () => Response.json(cimdDoc({ client_id: CIMD })));
    const lines = await captureConsole(async () => {
      await authorize(h, { clientId: url, challenge });
    });
    const ops = opLines(lines).filter((o) => o.event === "cimd_fetch_failed");
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ host: "client.example.com", reason: "client_id_mismatch" });
    expect(lines.join("\n")).not.toContain("private-path-segment");
  });
});
