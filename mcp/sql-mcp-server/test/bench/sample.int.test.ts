import { readFileSync } from "node:fs";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { judge } from "../../bench/src/judge.js";
import { type Question, answerText, tieHolds } from "../../bench/src/reference.js";
import { sampleSql, seedOf } from "../../bench/src/sample.js";
import { ADMIN, admin, ask } from "../query/pg-fixture.js";

const SQL = readFileSync("bench/sample-db.sql", "utf8");
const QUESTIONS = JSON.parse(readFileSync("bench/questions.json", "utf8")) as Question[];
const TABLES = ["regions", "customers", "products", "orders", "order_lines", "targets", "staff"];
const byId = (id: string) => QUESTIONS.find((q) => q.id === id)!;

/** Rows as arrays, as postgres, so a reference query's columns are read by position. */
async function rows(sql: string): Promise<unknown[][]> {
  const client = new pg.Client({ connectionString: ADMIN });
  await client.connect();
  try {
    return (await client.query({ text: sql, rowMode: "array" })).rows as unknown[][];
  } finally {
    await client.end();
  }
}

/** Every table's contents as text, in a fixed order. */
async function contents() {
  const out: string[] = [];
  for (const t of TABLES) {
    const [r] = await admin<{ c: string }>(`SELECT string_agg(t::text, E'\\n' ORDER BY t::text) AS c FROM sqlmcp_test.${t} t`);
    out.push(`${t}\n${r!.c}`);
  }
  return out.join("\n\n");
}

const scalar = async (sql: string) => Number((await rows(sql))[0]![0]);

beforeAll(async () => {
  // In a Deployment the reader already exists; the sample only grants to it (T-009).
  await admin(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sqlmcp_reader') THEN
    CREATE ROLE sqlmcp_reader LOGIN PASSWORD 'sqlmcp_reader_pw'; END IF; END $$;`);
  await admin(SQL);
});

describe("S-004 the sample Database", () => {
  it("benchmark_seed_is_deterministic", async () => {
    expect(sampleSql(seedOf(SQL))).toBe(SQL);
    const first = await contents();
    await admin(SQL);
    expect(await contents()).toBe(first);
  });

  it("benchmark_seed_follows_its_rules", async () => {
    const counts = Object.fromEntries(
      await Promise.all(TABLES.map(async (t) => [t, await scalar(`SELECT count(*) FROM sqlmcp_test.${t}`)] as const)),
    );
    expect(counts).toMatchObject({ regions: 4, customers: 60, products: 25, targets: 20, staff: 5 });
    expect(counts.orders).toBeGreaterThanOrEqual(1100);
    expect(counts.orders).toBeLessThanOrEqual(1300);
    expect(counts.order_lines).toBeGreaterThanOrEqual(2700);
    expect(counts.order_lines).toBeLessThanOrEqual(3300);

    expect(await scalar(`SELECT count(*) FROM sqlmcp_test.orders
      WHERE (placed_at AT TIME ZONE 'UTC')::time <> '12:00'::time AND placed_at <> '2026-02-28 22:30:00+00'`)).toBe(0);
    expect(await scalar(`SELECT count(*) FROM sqlmcp_test.orders WHERE placed_at = '2026-02-28 22:30:00+00' AND status <> 'cancelled'`)).toBe(0);
    expect(await scalar(`SELECT count(*) FROM sqlmcp_test.orders WHERE placed_at = '2026-02-28 22:30:00+00'`)).toBeGreaterThan(0);
    expect(await scalar(`SELECT count(*) FROM sqlmcp_test.orders
      WHERE placed_at < '2025-01-01 00:00:00+00' OR placed_at >= '2026-04-01 00:00:00+00'`)).toBe(0);
    expect(await scalar(`SELECT count(*) FROM sqlmcp_test.order_lines WHERE discount_rate < 0 OR discount_rate > 0.30`)).toBe(0);
    for (const t of ["regions", "customers", "products", "staff"]) {
      expect(await scalar(`SELECT count(*) FROM sqlmcp_test.${t} WHERE name ~ '[,=]'`)).toBe(0);
    }
    expect(await scalar(`SELECT min(id) FROM sqlmcp_test.orders`)).toBeGreaterThanOrEqual(10001);
    expect(await scalar(`SELECT count(*) FROM sqlmcp_test.order_lines ol JOIN sqlmcp_test.products p ON p.id = ol.product_id
      WHERE ol.unit_price <> p.unit_price`)).toBe(0);
    // A customer's first order is at 12:00 UTC on or after the day they joined; the B-25 batch never is a first order.
    expect(await scalar(`SELECT count(*) FROM sqlmcp_test.customers c
      JOIN LATERAL (SELECT placed_at FROM sqlmcp_test.orders o WHERE o.customer_id = c.id ORDER BY placed_at LIMIT 1) f ON true
      WHERE f.placed_at < (c.joined_on + time '12:00') AT TIME ZONE 'UTC' OR f.placed_at = '2026-02-28 22:30:00+00'`)).toBe(0);
    expect(await scalar(`SELECT count(*) - count(DISTINCT name) FROM sqlmcp_test.customers`)).toBe(0);
    expect(await scalar(`SELECT count(*) - count(DISTINCT name) FROM sqlmcp_test.products`)).toBe(0);
    expect((await scalar(`SELECT count(*) FROM sqlmcp_test.orders WHERE status = 'shipped'
      AND placed_at >= '2025-01-01 00:00:00+00' AND placed_at < '2026-01-01 00:00:00+00'`)) % 2).toBe(1);

    expect(await scalar(`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'sqlmcp_test' AND pg_get_userbyid(c.relowner) <> 'postgres'`)).toBe(0);
    expect(await scalar(`SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'sqlmcp_test' AND pg_get_userbyid(t.typowner) <> 'postgres'`)).toBe(0);
    expect(await scalar(`SELECT count(*) FROM pg_namespace WHERE nspname = 'sqlmcp_test' AND pg_get_userbyid(nspowner) = 'postgres'`)).toBe(1);
    expect(await scalar(`SELECT has_schema_privilege('sqlmcp_reader', 'sqlmcp_test', 'USAGE')::int`)).toBe(1);
    const tableGrants = await rows(`SELECT table_name, privilege_type FROM information_schema.table_privileges
      WHERE grantee = 'sqlmcp_reader' AND table_schema = 'sqlmcp_test' ORDER BY 1, 2`);
    expect(tableGrants).toEqual(["order_lines", "orders", "products", "regions", "targets"].map((t) => [t, "SELECT"]));
    const columnGrants = await rows(`SELECT column_name, privilege_type FROM information_schema.column_privileges
      WHERE grantee = 'sqlmcp_reader' AND table_schema = 'sqlmcp_test' AND table_name IN ('customers', 'staff') ORDER BY 1`);
    expect(columnGrants).toEqual(["id", "joined_on", "name", "region_id", "segment"].map((c) => [c, "SELECT"]));
  });
});

describe("S-004 the expected answers", () => {
  it("reference_sql_yields_expected_answers", async () => {
    for (const q of QUESTIONS) {
      const r = await rows(q.sql);
      if (q.type === "unavailable") {
        expect(r.length, q.id).toBeGreaterThan(0);
        continue;
      }
      expect(judge(`ANSWER: ${answerText(q.type, r)}`, q.expected), q.id).toMatchObject({ correct: true });
    }
  });

  it("expected_answers_have_no_ties", async () => {
    for (const q of QUESTIONS.filter((q) => q.tie)) {
      const r = await rows(q.tie!.sql);
      expect(r.length, q.id).toBeGreaterThan(0);
      for (const [lead, next] of r) expect(tieHolds(Number(lead), Number(next), q.tie!.counts), `${q.id}: ${lead} vs ${next}`).toBe(true);
    }
  });

  it("expected_answers_are_consistent", async () => {
    const total = (id: string) => {
      const e = byId(id).expected;
      if (e.type !== "map") throw new Error(`${id} is not a map`);
      return Object.values(e.value).reduce((a, b) => a + b, 0);
    };
    const keys = (id: string) => {
      const e = byId(id).expected;
      return e.type === "map" ? Object.keys(e.value).sort() : [];
    };
    const value = (id: string) => {
      const e = byId(id).expected;
      if (e.type !== "integer" && e.type !== "number") throw new Error(`${id} is not a number`);
      return e.value;
    };
    for (const id of ["B-10", "B-17", "B-28"]) expect(Math.abs(total(id) - value("B-05")), id).toBeLessThan(0.01);
    const orders = await scalar(`SELECT count(*) FROM sqlmcp_test.orders`);
    expect(total("B-21")).toBe(orders);
    const in2026 = await scalar(`SELECT count(*) FROM sqlmcp_test.orders WHERE placed_at >= '2026-01-01 00:00:00+00'`);
    expect(value("B-03") + in2026).toBe(orders);

    expect(keys("B-10")).toEqual(["East", "North", "South", "West"]);
    expect(keys("B-17")).toEqual((await rows(`SELECT DISTINCT category FROM sqlmcp_test.products ORDER BY 1`)).map((r) => r[0]));
    expect(keys("B-21")).toEqual(["cancelled", "pending", "returned", "shipped"]);
    expect(keys("B-28")).toEqual(["retail", "wholesale"]);
    for (const q of QUESTIONS.filter((q) => q.expected.type === "list")) {
      expect((q.expected as { value: string[] }).value.length, q.id).toBeGreaterThan(0);
    }
  });

  it("unavailable_questions_are_refused_as_the_reader", async () => {
    const unavailable = QUESTIONS.filter((q) => q.type === "unavailable");
    expect(unavailable.map((q) => q.id)).toEqual(["B-39", "B-40"]);
    for (const q of unavailable) {
      const answer = await ask("sqlmcp_reader", q.sql);
      expect(answer.result.isError, q.id).toBe(true);
      // Refused because the data is withheld, not for how the query is written.
      expect(answer.result.content[0]!.text, q.id).toMatch(/^The query was not accepted: it reads a table or column that is not available to you\./);
    }
  });
});
