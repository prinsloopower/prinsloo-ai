import type { QueryEngine } from "./database.js";
import type { PgParser } from "./pg-parser.js";
import { redactSql } from "./postgres-redact.js";
import { checkStructure } from "./postgres-structure.js";

/** PostgreSQL's half of the Query check and of Redaction, over one loaded parser. */
export function postgresQueries(parser: PgParser): QueryEngine {
  return {
    name: "PostgreSQL",
    checkStructure: (sql, visible) => checkStructure(sql, parser, visible),
    redact: (sql, on) => redactSql(sql, parser, on),
  };
}
