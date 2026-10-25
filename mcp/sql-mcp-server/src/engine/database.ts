/**
 * Whether the Database account can reach every table at once (D-077, D-081): itself, through any
 * role it is a member of (with or without inherited rights), or through the session it connected as.
 */
export interface AccountFlags {
  superuser: boolean;
  bypassRls: boolean;
  readAllData: boolean;
  writeAllData: boolean;
  createRole: boolean;
}

/** One column of a user table the account can reach, and whether SELECT on it is granted. */
export interface CatalogRow {
  schema: string;
  table: string;
  column: string;
  type: string;
  granted: boolean;
  /** False when the type reaches a `reg*` type or a composite at any depth (D-082, D-085). */
  readable: boolean;
}

export interface Catalog {
  flags: AccountFlags;
  rows: CatalogRow[];
}

/** A table an Agent-written query names, as the Query check found it. */
export interface NamedTable {
  schema: string;
  table: string;
}

/** An Agent-written query that ran (S-003): at most the Row limit of rows, and whether more matched. */
export interface QueryRun {
  columns: { name: string; type: string }[];
  rows: unknown[][];
  cutShort: boolean;
  /** From the cursor's declaration to its last fetch. */
  ms: number;
}

/**
 * How an Agent-written query ended in the Engine adapter:
 * - `ok`: it ran;
 * - `plan_refused`: the plan layer refused it, so it was never sent. `unaccounted` marks a
 *   relation the plan reads that no named table accounts for;
 * - `error`: the Database failed it. `sent` says whether the query itself had been sent.
 */
export type QueryOutcome =
  | { kind: "ok"; run: QueryRun }
  | { kind: "plan_refused"; unaccounted: boolean; code?: string }
  | { kind: "error"; error: unknown; sent: boolean; ms: number };

/** What the Server asks of a Database: one interface per Engine (components.md, Engine adapter). */
export interface Database {
  ping(): Promise<void>;
  accountFlags(): Promise<AccountFlags>;
  catalog(): Promise<Catalog>;
  /** Plans, then runs, an Agent-written query that has passed the structural layer (ADR-005). */
  query(sql: string, named: NamedTable[], rowLimit: number): Promise<QueryOutcome>;
}

/** Database error classes (D-080). */
export type ReasonClass = "connection" | "timeout" | "permission" | "constraint" | "other";
