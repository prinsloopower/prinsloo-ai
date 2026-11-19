import { describe, expect, it } from "vitest";
import { PostgresDatabase } from "../../src/engine/postgres.js";

// MS SQL Server's closed list has no PostgreSQL counterpart, so the flag stays false there, even for
// a superuser, whose own flag still refuses it.
const ADMIN = process.env.TEST_POSTGRES_URL ?? "postgres://postgres:postgres@localhost:55432/sqlmcp";

describe("PostgreSQL's account flags", () => {
  it("postgres_unlisted_flag_always_false", async () => {
    const database = new PostgresDatabase(ADMIN);
    const flags = await database.accountFlags();
    expect(flags.superuser).toBe(true);
    expect(flags.unlisted).toBe(false);
    expect((await database.catalog()).flags.unlisted).toBe(false);
  });
});
