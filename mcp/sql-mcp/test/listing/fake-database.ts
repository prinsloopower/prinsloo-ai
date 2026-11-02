import type { AccountFlags, Catalog, CatalogRow, Database, NamedTable, QueryOutcome } from "../../src/engine/database.js";

/** A Database whose catalog the test writes by hand; counts how often it is read. */
export class FakeDatabase implements Database {
  rows: CatalogRow[] = [];
  flags: AccountFlags = { superuser: false, bypassRls: false, readAllData: false, writeAllData: false, createRole: false };
  failure: unknown;
  catalogReads = 0;
  /** Runs inside each catalog read, before it answers; lets a test move the clock. */
  onRead?: () => void;

  /** Adds a table; each column is [name, type] (granted), [name, type, false], or [name, type, granted, readable]. */
  table(schema: string, table: string, columns: [string, string, boolean?, boolean?][]): this {
    for (const [column, type, granted, readable] of columns) {
      this.rows.push({ schema, table, column, type, granted: granted ?? true, readable: readable ?? true });
    }
    return this;
  }

  async ping(): Promise<void> {
    if (this.failure) throw this.failure;
  }

  async accountFlags(): Promise<AccountFlags> {
    if (this.failure) throw this.failure;
    return { ...this.flags };
  }

  async catalog(): Promise<Catalog> {
    this.catalogReads++;
    this.onRead?.();
    if (this.failure) throw this.failure;
    return { flags: { ...this.flags }, rows: this.rows.map((r) => ({ ...r })) };
  }

  /** Every query sent to the Engine adapter, which a test answers with `queryOutcome`. */
  queries: { sql: string; named: NamedTable[]; rowLimit: number }[] = [];
  queryOutcome: QueryOutcome = { kind: "ok", run: { columns: [], rows: [], cutShort: false, ms: 0 } };

  async query(sql: string, named: NamedTable[], rowLimit: number): Promise<QueryOutcome> {
    this.queries.push({ sql, named, rowLimit });
    return this.queryOutcome;
  }
}

export function salesDatabase(): FakeDatabase {
  return new FakeDatabase()
    .table("sales", "orders", [["id", "integer"], ["total", "numeric"]])
    .table("sales", "customers", [["id", "integer"], ["name", "text"], ["region", "text"], ["email", "text", false]])
    .table("hr", "payroll", [["id", "integer", false], ["salary", "numeric", false]]);
}
