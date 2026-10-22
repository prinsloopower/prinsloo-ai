import type { AccountFlags, Catalog, CatalogRow, Database } from "../../src/engine/database.js";

/** A Database whose catalog the test writes by hand; counts how often it is read. */
export class FakeDatabase implements Database {
  rows: CatalogRow[] = [];
  flags: AccountFlags = { superuser: false, bypassRls: false, readAllData: false, writeAllData: false };
  failure: unknown;
  catalogReads = 0;

  /** Adds a table; each column is [name, type] (granted) or [name, type, false]. */
  table(schema: string, table: string, columns: [string, string, boolean?][]): this {
    for (const [column, type, granted] of columns) this.rows.push({ schema, table, column, type, granted: granted ?? true });
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
    if (this.failure) throw this.failure;
    return { flags: { ...this.flags }, rows: this.rows.map((r) => ({ ...r })) };
  }
}

export function salesDatabase(): FakeDatabase {
  return new FakeDatabase()
    .table("sales", "orders", [["id", "integer"], ["total", "numeric"]])
    .table("sales", "customers", [["id", "integer"], ["name", "text"], ["region", "text"], ["email", "text", false]])
    .table("hr", "payroll", [["id", "integer", false], ["salary", "numeric", false]]);
}
