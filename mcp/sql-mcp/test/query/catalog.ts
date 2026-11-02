import type { Boundary } from "../../src/config.js";
import { visibleObjects } from "../../src/visibility.js";
import { FakeDatabase } from "../listing/fake-database.js";
import { nodeQueryEngine } from "./node-parser.js";

/**
 * The fake catalog the Query check's unit tests run over:
 * - `sales.orders (id, total)` and `sales.kinds (id, kind)` (an enum), fully granted;
 * - `sales.customers (id, name, region)`, with `email` not granted;
 * - `sales.items (id, r)`, where `r` is a `regclass`, and `sales.shapes (id, c)`, a composite;
 * - `hr.payroll`, granted nothing.
 */
export function queryDatabase(opts: { email?: boolean } = {}): FakeDatabase {
  const customers: [string, string, boolean?, boolean?][] = [["id", "integer"], ["name", "text"], ["region", "text"]];
  if (opts.email !== false) customers.push(["email", "text", false]);
  return new FakeDatabase()
    .table("sales", "orders", [["id", "integer"], ["total", "numeric"]])
    .table("sales", "customers", customers)
    .table("sales", "kinds", [["id", "integer"], ["kind", "user-defined"]])
    .table("sales", "items", [["id", "integer"], ["r", "regclass", true, false]])
    .table("sales", "shapes", [["id", "integer"], ["c", "user-defined", true, false]])
    .table("hr", "payroll", [["id", "integer", false], ["salary", "numeric", false]]);
}

/** Runs the structural layer over the fake catalog. */
export async function check(sql: string, opts: { boundary?: Boundary; email?: boolean } = {}) {
  const db = queryDatabase(opts);
  return (await nodeQueryEngine()).checkStructure(sql, visibleObjects(await db.catalog(), opts.boundary));
}

/** The reason a query was refused, or "ok". */
export async function verdict(sql: string, opts: { boundary?: Boundary; email?: boolean } = {}) {
  const r = await check(sql, opts);
  return r.ok ? "ok" : r.refusal;
}
