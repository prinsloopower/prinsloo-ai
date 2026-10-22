import { describe, expect, it } from "vitest";
import { visibleTables } from "../../src/visibility.js";
import { FakeDatabase } from "./fake-database.js";

// Added after the S-002 re-review: the order must be the Server's code-point order, which a
// locale-aware comparison (or the Database's collation) would get wrong for this pair.

describe("S-002 re-review fix", () => {
  it("sort_is_code_point_not_collation", () => {
    const db = new FakeDatabase()
      .table("alpha", "b", [["id", "integer"]])
      .table("Zeta", "a", [["id", "integer"]])
      .table("alpha", "B", [["id", "integer"]]);
    const names = visibleTables({ flags: db.flags, rows: db.rows }).map((t) => `${t.schema}.${t.table}`);
    expect(names).toEqual(["Zeta.a", "alpha.B", "alpha.b"]);
  });
});
