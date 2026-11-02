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

/** Schemas every account can read, which would list every Hidden object. The Query check refuses them too. */
export const SYSTEM_SCHEMA = /^(pg_catalog|information_schema|pg_toast.*|pg_temp.*|sys|INFORMATION_SCHEMA)$/;

/** One Visible table as the Query check sees it. */
export interface VisibleTableInfo {
  columns: Map<string, { readable: boolean }>;
  /** Every column Visible and readable, so `*` may expand over it (`all_columns`). */
  allReadable: boolean;
}

/** The Visible objects for one Tool call, keyed by `visibleKey`, with each column's readability. */
export interface VisibleObjects {
  tables: Map<string, VisibleTableInfo>;
}

export const visibleKey = (schema: string, table: string) => `${schema}\u0000${table}`;

/** The Visible objects the Allow-list and the Boundary give, with each column's readability. */
export function visibleObjects(catalog: Catalog, boundary?: Boundary): VisibleObjects {
  const readable = new Map<string, boolean>();
  const allReadable = new Map<string, boolean>();
  for (const row of catalog.rows) {
    const k = visibleKey(row.schema, row.table);
    if (row.granted) readable.set(`${k}\u0000${row.column}`, row.readable);
    allReadable.set(k, (allReadable.get(k) ?? true) && row.readable);
  }
  const tables = new Map<string, VisibleTableInfo>();
  for (const t of visibleTables(catalog, boundary)) {
    const k = visibleKey(t.schema, t.table);
    const columns = new Map(t.columns.map((c) => [c.name, { readable: readable.get(`${k}\u0000${c.name}`) === true }]));
    tables.set(k, { columns, allReadable: t.all_columns && allReadable.get(k) === true });
  }
  return { tables };
}

/** Whether the account holds a grant that reaches every table at once. */
export function bypassesGrants(flags: AccountFlags): boolean {
  return flags.superuser || flags.bypassRls || flags.readAllData || flags.writeAllData || flags.createRole;
}

/**
 * The Visible objects the catalog allows (Visibility resolver): tables with at least one
 * granted column, outside system schemas, narrowed by the Boundary, in code-point order of schema
 * then table so the order never depends on the Database's collation.
 */
export function visibleTables(catalog: Catalog, boundary?: Boundary): VisibleTable[] {
  const byTable = new Map<string, { schema: string; table: string; columns: { name: string; type: string }[]; total: number }>();
  for (const row of catalog.rows) {
    const key = visibleKey(row.schema, row.table);
    let entry = byTable.get(key);
    if (!entry) {
      entry = { schema: row.schema, table: row.table, columns: [], total: 0 };
      byTable.set(key, entry);
    }
    entry.total++;
    if (row.granted) entry.columns.push({ name: row.column, type: row.type });
  }
  // Exclusions ignore letter case and inclusions do not, so a slip always hides more, never less.
  const excluded = new Set((boundary?.exclude ?? []).map(([s, t]) => visibleKey(s, t).toLowerCase()));
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
