import { beforeAll, describe, expect, it } from "vitest";
import { PostgresDatabase } from "../../src/engine/postgres.js";
import { checkQuery, visibleObjects } from "../../src/query/check.js";
import { nodeParser } from "./node-parser.js";
import { admin, as, ask, resetSql, rowsOf } from "./pg-fixture.js";

const READER = "qy_reader";

beforeAll(async () => {
  await admin(`
    ${resetSql([READER], ["qy_types"])}
    CREATE ROLE ${READER} LOGIN PASSWORD '${READER}_pw';
    CREATE SCHEMA qy_types;
    GRANT USAGE ON SCHEMA qy_types TO ${READER};
    CREATE TABLE qy_types.secret (id integer, email text);
    CREATE DOMAIN qy_types.dreg AS regclass;
    CREATE TYPE qy_types.rrange AS RANGE (subtype = regclass);
    CREATE TYPE qy_types.comp_reg AS (r regclass);
    CREATE TYPE qy_types.comp_plain AS (a integer, b text);
    CREATE TYPE qy_types.kind_t AS ENUM ('pending', 'shipped');
    CREATE DOMAIN qy_types.dint AS integer CHECK (VALUE > 0);
    CREATE TYPE qy_types.kind_cast_t AS ENUM ('pending', 'shipped');
    CREATE FUNCTION qy_types.kind_text(k qy_types.kind_cast_t) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $f$ BEGIN RETURN 'cast:' || format('%s', k); END $f$;
    CREATE CAST (qy_types.kind_cast_t AS text) WITH FUNCTION qy_types.kind_text(qy_types.kind_cast_t) AS IMPLICIT;
    CREATE FUNCTION qy_types.not_boom(v text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $f$ BEGIN IF v = 'boom' THEN RAISE EXCEPTION 'boom'; END IF; RETURN true; END $f$;
    CREATE DOMAIN qy_types.dchk AS text CHECK (qy_types.not_boom(VALUE));
    CREATE TABLE qy_types.t (
      id integer, r regclass, ra regclass[], d qy_types.dreg, da qy_types.dreg[], rr qy_types.rrange,
      cr qy_types.comp_reg, cp qy_types.comp_plain, hidden_row qy_types.secret,
      kind qy_types.kind_t, kc qy_types.kind_cast_t, di qy_types.dint, ir int4range, ia integer[], dc qy_types.dchk
    );
    INSERT INTO qy_types.t (id, kind, kc, di, ir, ia, dc) VALUES (1, 'shipped', 'shipped', 5, '[1,3)', '{1,2}', 'fine'), (2, 'pending', 'pending', 6, '[2,4)', '{3}', 'also');
    GRANT SELECT ON qy_types.t TO ${READER};
  `);
}, 30_000);

const UNREADABLE = ["r", "ra", "d", "da", "rr", "cr", "cp", "hidden_row"];
const READABLE = ["id", "kind", "di", "ir", "ia", "dc"];

describe("S-003 Query check: user-defined and catalog types against PostgreSQL", () => {
  it("reg_and_composite_types_refused_at_any_depth", async () => {
    const catalog = await new PostgresDatabase(as(READER)).catalog();
    const flags = Object.fromEntries(catalog.rows.filter((r) => r.schema === "qy_types").map((r) => [r.column, r.readable]));
    for (const c of UNREADABLE) expect(flags[c], c).toBe(false);
    for (const c of READABLE) expect(flags[c], c).toBe(true);

    const parser = await nodeParser();
    const visible = visibleObjects(catalog);
    for (const c of UNREADABLE) {
      for (const literal of ["qy_types.secret", "qy_types.nosuch"]) {
        for (const sql of [
          `SELECT t.${c} FROM qy_types.t t`,
          `SELECT ARRAY[t.${c}, '(${literal})'] FROM qy_types.t t`,
          `SELECT coalesce(t.${c}, '${literal}') FROM qy_types.t t`,
          `SELECT t.${c} FROM qy_types.t t UNION SELECT '${literal}'`,
        ]) {
          expect(checkQuery(sql, parser, visible), sql).toEqual({ ok: false, reason: "unreadable_type" });
        }
      }
    }
  });

  it("user_defined_type_columns_readable", async () => {
    expect(rowsOf(await ask(READER, "SELECT t.kind FROM qy_types.t t ORDER BY t.id"))).toEqual([["shipped"], ["pending"]]);
    expect(rowsOf(await ask(READER, "SELECT t.id FROM qy_types.t t WHERE t.kind = 'shipped'"))).toEqual([[1]]);
    expect(rowsOf(await ask(READER, "SELECT t.kind, count(*) FROM qy_types.t t GROUP BY t.kind ORDER BY t.kind"))).toEqual([["pending", "1"], ["shipped", "1"]]);
    const answer = await ask(READER, "SELECT t.kind, t.di, t.ir, t.ia FROM qy_types.t t WHERE t.id = 1");
    const body = answer.result.structuredContent as { columns: { name: string; type: string }[]; rows: unknown[][] };
    // PostgreSQL describes a domain's values by its base type, so `di` reads as an integer (D-086).
    expect(body.columns).toEqual([
      { name: "kind", type: "user-defined" },
      { name: "di", type: "integer" },
      { name: "ir", type: "int4range" },
      { name: "ia", type: "integer[]" },
    ]);
    expect(body.rows).toEqual([["shipped", 5, "[1,3)", "{1,2}"]]);
  });

  it("user_defined_casts_run_as_written", async () => {
    // `kc`'s type has an implicit cast to text, written as a function that marks what it returns.
    expect(rowsOf(await ask(READER, "SELECT t.kc::text FROM qy_types.t t WHERE t.id = 1"))).toEqual([["cast:shipped"]]);
    expect(rowsOf(await ask(READER, "SELECT lower(t.kc) FROM qy_types.t t WHERE t.id = 1"))).toEqual([["cast:shipped"]]);
  });

  it("domain_constraints_run_as_written", async () => {
    // PostgreSQL resolves coalesce over a domain and a literal to the domain's base type, so the
    // domain's CHECK, which raises on 'boom', is not applied to the Agent's literal (D-086).
    expect(rowsOf(await ask(READER, "SELECT coalesce(t.dc, 'x') FROM qy_types.t t WHERE t.id = 1"))).toEqual([["fine"]]);
    expect(rowsOf(await ask(READER, "SELECT coalesce(t.dc, 'boom'), ARRAY[t.dc, 'boom'] FROM qy_types.t t WHERE t.id = 1"))).toEqual([["fine", "{fine,boom}"]]);
  });
});
