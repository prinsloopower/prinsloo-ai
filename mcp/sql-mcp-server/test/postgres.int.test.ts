import { describe, expect, it } from "vitest";
import { pingPostgres } from "../src/engine/postgres.js";

// Started by `npm run db:up` (test/docker-compose.yml, ADR-010).
const url = process.env.TEST_POSTGRES_URL ?? "postgres://postgres:postgres@localhost:55432/sqlmcp";

describe("postgres engine", () => {
  it("answers the health-check Server statement", async () => {
    await expect(pingPostgres(url)).resolves.toBeUndefined();
  });

  it("rejects when the Database cannot be reached", async () => {
    await expect(pingPostgres("postgres://postgres:postgres@localhost:1/none")).rejects.toThrow();
  });
});
