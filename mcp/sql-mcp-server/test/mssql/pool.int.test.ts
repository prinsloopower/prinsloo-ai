import { spawnSync } from "node:child_process";
import { createServer, connect as tcpConnect, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { classifyMssqlError, MssqlDatabase } from "../../src/engine/mssql.js";
import { readNodeSettings } from "../../src/node-deps.js";
import { CA, databaseUrl, PORT, READER, READER_PASSWORD } from "./connection.js";

// SQL Server 2022 from `npm run db:mssql:seed`.

/** The pool the Node adapter makes from a DATABASE_URL. */
function databaseFor(url: string, makePool?: ConstructorParameters<typeof MssqlDatabase>[1]) {
  const settings = readNodeSettings({ ENGINE: "mssql", DATABASE_URL: url, PUBLIC_URL: "http://localhost" });
  if (!settings.ok) throw new Error(`settings: ${settings.variable}`);
  return new MssqlDatabase(settings.settings.connection, makePool);
}

const readerUrl = (port = PORT, extra = "") => databaseUrl(READER, READER_PASSWORD, extra).replace(`,${PORT};`, `,${port};`);

const servers: { server: Server; sockets: Socket[] }[] = [];
async function stop(entry: { server: Server; sockets: Socket[] }) {
  entry.sockets.forEach((s) => s.destroy());
  await new Promise((r) => entry.server.close(r));
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map(stop));
});

/** A TCP server on a free port; `forward` sends each connection on to SQL Server, otherwise it is held open and never answered. */
async function listen(forward: boolean, port = 0): Promise<number> {
  const sockets: Socket[] = [];
  const server = createServer((socket) => {
    sockets.push(socket);
    if (!forward) return;
    const upstream = tcpConnect(PORT, "localhost");
    sockets.push(upstream);
    socket.pipe(upstream).pipe(socket);
    socket.on("error", () => upstream.destroy());
    upstream.on("error", () => socket.destroy());
  });
  servers.push({ server, sockets });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  return (server.address() as { port: number }).port;
}

async function timed(work: Promise<unknown>): Promise<{ ms: number; error: unknown }> {
  const started = Date.now();
  try {
    await work;
    return { ms: Date.now() - started, error: undefined };
  } catch (error) {
    return { ms: Date.now() - started, error };
  }
}

/** Pings from a fresh process, which trusts the test CA only when `trustCa` is set. */
function pingInChild(url: string, trustCa: boolean) {
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: url };
  delete env.NODE_EXTRA_CA_CERTS;
  if (trustCa) env.NODE_EXTRA_CA_CERTS = CA;
  const r = spawnSync(process.execPath, ["--import", "tsx", "test/mssql/ping-child.ts"], { env, encoding: "utf8", timeout: 60_000 });
  const line = r.stdout.trim().split("\n").at(-1) ?? "";
  return { ...(JSON.parse(line) as { ok: boolean; class?: string }), output: r.stdout + r.stderr };
}

describe("the MS SQL Server pool", () => {
  it("mssql_unreachable_database_is_connection_within_connect_limit", async () => {
    const port = await listen(false);
    const database = databaseFor(readerUrl(port));
    const r = await timed(database.catalog());
    expect(classifyMssqlError(r.error)).toBe("connection");
    expect(r.ms).toBeGreaterThanOrEqual(4_500);
    expect(r.ms).toBeLessThan(6_000);
    await database.close();
  }, 30_000);

  it("mssql_connect_limit_overrides_connection_string", async () => {
    const port = await listen(false);
    const configs: unknown[] = [];
    const database = databaseFor(readerUrl(port, ";Connect Timeout=60"), (config) => {
      configs.push(config);
      return MssqlDatabase.defaultPool(config);
    });
    const r = await timed(database.ping());
    expect(classifyMssqlError(r.error)).toBe("connection");
    expect(r.ms).toBeLessThan(6_000);
    expect(configs).toEqual([expect.objectContaining({ connectionTimeout: 5_000 })]);
    await database.close();
  }, 30_000);

  it("mssql_pool_retries_after_failed_first_connect", async () => {
    // A port nothing listens on yet: the first call fails, and SQL Server "starts" there afterwards.
    const port = await listen(false);
    await stop(servers.pop()!);
    const database = databaseFor(readerUrl(port));
    expect(classifyMssqlError((await timed(database.ping())).error)).toBe("connection");
    await listen(true, port);
    await expect(database.ping()).resolves.toBeUndefined();
    await database.close();
  }, 30_000);

  it("mssql_pool_sets_no_request_timeout", async () => {
    const configs: { requestTimeout?: number }[] = [];
    const database = databaseFor(readerUrl(), (config) => {
      configs.push(config);
      return MssqlDatabase.defaultPool(config);
    });
    await database.ping();
    expect(configs).toHaveLength(1);
    expect(configs[0]!.requestTimeout).toBe(0);
    await database.close();
  }, 30_000);

  it("mssql_untrusted_certificate_is_connection", () => {
    const r = pingInChild(readerUrl(), false);
    expect(r, r.output).toMatchObject({ ok: false, class: "connection" });
    // Even TrustServerCertificate=false spelled out, or Encrypt=strict, never relaxes the check.
    expect(pingInChild(readerUrl(PORT, ";TrustServerCertificate=False"), false)).toMatchObject({ ok: false, class: "connection" });
  }, 60_000);

  it("mssql_connects_with_test_ca", () => {
    for (const extra of ["", ";Encrypt=True;TrustServerCertificate=False"]) {
      const r = pingInChild(readerUrl(PORT, extra).replace(";Encrypt=true", ""), true);
      expect(r, r.output).toMatchObject({ ok: true });
    }
    // A DATABASE_URL ending in a newline connects.
    const r = pingInChild(`${readerUrl()}\n`, true);
    expect(r, r.output).toMatchObject({ ok: true });
  }, 60_000);
});
