import type { Boundary } from "./config.js";
import type { AccountFlags, Catalog } from "./engine/database.js";

/** A table on the Allow-list, as the Agent may see it. */
export interface VisibleTable {
  schema: string;
  table: string;
  columns: { name: string; type: string }[];
  /** False when only some columns are granted: `SELECT *` would fail. */
  all_columns: boolean;
}

/** Schemas every account can read, which would list every Hidden object (D-077). */
const SYSTEM_SCHEMA = /^(pg_catalog|information_schema|pg_toast.*|pg_temp.*|sys|INFORMATION_SCHEMA)$/;

/** Whether the account holds a grant that reaches every table at once (D-077). */
export function bypassesGrants(flags: AccountFlags): boolean {
  return flags.superuser || flags.bypassRls || flags.readAllData || flags.writeAllData || flags.createRole;
}

/**
 * The Visible objects the catalog allows (Visibility resolver, ADR-006): tables with at least one
 * granted column, outside system schemas, narrowed by the Boundary, in code-point order of schema
 * then table so the order never depends on the Database's collation.
 */
export function visibleTables(catalog: Catalog, boundary?: Boundary): VisibleTable[] {
  const byTable = new Map<string, { schema: string; table: string; columns: { name: string; type: string }[]; total: number }>();
  for (const row of catalog.rows) {
    const key = `${row.schema}\u0000${row.table}`;
    let entry = byTable.get(key);
    if (!entry) {
      entry = { schema: row.schema, table: row.table, columns: [], total: 0 };
      byTable.set(key, entry);
    }
    entry.total++;
    if (row.granted) entry.columns.push({ name: row.column, type: row.type });
  }
  // Exclusions ignore letter case and inclusions do not, so a slip always hides more, never less (D-081).
  const excluded = new Set((boundary?.exclude ?? []).map(([s, t]) => `${s}\u0000${t}`.toLowerCase()));
  const tables: VisibleTable[] = [];
  for (const [key, e] of byTable) {
    if (e.columns.length === 0 || SYSTEM_SCHEMA.test(e.schema)) continue;
    if (boundary?.schemas && !boundary.schemas.includes(e.schema)) continue;
    if (excluded.has(key.toLowerCase())) continue;
    tables.push({ schema: e.schema, table: e.table, columns: e.columns, all_columns: e.columns.length === e.total });
  }
  const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return tables.sort((a, b) => order(a.schema, b.schema) || order(a.table, b.table));
}
