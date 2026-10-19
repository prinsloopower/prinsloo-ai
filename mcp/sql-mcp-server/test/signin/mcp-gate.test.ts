import { afterEach, describe, expect, it, vi } from "vitest";
import {
  begin,
  callback,
  callMcp,
  captureConsole,
  CIMD,
  Clock,
  harness,
  IDP_CLIENT_SECRET,
  ISSUER,
  opLines,
  ORIGIN,
  OTHER_SECRET,
  pkce,
  authorize,
  SECRET,
  signIn,
  timersArmed,
  token,
} from "./helpers.js";

const ALLOW = "/mcp/a/AAAA";

afterEach(() => {
  vi.useRealTimers();
});

describe("S-001 T-008 /mcp gate", () => {
  it("mcp_accepts_valid_signin_with_no_tools", async () => {
    const h = await harness({}, { realMcp: true });
    const s = await signIn(h);
    const res = await callMcp(h, s.access_token);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: 1, result: { tools: [] } });
  });

  it("mcp_handler_receives_staff_identity", async () => {
    const h = await harness();
    await callMcp(h, null);
    expect(h.staffSeen).toEqual([]);
    const s = await signIn(h);
    expect((await callMcp(h, s.access_token)).status).toBe(200);
    expect(h.staffSeen).toEqual([{ sub: "staff-123", name: "Ada Analyst", iss: ISSUER }]);
  });

  it("mcp_accepts_within_skew", async () => {
    const h = await harness();
    const s = await signIn(h);
    h.clock.advance(s.expires_in + 59);
    expect((await callMcp(h, s.access_token)).status).toBe(200);
  });

  it("mcp_rejects_expired_beyond_skew", async () => {
    const h = await harness();
    const s = await signIn(h);
    h.clock.advance(s.expires_in + 61);
    expect((await callMcp(h, s.access_token)).status).toBe(401);
  });

  it("mcp_rejects_wrong_issuer", async () => {
    const clock = new Clock();
    const h = await harness({}, { clock });
    const s = await signIn(h);
    const elsewhere = await harness({ IDP_ISSUER: "https://login.example.org/other/v2.0" }, { clock });
    expect((await callMcp(elsewhere, s.access_token)).status).toBe(401);
    expect((await callMcp(h, s.access_token)).status).toBe(200);
  });

  it("mcp_rejects_wrong_audience", async () => {
    const h = await harness();
    const s = await signIn(h, { resource: `${ORIGIN}${ALLOW}` });
    expect((await callMcp(h, s.access_token, "/mcp")).status).toBe(401);
    expect((await callMcp(h, s.access_token, "/mcp/a/BBBB")).status).toBe(401);
    expect((await callMcp(h, s.access_token, ALLOW)).status).toBe(200);
  });

  it("invalid_token_challenge_names_error", async () => {
    const h = await harness();
    const metadata = `resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`;
    const bad = await callMcp(h, "garbage");
    expect(bad.status).toBe(401);
    expect(bad.headers.get("www-authenticate")).toBe(`Bearer error="invalid_token", ${metadata}`);
    const none = await callMcp(h, null);
    expect(none.headers.get("www-authenticate")).toBe(`Bearer ${metadata}`);
  });

  it("blocked_call_writes_no_log_line", async () => {
    const h = await harness();
    const lines = await captureConsole(async () => {
      await callMcp(h, null);
      await callMcp(h, "garbage");
      await callMcp(h, null, ALLOW);
    });
    expect(lines).toEqual([]);
  });

  it("op_lines_never_contain_secrets", async () => {
    const secrets = [SECRET, OTHER_SECRET, IDP_CLIENT_SECRET, "idp-refresh-1", "idp-code-1", "idp-access"];
    const lines = await captureConsole(async () => {
      await harness({ SERVER_SECRET_PREVIOUS: "bad-previous" });
      const h = await harness({ SERVER_SECRET_PREVIOUS: OTHER_SECRET });
      const s = await signIn(h);
      secrets.push(s.access_token, s.refresh_token!);
      await token(h, { grant_type: "refresh_token", refresh_token: s.refresh_token!, client_id: s.clientId });
      h.idp.routes.set(CIMD, () => Response.json({ client_id: "https://elsewhere.example.com/x.json" }));
      await authorize(h, { clientId: CIMD, challenge: (await pkce()).challenge });
      const b = await begin(h);
      secrets.push(b.state, b.cookie);
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      h.idp.tokenHandler = () => new Promise<Response>(() => {});
      const pending = callback(h, b);
      await timersArmed(1);
      await vi.advanceTimersByTimeAsync(5100);
      await pending;
    });
    const ops = opLines(lines);
    expect(ops.map((o) => o.event)).toEqual(expect.arrayContaining(["config_invalid", "cimd_fetch_failed", "idp_unreachable"]));
    const all = lines.join("\n");
    for (const s of secrets) expect(all).not.toContain(s);
  });
});
