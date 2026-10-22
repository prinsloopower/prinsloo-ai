import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../../src/engine/postgres.js";
import { bypassesGrants } from "../../src/visibility.js";

// Added after the S-002 re-review (docs/slices/S-002/review.md, D-081): a login role that can reach
// every table but lands on a clean role, by default setting or connection option, must be refused,
// because SET ROLE NONE takes it back. Uses its own rz_* roles.
const ADMIN = process.env.TEST_POSTGRES_URL ?? "postgres://postgres:postgres@localhost:55432/sqlmcp";
const as = (role: string, options?: string) => {
  const u = new URL(ADMIN);
  u.username = role;
  u.password = `${role}_pw`;
  if (options) u.searchParams.set("options", options);
  return u.toString();
};

const ROLES = ["rz_clean", "rz_lead_default", "rz_lead_option", "rz_bypassnl", "rz_bypass_lead", "rz_creatornl", "rz_creator_lead"];

async function admin(sql: string) {
  const client = new pg.Client({ connectionString: ADMIN });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

beforeAll(async () => {
  const drops = ROLES.map(
    (r) => `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${r}') THEN EXECUTE 'DROP OWNED BY ${r} CASCADE'; EXECUTE 'DROP ROLE ${r}'; END IF; END $$;`,
  ).join("\n");
  const login = (r: string) => `CREATE ROLE ${r} LOGIN PASSWORD '${r}_pw';`;
  await admin(`
    ${drops}
    CREATE ROLE rz_clean NOLOGIN;
    ${login("rz_lead_default")} GRANT pg_read_all_data TO rz_lead_default; GRANT rz_clean TO rz_lead_default;
    ALTER ROLE rz_lead_default SET role = 'rz_clean';
    ${login("rz_lead_option")} GRANT pg_read_all_data TO rz_lead_option; GRANT rz_clean TO rz_lead_option;
    CREATE ROLE rz_bypassnl NOLOGIN BYPASSRLS;
    ${login("rz_bypass_lead")} GRANT rz_bypassnl TO rz_bypass_lead; GRANT rz_clean TO rz_bypass_lead;
    CREATE ROLE rz_creatornl NOLOGIN CREATEROLE;
    ${login("rz_creator_lead")} GRANT rz_creatornl TO rz_creator_lead WITH INHERIT FALSE; GRANT rz_clean TO rz_creator_lead;
  `);
}, 30_000);

describe("S-002 re-review fix against PostgreSQL", () => {
  it("bypass_check_judges_the_login_role", async () => {
    const landed = [
      new PostgresDatabase(as("rz_lead_default")),
      new PostgresDatabase(as("rz_lead_option", "-c role=rz_clean")),
      new PostgresDatabase(as("rz_bypass_lead", "-c role=rz_clean")),
      new PostgresDatabase(as("rz_creator_lead", "-c role=rz_clean")),
    ];
    for (const db of landed) {
      expect(bypassesGrants(await db.accountFlags())).toBe(true);
      expect(bypassesGrants((await db.catalog()).flags)).toBe(true);
    }
  });
});
