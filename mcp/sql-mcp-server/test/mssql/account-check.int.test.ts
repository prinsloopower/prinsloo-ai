import mssql from "mssql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { accountCheckSql, classifyMssqlError, MssqlDatabase, OWNED_IN_DATABASE, OWNED_ON_SERVER } from "../../src/engine/mssql.js";
import { nodeDeps } from "../../src/node-deps.js";
import { baseEnv, callMcp, captureConsole, Clock, FakeIdentityProvider, opLines, ORIGIN, signIn, type Harness } from "../signin/helpers.js";
import { adminPool, DATABASE, databaseUrl, HOST, PORT, READER, READER_PASSWORD } from "./connection.js";
import { asAdmin, databaseAs, dropUser, FIXTURE_PASSWORD, freshUser, inMaster } from "./fixtures.js";
import { OWNERSHIP_CATALOGS } from "./read-only-list.js";

// SQL Server 2022 from `npm run db:mssql:seed`. Each case makes the login it_checked afresh, gives it one
// thing, runs the account check as it, and takes the thing back. Fixtures live in the schema it_chk.
const CHECKED = "it_checked";
const CONTAINED = "it_contained";
const UNSAFE_ACCOUNT = "Deployment misconfigured: Database account bypasses grants";

/** One thing an account can hold, given to `u`: the login's user, or a role it reaches. */
interface Holding {
  name: string;
  give: (u: string) => Promise<void>;
  takeBack?: () => Promise<void>;
}

const inDb = (name: string, sql: (u: string) => string, takeBack?: string): Holding => ({
  name,
  give: (u) => asAdmin(sql(u)),
  ...(takeBack ? { takeBack: () => asAdmin(takeBack) } : {}),
});

/** Every route by which an account could reach every table, or grant itself that, held in the database. */
const DATABASE_ROUTES: Holding[] = [
  inDb("db_owner", (u) => `ALTER ROLE db_owner ADD MEMBER [${u}];`),
  inDb("db_datareader", (u) => `ALTER ROLE db_datareader ADD MEMBER [${u}];`),
  inDb("db_securityadmin", (u) => `ALTER ROLE db_securityadmin ADD MEMBER [${u}];`),
  inDb("db_accessadmin", (u) => `ALTER ROLE db_accessadmin ADD MEMBER [${u}];`),
  inDb("db_ddladmin", (u) => `ALTER ROLE db_ddladmin ADD MEMBER [${u}];`),
  inDb("CONTROL on the database", (u) => `GRANT CONTROL TO [${u}];`),
  inDb("SELECT on the database", (u) => `GRANT SELECT TO [${u}];`),
  inDb("ALTER ANY ROLE", (u) => `GRANT ALTER ANY ROLE TO [${u}];`),
  inDb("ALTER ANY USER", (u) => `GRANT ALTER ANY USER TO [${u}];`),
  inDb("ALTER ANY APPLICATION ROLE", (u) => `GRANT ALTER ANY APPLICATION ROLE TO [${u}];`),
  inDb("ALTER ANY SCHEMA", (u) => `GRANT ALTER ANY SCHEMA TO [${u}];`),
  inDb("IMPERSONATE on a user", (u) => `GRANT IMPERSONATE ON USER::it_chk_other TO [${u}];`),
  inDb("ALTER on a schema", (u) => `GRANT ALTER ON SCHEMA::it_chk TO [${u}];`),
  inDb("CONTROL on a schema", (u) => `GRANT CONTROL ON SCHEMA::it_chk TO [${u}];`),
  inDb("ALTER on a bypassing role", (u) => `GRANT ALTER ON ROLE::it_chk_reader TO [${u}];`),
  inDb("CONTROL on a bypassing role", (u) => `GRANT CONTROL ON ROLE::it_chk_reader TO [${u}];`),
  inDb("TAKE OWNERSHIP on a bypassing role", (u) => `GRANT TAKE OWNERSHIP ON ROLE::it_chk_reader TO [${u}];`),
  inDb("ownership of a bypassing role", (u) => `ALTER AUTHORIZATION ON ROLE::it_chk_reader TO [${u}];`, "ALTER AUTHORIZATION ON ROLE::it_chk_reader TO dbo;"),
];

/** The same, held at server level; dropping the login takes each back. */
const SERVER_ROUTES: Holding[] = [
  inDb("sysadmin", (u) => `ALTER SERVER ROLE sysadmin ADD MEMBER [${u}];`),
  inDb("securityadmin", (u) => `ALTER SERVER ROLE securityadmin ADD MEMBER [${u}];`),
  { name: "CONTROL SERVER", give: (u) => inMaster(`GRANT CONTROL SERVER TO [${u}];`) },
  { name: "SELECT ALL USER SECURABLES", give: (u) => inMaster(`GRANT SELECT ALL USER SECURABLES TO [${u}];`) },
  { name: "ALTER ANY SERVER ROLE", give: (u) => inMaster(`GRANT ALTER ANY SERVER ROLE TO [${u}];`) },
  { name: "IMPERSONATE ANY LOGIN", give: (u) => inMaster(`GRANT IMPERSONATE ANY LOGIN TO [${u}];`) },
  { name: "IMPERSONATE on a login", give: (u) => inMaster(`GRANT IMPERSONATE ON LOGIN::sa TO [${u}];`) },
  { name: "CONTROL on a login", give: (u) => inMaster(`GRANT CONTROL ON LOGIN::sa TO [${u}];`) },
  { name: "ALTER on a bypassing server role", give: (u) => inMaster(`GRANT ALTER ON SERVER ROLE::it_chk_server_bypass TO [${u}];`) },
];

const DATABASE_FIXED_ROLES: Holding[] = ["db_denydatawriter", "db_datawriter", "db_denydatareader", "db_backupoperator"].map((r) =>
  inDb(r, (u) => `ALTER ROLE ${r} ADD MEMBER [${u}];`),
);

const SERVER_ROLES: Holding[] = [
  inDb("bulkadmin", (u) => `ALTER SERVER ROLE bulkadmin ADD MEMBER [${u}];`),
  inDb("a user-defined server role", (u) => `ALTER SERVER ROLE it_chk_server_plain ADD MEMBER [${u}];`),
];

const OWNED: Holding[] = [
  inDb("a table", (u) => `ALTER AUTHORIZATION ON OBJECT::it_chk.t TO [${u}];`, "ALTER AUTHORIZATION ON OBJECT::it_chk.t TO SCHEMA OWNER;"),
  inDb("a schema", (u) => `ALTER AUTHORIZATION ON SCHEMA::it_chk TO [${u}];`, "ALTER AUTHORIZATION ON SCHEMA::it_chk TO dbo;"),
  inDb("a database role", (u) => `ALTER AUTHORIZATION ON ROLE::it_chk_plain TO [${u}];`, "ALTER AUTHORIZATION ON ROLE::it_chk_plain TO dbo;"),
];

const SERVER_OWNED: Holding[] = [
  inDb("a user-defined server role", (u) => `CREATE SERVER ROLE it_chk_owned AUTHORIZATION [${u}];`, "IF EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'it_chk_owned') DROP SERVER ROLE it_chk_owned;"),
  {
    name: "a DATABASE_MIRRORING endpoint",
    give: (u) =>
      inMaster(`CREATE ENDPOINT it_chk_mirror AUTHORIZATION [${u}] STATE = STOPPED AS TCP (LISTENER_PORT = 5022) FOR DATABASE_MIRRORING (AUTHENTICATION = CERTIFICATE it_chk_cert, ROLE = ALL);`),
    takeBack: () => inMaster(`IF EXISTS (SELECT 1 FROM sys.endpoints WHERE name = 'it_chk_mirror') DROP ENDPOINT it_chk_mirror;`),
  },
];

const UNLISTED_GRANTS: Holding[] = [
  inDb("VIEW DEFINITION", (u) => `GRANT VIEW DEFINITION TO [${u}];`),
  inDb("EXECUTE", (u) => `GRANT EXECUTE TO [${u}];`),
  inDb("INSERT on a table", (u) => `GRANT INSERT ON it_chk.t TO [${u}];`),
];

const SERVER_UNLISTED_GRANTS: Holding[] = [{ name: "VIEW SERVER STATE", give: (u) => inMaster(`GRANT VIEW SERVER STATE TO [${u}];`) }];

/** The account check's verdict for a fresh login holding `holding`, given directly or through a role two deep. */
async function unlisted(holding: Holding | undefined, through: "user" | "nested role" = "user"): Promise<boolean> {
  await freshUser(CHECKED);
  let grantee = CHECKED;
  if (through === "nested role") {
    // The user is a member of it_chk_outer, which is a member of it_chk_inner, which holds the thing.
    await asAdmin(`ALTER ROLE it_chk_outer ADD MEMBER [${CHECKED}];`);
    grantee = "it_chk_inner";
  }
  try {
    await holding?.give(grantee);
    const database = databaseAs(CHECKED);
    try {
      return (await database.accountFlags()).unlisted;
    } catch (e) {
      // Any error while the check runs refuses the account, so the check fails closed; db_denydatareader denies
      // even the catalog views. Only a permission error counts, so a broken statement still fails.
      if (classifyMssqlError(e) === "permission") return true;
      throw e;
    } finally {
      await database.close();
    }
  } finally {
    await holding?.takeBack?.();
    await dropUser(CHECKED);
    if (through === "nested role") await asAdmin(restoreInner);
  }
}

// The inner role's grants and memberships are taken back by remaking it.
const restoreInner = `
  DECLARE @s nvarchar(max) = N'';
  SELECT @s += N'ALTER ROLE ' + QUOTENAME(r.name) + N' DROP MEMBER it_chk_inner;'
  FROM sys.database_role_members m JOIN sys.database_principals r ON r.principal_id = m.role_principal_id
  WHERE m.member_principal_id = DATABASE_PRINCIPAL_ID('it_chk_inner');
  EXEC (@s);
  ALTER ROLE it_chk_inner DROP MEMBER it_chk_outer;
  DROP ROLE it_chk_inner;
  CREATE ROLE it_chk_inner;
  ALTER ROLE it_chk_inner ADD MEMBER it_chk_outer;`;

async function refusedEach(holdings: Holding[], through: "user" | "nested role" = "user") {
  const passed: string[] = [];
  for (const h of holdings) if (!(await unlisted(h, through))) passed.push(h.name);
  expect(passed, `passed the check, held through the ${through}`).toEqual([]);
}

/** Runs one statement as a login or contained user and returns its `unlisted` column. */
async function checkAs(user: string, password: string, sql: string): Promise<boolean> {
  const pool = await new mssql.ConnectionPool({
    server: HOST, port: PORT, database: DATABASE, user, password,
    options: { encrypt: true, trustServerCertificate: false },
  }).connect();
  try {
    const result = await pool.request().query<{ unlisted: boolean }>(sql);
    return result.recordset[0]!.unlisted;
  } finally {
    await pool.close();
  }
}

beforeAll(async () => {
  await dropUser(CHECKED);
  await asAdmin(`
    IF USER_ID('${CONTAINED}') IS NOT NULL DROP USER ${CONTAINED};
    IF OBJECT_ID('it_chk.t') IS NOT NULL ALTER AUTHORIZATION ON OBJECT::it_chk.t TO SCHEMA OWNER;
    IF SCHEMA_ID('it_chk') IS NOT NULL ALTER AUTHORIZATION ON SCHEMA::it_chk TO dbo;
    DROP TABLE IF EXISTS it_chk.t, it_chk.t2;
    DROP SCHEMA IF EXISTS it_chk;
    IF DATABASE_PRINCIPAL_ID('it_chk_inner') IS NOT NULL AND DATABASE_PRINCIPAL_ID('it_chk_outer') IS NOT NULL ALTER ROLE it_chk_inner DROP MEMBER it_chk_outer;
    DROP ROLE IF EXISTS it_chk_inner;
    DROP ROLE IF EXISTS it_chk_outer;
    IF DATABASE_PRINCIPAL_ID('it_chk_reader') IS NOT NULL ALTER AUTHORIZATION ON ROLE::it_chk_reader TO dbo;
    IF DATABASE_PRINCIPAL_ID('it_chk_plain') IS NOT NULL ALTER AUTHORIZATION ON ROLE::it_chk_plain TO dbo;
    DROP ROLE IF EXISTS it_chk_reader;
    DROP ROLE IF EXISTS it_chk_plain;
    DROP USER IF EXISTS it_chk_other;
    IF EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'it_chk_owned') DROP SERVER ROLE it_chk_owned;
    IF EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'it_chk_server_plain') DROP SERVER ROLE it_chk_server_plain;
    IF EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'it_chk_server_bypass') DROP SERVER ROLE it_chk_server_bypass;`);
  await asAdmin(`CREATE SCHEMA it_chk AUTHORIZATION dbo;`);
  await asAdmin(`
    CREATE TABLE it_chk.t (id int, label nvarchar(40));
    CREATE TABLE it_chk.t2 (id int, secret nvarchar(40));
    CREATE ROLE it_chk_inner;
    CREATE ROLE it_chk_outer;
    ALTER ROLE it_chk_inner ADD MEMBER it_chk_outer;
    CREATE ROLE it_chk_reader;
    ALTER ROLE db_datareader ADD MEMBER it_chk_reader;
    CREATE ROLE it_chk_plain;
    CREATE USER it_chk_other WITHOUT LOGIN;
    CREATE SERVER ROLE it_chk_server_plain;
    CREATE SERVER ROLE it_chk_server_bypass;
    CREATE USER ${CONTAINED} WITH PASSWORD = '${FIXTURE_PASSWORD}';
    GRANT SELECT ON it_chk.t TO ${CONTAINED};`);
  await inMaster(`GRANT CONTROL SERVER TO it_chk_server_bypass;`);
  // A mirroring endpoint authenticates with a certificate the master key protects.
  await inMaster(`IF NOT EXISTS (SELECT 1 FROM sys.symmetric_keys WHERE name = '##MS_DatabaseMasterKey##') CREATE MASTER KEY ENCRYPTION BY PASSWORD = '${FIXTURE_PASSWORD}';`);
  await inMaster(`IF EXISTS (SELECT 1 FROM sys.endpoints WHERE name = 'it_chk_mirror') DROP ENDPOINT it_chk_mirror;`);
  await inMaster(`IF CERT_ID('it_chk_cert') IS NOT NULL DROP CERTIFICATE it_chk_cert;`);
  await inMaster(`CREATE CERTIFICATE it_chk_cert WITH SUBJECT = 'it_chk mirroring', EXPIRY_DATE = '2099-01-01';`);
}, 120_000);

afterAll(async () => {
  await dropUser(CHECKED);
  await inMaster(`IF EXISTS (SELECT 1 FROM sys.endpoints WHERE name = 'it_chk_mirror') DROP ENDPOINT it_chk_mirror;`);
  await inMaster(`IF CERT_ID('it_chk_cert') IS NOT NULL DROP CERTIFICATE it_chk_cert;`);
}, 120_000);

describe("MS SQL Server's Database account check", () => {
  it("mssql_check_passes_listed_reader", async () => {
    const reader: Holding = inDb("everything the list allows", (u) => `
      GRANT SHOWPLAN TO [${u}];
      GRANT SELECT ON SCHEMA::it_chk TO [${u}];
      GRANT SELECT ON it_chk.t TO [${u}];
      GRANT SELECT (id) ON it_chk.t2 TO [${u}];`);
    expect(await unlisted(undefined)).toBe(false);
    expect(await unlisted(reader)).toBe(false);
    expect(await unlisted(reader, "nested role")).toBe(false);
    const seeded = databaseAs(READER, READER_PASSWORD);
    try {
      expect((await seeded.accountFlags()).unlisted).toBe(false);
      const catalog = await seeded.catalog();
      expect(catalog.flags.unlisted).toBe(false);
      expect(catalog.rows.length).toBeGreaterThan(0);
    } finally {
      await seeded.close();
    }
  }, 120_000);

  it("mssql_check_ignores_deny_rows", async () => {
    const denied = inDb("DENY rows", (u) => `
      GRANT SELECT ON it_chk.t TO [${u}];
      DENY SELECT ON it_chk.t2 TO [${u}];
      DENY VIEW DEFINITION TO [${u}];
      DENY CONTROL ON SCHEMA::it_chk TO [${u}];
      DENY SELECT (label) ON it_chk.t TO [${u}];`);
    expect(await unlisted(denied)).toBe(false);
    expect(await unlisted({ name: "a server DENY", give: (u) => inMaster(`DENY VIEW SERVER STATE TO [${u}];`) })).toBe(false);
  }, 120_000);

  it("mssql_check_refuses_each_named_route", async () => {
    await refusedEach([...DATABASE_ROUTES, ...SERVER_ROUTES]);
  }, 600_000);

  it("mssql_check_refuses_fixed_roles_but_public", async () => {
    await refusedEach([...DATABASE_FIXED_ROLES, ...SERVER_ROLES]);
  }, 300_000);

  it("mssql_check_refuses_owned_securables", async () => {
    await refusedEach(OWNED);
    // The statement reads every catalog security.md lists, and no other.
    expect([...OWNED_IN_DATABASE].sort()).toEqual([...OWNERSHIP_CATALOGS.database].sort());
    expect([...OWNED_ON_SERVER].sort()).toEqual([...OWNERSHIP_CATALOGS.server].sort());
  }, 300_000);

  it("mssql_check_refuses_server_level_ownership", async () => {
    await refusedEach(SERVER_OWNED);
  }, 300_000);

  it("mssql_check_refuses_unlisted_grant", async () => {
    await refusedEach([...UNLISTED_GRANTS, ...SERVER_UNLISTED_GRANTS]);
  }, 300_000);

  it("mssql_check_reads_nested_roles_from_token", async () => {
    await refusedEach([...DATABASE_ROUTES, ...DATABASE_FIXED_ROLES, ...OWNED, ...UNLISTED_GRANTS], "nested role");
  }, 600_000);

  it("mssql_check_statement_on_azure_sql_reads_no_server_level", () => {
    const azure = accountCheckSql(true);
    const server = accountCheckSql(false);
    for (const view of ["login_token", "server_principals", "endpoints", "server_permissions", "server_audits", "server_event_notifications", "databases"]) {
      expect(azure, view).not.toMatch(new RegExp(`\\bsys\\.${view}\\b`));
    }
    for (const view of ["login_token", "server_principals", "endpoints", "server_permissions"]) {
      expect(server, view).toMatch(new RegExp(`\\bsys\\.${view}\\b`));
    }
    expect(azure).toMatch(/\bsys\.user_token\b/);
  });

  it("mssql_check_statement_on_azure_sql_requires_contained_user", async () => {
    const azure = accountCheckSql(true);
    expect(await checkAs(CONTAINED, FIXTURE_PASSWORD, azure)).toBe(false);
    // A user mapped to a login is refused there, even holding nothing outside the list.
    await freshUser(CHECKED);
    try {
      expect(await checkAs(CHECKED, FIXTURE_PASSWORD, azure)).toBe(true);
      expect(await checkAs(CHECKED, FIXTURE_PASSWORD, accountCheckSql(false))).toBe(false);
    } finally {
      await dropUser(CHECKED);
    }
    const admin = await adminPool();
    try {
      // sa is dbo here, and refused by the same statement.
      expect((await admin.request().query<{ unlisted: boolean }>(azure)).recordset[0]!.unlisted).toBe(true);
    } finally {
      await admin.close();
    }
  }, 120_000);
});

/** The shared app as the Node adapter builds it, over the Docker Database as a login. */
async function nodeHarness(user: string, password = FIXTURE_PASSWORD): Promise<{ h: Harness; database: MssqlDatabase }> {
  const clock = new Clock();
  const env = baseEnv({ ENGINE: "mssql", DATABASE_URL: databaseUrl(user, password), PUBLIC_URL: ORIGIN });
  const idp = await FakeIdentityProvider.create(clock, env.IDP_ISSUER);
  let database: MssqlDatabase | undefined;
  const hono = createApp({ ...nodeDeps(env, (connection) => (database = new MssqlDatabase(connection))), fetch: idp.fetch, now: clock.now });
  return { h: { app: { request: (input, init) => hono.request(input ?? "", init) }, idp, clock, staffSeen: [] }, database: database! };
}

describe("an account the check refuses, through the Node adapter", () => {
  it("mssql_unsafe_account_answers_503_naming_database_url", async () => {
    await freshUser(CHECKED);
    await asAdmin(`GRANT SELECT ON it_chk.t TO [${CHECKED}]; GRANT VIEW DEFINITION TO [${CHECKED}];`);
    const { h, database } = await nodeHarness(CHECKED);
    try {
      const s = await signIn(h);
      const lines = await captureConsole(async () => {
        for (const id of [1, 2]) {
          const res = await callMcp(h, s.access_token, "/mcp", { jsonrpc: "2.0", id, method: "tools/call", params: { name: "list_tables", arguments: { request_text: "Which tables?" } } });
          expect(res.status).toBe(503);
          expect(await res.text()).toMatch(new RegExp(`^${UNSAFE_ACCOUNT} \\(reference [0-9a-f-]{36}\\)$`));
        }
      });
      expect(lines.filter((l) => l.startsWith('{"type":"audit"'))).toHaveLength(2);
      const invalid = opLines(lines).filter((l) => l.event === "config_invalid");
      expect(invalid).toHaveLength(2);
      for (const l of invalid) expect(l.variable).toBe("DATABASE_URL");
      expect(lines.join("\n")).not.toContain(FIXTURE_PASSWORD);
      // Sign-in and metadata still answer.
      expect((await h.app.request(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`)).status).toBe(200);
      expect((await signIn(h)).access_token).toBeTruthy();
    } finally {
      await database.close();
      await dropUser(CHECKED);
    }
  }, 120_000);

  it("mssql_healthz_reports_unsafe_account", async () => {
    await freshUser(CHECKED);
    await asAdmin(`ALTER ROLE db_datareader ADD MEMBER [${CHECKED}];`);
    const unsafe = await nodeHarness(CHECKED);
    const safe = await nodeHarness(READER, READER_PASSWORD);
    try {
      const u = await unsafe.h.app.request(`${ORIGIN}/healthz`);
      expect(u.status).toBe(503);
      expect(await u.json()).toEqual({ status: "degraded", database: "unsafe" });
      const ok = await safe.h.app.request(`${ORIGIN}/healthz`);
      expect(await ok.json()).toEqual({ status: "ok", database: "ok" });
    } finally {
      await unsafe.database.close();
      await safe.database.close();
      await dropUser(CHECKED);
    }
  }, 120_000);
});
