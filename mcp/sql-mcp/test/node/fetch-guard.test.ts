import type { LookupAddress } from "node:dns";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { guardedFetch, guardedLookup, type Resolve } from "../../src/node-fetch.js";
import { nodeDeps } from "../../src/node-deps.js";
import { salesDatabase } from "../listing/fake-database.js";
import { baseEnv, captureConsole, CIMD, CLIENT_REDIRECT, ORIGIN, opLines, pkce } from "../signin/helpers.js";

const PUBLIC = "93.184.215.14";
const PRIVATE = ["127.0.0.1", "10.0.0.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1"];

/** A resolver that answers every host with `addresses`, and remembers what it was asked. */
function resolver(...addresses: string[]): Resolve & { asked: string[] } {
  const asked: string[] = [];
  const resolve = async (host: string) => {
    asked.push(host);
    return addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };
  return Object.assign(resolve, { asked });
}

/** Whether a fetch was refused by the guard, rather than failing for some other reason. */
async function refused(fetching: Promise<Response>): Promise<boolean> {
  try {
    await fetching;
    return false;
  } catch (e) {
    const byGuard = (e as { cause?: { code?: string } }).cause?.code === "ERR_PRIVATE_ADDRESS";
    // A refusal fails as an unreachable host does.
    if (byGuard) expect(e).toBeInstanceOf(TypeError);
    return byGuard;
  }
}

/** What the connect-time lookup hands the socket: the addresses, or the error that stops it. */
function lookUp(resolve: Resolve, all: boolean): Promise<{ error?: NodeJS.ErrnoException | null; addresses?: LookupAddress[] }> {
  return new Promise((done) => {
    guardedLookup(resolve)("client.example.com", { all }, (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => {
      if (error) return done({ error });
      done({ addresses: Array.isArray(address) ? address : [{ address, family: family ?? 4 }] });
    });
  });
}

describe("the container's guarded fetch", () => {
  it("guarded_fetch_refuses_private_and_special_addresses", async () => {
    for (const address of PRIVATE) {
      const resolve = resolver(address);
      expect(await refused(guardedFetch({ resolve })("https://client.example.com/oauth/client.json")), address).toBe(true);
      expect(resolve.asked, address).toEqual(["client.example.com"]);
      for (const all of [true, false]) expect((await lookUp(resolve, all)).error?.code, address).toBe("ERR_PRIVATE_ADDRESS");
    }
  });

  it("guarded_fetch_refuses_when_any_address_is_private", async () => {
    for (const address of PRIVATE) {
      const resolve = resolver(PUBLIC, address);
      expect(await refused(guardedFetch({ resolve })("https://client.example.com/oauth/client.json")), address).toBe(true);
      expect((await lookUp(resolve, true)).error?.code).toBe("ERR_PRIVATE_ADDRESS");
    }
  });

  it("guarded_fetch_refuses_ipv4_mapped_private", async () => {
    const resolve = resolver("::ffff:10.0.0.1");
    expect(await refused(guardedFetch({ resolve })("https://client.example.com/x"))).toBe(true);
    expect(await refused(guardedFetch({ resolve: resolver(PUBLIC) })("https://[::ffff:10.0.0.1]/x"))).toBe(true);
    expect(await refused(guardedFetch({ resolve: resolver(PUBLIC) })("https://[::ffff:7f00:1]/x"))).toBe(true);
  });

  it("guarded_fetch_refuses_ip_literal_hosts", async () => {
    for (const url of ["https://169.254.169.254/x", "https://10.0.0.1/x", "https://[::1]/x", "https://0x7f.1/x", "https://[fd00::1]/x"]) {
      const resolve = resolver(PUBLIC);
      expect(await refused(guardedFetch({ resolve })(url)), url).toBe(true);
      // A literal never reaches DNS, so the check cannot sit in the lookup alone.
      expect(resolve.asked, url).toEqual([]);
    }
    expect(await refused(guardedFetch({ resolve: resolver(PUBLIC) })(new Request("https://10.0.0.1/x")))).toBe(true);
  });

  it("guarded_fetch_allows_public_address", async () => {
    for (const all of [true, false]) {
      expect(await lookUp(resolver(PUBLIC), all)).toEqual({ addresses: [{ address: PUBLIC, family: 4 }] });
    }
    expect(await lookUp(resolver(PUBLIC, "2606:2800:21f:cb07:6820:80da:af6b:8b2c"), true)).toEqual({
      addresses: [{ address: PUBLIC, family: 4 }, { address: "2606:2800:21f:cb07:6820:80da:af6b:8b2c", family: 6 }],
    });
    // A public literal passes the guard; nothing answers there, so it fails as unreachable instead.
    expect(await refused(guardedFetch({ resolve: resolver() })("https://203.0.113.5/x", { signal: AbortSignal.timeout(300) }))).toBe(false);
  });

  it("cimd_private_host_ends_in_invalid_client", async () => {
    const resolve = resolver("10.0.0.1");
    const env = baseEnv({ ENGINE: "mssql", DATABASE_URL: "Server=a;Database=b", PUBLIC_URL: ORIGIN, IDP_ISSUER: "https://login.example.com/tenant/v2.0" });
    const app = createApp(nodeDeps(env, () => salesDatabase(), { resolve }));
    const lines = await captureConsole(async () => {
      const token = await app.request(`${ORIGIN}/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: "r", client_id: CIMD, resource: `${ORIGIN}/mcp` }).toString(),
      });
      expect(token.status).toBe(401);
      expect(((await token.json()) as { error: string }).error).toBe("invalid_client");
      const { challenge } = await pkce();
      const q = new URLSearchParams({ response_type: "code", client_id: CIMD, redirect_uri: CLIENT_REDIRECT, code_challenge: challenge, code_challenge_method: "S256", resource: `${ORIGIN}/mcp`, state: "s" });
      expect((await app.request(`${ORIGIN}/authorize?${q}`)).status).toBe(400);
    });
    expect(resolve.asked).toContain("client.example.com");
    expect(opLines(lines).filter((o) => o.event === "cimd_fetch_failed")).toEqual([
      expect.objectContaining({ host: "client.example.com", reason: "network" }),
      expect.objectContaining({ host: "client.example.com", reason: "network" }),
    ]);
  });
});
