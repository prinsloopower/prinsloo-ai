import type { LookupAddress } from "node:dns";
import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import type { Fetch } from "./signin/util.js";

/** Resolves a host name to every address it has. */
export type Resolve = (hostname: string) => Promise<{ address: string; family: number }[]>;

const systemResolve: Resolve = (hostname) => dnsLookup(hostname, { all: true, verbatim: true });

/**
 * Addresses a fetch made on a caller's behalf may not reach (security.md, Fetches): loopback,
 * RFC 1918, link-local, CGNAT, ULA and multicast, plus the unspecified and reserved ranges, which
 * reach the host itself or nothing. IPv4-mapped IPv6 addresses match the IPv4 rules.
 */
const NOT_PUBLIC = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.168.0.0", 16], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) NOT_PUBLIC.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const) {
  NOT_PUBLIC.addSubnet(network, prefix, "ipv6");
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  return family !== 0 && !NOT_PUBLIC.check(address, family === 4 ? "ipv4" : "ipv6");
}

function privateAddress(): NodeJS.ErrnoException {
  return Object.assign(new Error("The address is not public"), { code: "ERR_PRIVATE_ADDRESS" });
}

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * The socket's own lookup: every address the host resolves to must be public, and the socket
 * connects to the addresses checked, so a DNS answer cannot change between check and use.
 */
export function guardedLookup(resolve: Resolve) {
  return (hostname: string, options: { all?: boolean }, callback: LookupCallback): void => {
    resolve(hostname).then(
      (addresses) => {
        if (addresses.length === 0 || !addresses.every((a) => isPublicAddress(a.address))) return callback(privateAddress(), "");
        const found = addresses.map((a) => ({ address: a.address, family: a.family }));
        if (options.all) callback(null, found);
        else callback(null, found[0]!.address, found[0]!.family);
      },
      (error: NodeJS.ErrnoException) => callback(error, ""),
    );
  };
}

/**
 * The container's fetch for the Client ID Metadata Document and the Identity provider. A host
 * written as an IP literal never reaches the lookup, so it is checked here first. A refused fetch
 * fails as an unreachable one does.
 */
export function guardedFetch(opts: { resolve?: Resolve } = {}): Fetch {
  const dispatcher = new Agent({ connect: { lookup: guardedLookup(opts.resolve ?? systemResolve) } });
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const host = url.hostname.replace(/^\[(.*)\]$/, "$1");
    if (isIP(host) && !isPublicAddress(host)) throw new TypeError("fetch failed", { cause: privateAddress() });
    return (await undiciFetch(input as Parameters<typeof undiciFetch>[0], { ...(init as Parameters<typeof undiciFetch>[1]), dispatcher })) as unknown as Response;
  };
}
