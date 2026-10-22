/** Whether the Database account holds a grant that reaches every table at once (D-077). */
export interface AccountFlags {
  superuser: boolean;
  bypassRls: boolean;
  readAllData: boolean;
  writeAllData: boolean;
}

/** One column of a user table the account can reach, and whether SELECT on it is granted. */
export interface CatalogRow {
  schema: string;
  table: string;
  column: string;
  type: string;
  granted: boolean;
}

export interface Catalog {
  flags: AccountFlags;
  rows: CatalogRow[];
}

/** What the Server asks of a Database: one interface per Engine (components.md, Engine adapter). */
export interface Database {
  ping(): Promise<void>;
  accountFlags(): Promise<AccountFlags>;
  catalog(): Promise<Catalog>;
}

/** Database error classes (D-080). */
export type ReasonClass = "connection" | "timeout" | "permission" | "constraint" | "other";
