import { describe, expect, it } from "vitest";
import { check, verdict } from "./catalog.js";

describe("S-003 Query check: types and operators", () => {
  it("casts_to_user_defined_types_refused", async () => {
    for (const sql of [
      "SELECT 'shipped'::sales.kind_t",
      "SELECT k.id FROM sales.kinds k WHERE k.kind = 'shipped'::sales.kind_t",
      "SELECT CAST(k.id AS sales.kind_t) FROM sales.kinds k",
      "SELECT 'x'::kind_t",
    ]) {
      expect(await verdict(sql), sql).toBe("unsupported");
    }
    expect(await verdict("SELECT k.kind FROM sales.kinds k WHERE k.kind = 'shipped' GROUP BY k.kind")).toBe("ok");
  });

  it("reg_type_columns_and_domains_refused", async () => {
    const probes = (literal: string) => [
      "SELECT i.r FROM sales.items i",
      "SELECT i.r::text FROM sales.items i",
      `SELECT i.id FROM sales.items i WHERE coalesce(i.r, '${literal}') = i.r`,
      `SELECT i.r FROM sales.items i UNION SELECT '${literal}'`,
      `SELECT ARRAY[i.r, '${literal}'] FROM sales.items i`,
      "SELECT s.c FROM sales.shapes s",
      `SELECT ARRAY[s.c, '(${literal})'] FROM sales.shapes s`,
    ];
    const hidden = probes("hr.payroll");
    const missing = probes("hr.nosuch");
    for (let i = 0; i < hidden.length; i++) {
      expect(await verdict(hidden[i]!), hidden[i]).toBe("unreadable_type");
      expect(await check(hidden[i]!)).toEqual(await check(missing[i]!));
    }
    expect(await verdict("SELECT i.* FROM sales.items i")).toBe("star");
    expect(await verdict("SELECT i.id FROM sales.items i")).toBe("ok");
  });

  it("operators_checked_in_sublinks_and_order_using_refused", async () => {
    for (const sql of [
      "SELECT 1 OPERATOR(public.===) ANY (SELECT 1)",
      "SELECT o.id FROM sales.orders o WHERE o.id OPERATOR(sales.===) ALL (SELECT c.id FROM sales.customers c)",
      "SELECT o.id FROM sales.orders o ORDER BY o.id USING >",
      "SELECT o.id FROM sales.orders o ORDER BY o.id USING OPERATOR(public.<)",
      "SELECT o.id FROM sales.orders o WHERE o.id OPERATOR(public.===) 1",
    ]) {
      expect(await verdict(sql), sql).toBe("unsupported");
    }
    expect(await verdict("SELECT 1 OPERATOR(pg_catalog.=) ANY (SELECT o.id FROM sales.orders o)")).toBe("ok");
  });
});
