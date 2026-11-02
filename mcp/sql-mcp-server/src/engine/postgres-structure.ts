import type { NamedTable, RefusalCase, StructureCheckResult } from "./database.js";
import { ParseError, type PgParser } from "./pg-parser.js";
import { SYSTEM_SCHEMA, visibleKey as key, type VisibleObjects, type VisibleTableInfo } from "../visibility.js";

/**
 * The Query check's structural layer on PostgreSQL, its first two steps: size, then a walk of
 * the parse tree that accepts only the node types, functions, operators and casts listed, so
 * that every Refusal depends on the query's text and on what
 * `list_tables` shows, never on what is hidden. Passing it is not passing the Query check: the
 * plan layer runs after it, in `PostgresDatabase.query`.
 */

/** Agent-written query text is accepted up to this many bytes. */
export const QUERY_MAX_BYTES = 64 * 1024;

class Refused extends Error {
  constructor(readonly refusal: RefusalCase) {
    super(refusal);
  }
}

type Node = Record<string, unknown>;

/** The PostgreSQL functions an Agent-written query may call, under the names the parser gives them (`trim` → `btrim`, `AT TIME ZONE` → `timezone`). */
const FUNCTIONS = new Set(
  (
    "count sum avg min max string_agg array_agg bool_and bool_or stddev stddev_pop stddev_samp variance var_pop var_samp " +
    "percentile_cont percentile_disc mode row_number rank dense_rank percent_rank cume_dist ntile lag lead first_value " +
    "last_value nth_value now date_trunc date_part extract age make_date make_timestamp to_char to_date to_timestamp " +
    "justify_days justify_hours justify_interval timezone lower upper length char_length substring btrim ltrim rtrim replace " +
    "concat concat_ws left right position strpos split_part initcap lpad rpad abs round ceil floor trunc mod power sqrt sign " +
    "unnest generate_series"
  ).split(" "),
);
const SET_RETURNING = new Set(["unnest", "generate_series"]);

/** Cast and typed-literal targets, under the parser's names for their SQL spellings. */
const CAST_TYPES = new Set("bool int2 int4 int8 numeric float4 float8 text varchar bpchar date time timetz timestamp timestamptz interval uuid".split(" "));

const VALUE_FUNCTIONS = new Set(["SVFOP_CURRENT_DATE", "SVFOP_CURRENT_TIMESTAMP", "SVFOP_CURRENT_TIMESTAMP_N"]);

const EXPR_KINDS = new Set([
  "AEXPR_OP",
  "AEXPR_OP_ANY",
  "AEXPR_OP_ALL",
  "AEXPR_DISTINCT",
  "AEXPR_NOT_DISTINCT",
  "AEXPR_NULLIF",
  "AEXPR_IN",
  "AEXPR_LIKE",
  "AEXPR_ILIKE",
  "AEXPR_BETWEEN",
  "AEXPR_NOT_BETWEEN",
  "AEXPR_BETWEEN_SYM",
  "AEXPR_NOT_BETWEEN_SYM",
]);

const SUBLINK_KINDS = new Set(["EXISTS_SUBLINK", "ANY_SUBLINK", "ALL_SUBLINK", "EXPR_SUBLINK", "ARRAY_SUBLINK"]);

/** The one node a wrapper `{ Type: {...} }` holds. */
function unwrap(node: unknown): [string, Node] {
  if (!node || typeof node !== "object" || Array.isArray(node)) throw new Refused("unsupported");
  const entries = Object.entries(node as Node);
  if (entries.length !== 1) throw new Refused("unsupported");
  const [type, body] = entries[0]!;
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Refused("unsupported");
  return [type, body as Node];
}

/** Refuses any field outside `allowed`; an unexpected field is a construct nobody listed. */
function only(node: Node, allowed: string[]) {
  for (const k of Object.keys(node)) if (k !== "location" && !allowed.includes(k)) throw new Refused("unsupported");
}

const list = (v: unknown): unknown[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const str = (n: unknown): string | undefined => {
  if (!n || typeof n !== "object") return undefined;
  const s = (n as { String?: { sval?: string } }).String;
  return s ? (s.sval ?? "") : undefined;
};
const names = (v: unknown): string[] =>
  list(v).map((n) => {
    const s = str(n);
    if (s === undefined) throw new Refused("unsupported");
    return s;
  });

/** A name list such as a function's or a type's: unqualified, or qualified with `pg_catalog` only. */
function builtinName(v: unknown): string {
  const parts = names(v);
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2 && parts[0] === "pg_catalog") return parts[1]!;
  throw new Refused("unsupported");
}

type Rel =
  | { kind: "table"; refname: string; schema: string; table: string; aliased: boolean; info: VisibleTableInfo }
  | { kind: "derived"; refname: string; outputs: (string | null)[] }
  | { kind: "function"; refname: string; outputs: string[] };

class Scope {
  rels: Rel[] = [];
  constructor(
    readonly parent: Scope | undefined,
    readonly ctes: Map<string, (string | null)[]> = new Map(),
  ) {}

  cte(name: string): (string | null)[] | undefined {
    return this.ctes.get(name) ?? this.parent?.cte(name);
  }

  /** The relation a qualifier names, innermost query first, as PostgreSQL resolves it. */
  resolve(qualifier: string[]): Rel | undefined {
    const here =
      qualifier.length === 1
        ? this.rels.filter((r) => r.refname === qualifier[0])
        : this.rels.filter((r) => r.kind === "table" && !r.aliased && r.schema === qualifier[0] && r.table === qualifier[1]);
    if (here.length > 1) throw new Refused("unsupported");
    return here[0] ?? this.parent?.resolve(qualifier);
  }
}

/** A scope that sees the query's outer levels and CTEs but none of its own FROM items. */
const beside = (scope: Scope) => new Scope(scope.parent, scope.ctes);

class Walker {
  readonly tables: NamedTable[] = [];
  constructor(private readonly visible: VisibleObjects) {}

  /** Walks one SelectStmt, returning the output names a parent may reference. */
  select(node: Node, parent: Scope | undefined): (string | null)[] {
    only(node, [
      "distinctClause",
      "intoClause",
      "targetList",
      "fromClause",
      "whereClause",
      "groupClause",
      "groupDistinct",
      "havingClause",
      "windowClause",
      "valuesLists",
      "sortClause",
      "limitOffset",
      "limitCount",
      "limitOption",
      "lockingClause",
      "withClause",
      "op",
      "all",
      "larg",
      "rarg",
    ]);
    if (node.intoClause || list(node.lockingClause).length) throw new Refused("not_select");
    if (node.limitOption && node.limitOption !== "LIMIT_OPTION_DEFAULT" && node.limitOption !== "LIMIT_OPTION_COUNT") {
      throw new Refused("unsupported");
    }
    const scope = new Scope(parent);
    if (node.withClause) this.withClause(node.withClause as Node, scope);

    let outputs: (string | null)[];
    let explicit: (string | null)[];
    if (node.op && node.op !== "SETOP_NONE") {
      const [lt, l] = unwrap({ SelectStmt: node.larg });
      const [rt, r] = unwrap({ SelectStmt: node.rarg });
      if (lt !== "SelectStmt" || rt !== "SelectStmt") throw new Refused("unsupported");
      outputs = this.select(l, scope);
      this.select(r, scope);
      explicit = leftmostNames(node);
    } else {
      for (const item of list(node.fromClause)) scope.rels.push(...this.from(item, scope));
      if (node.valuesLists) {
        outputs = [];
        for (const row of list(node.valuesLists)) {
          const [t, body] = unwrap(row);
          if (t !== "List") throw new Refused("unsupported");
          outputs = list(body.items).map(() => null);
          for (const v of list(body.items)) this.expr(v, scope);
        }
        explicit = outputs;
      } else {
        outputs = this.targets(node.targetList, scope);
        explicit = list(node.targetList).map((t) => (unwrap(t)[1].name as string | undefined) ?? null);
      }
      for (const d of list(node.distinctClause)) if (d && Object.keys(d as Node).length) this.expr(d, scope);
      if (node.whereClause) this.expr(node.whereClause, scope);
      for (const g of list(node.groupClause)) this.expr(g, scope);
      if (node.havingClause) this.expr(node.havingClause, scope);
      for (const w of list(node.windowClause)) {
        const [t, body] = unwrap(w);
        if (t !== "WindowDef") throw new Refused("unsupported");
        this.window(body, scope);
      }
    }
    for (const s of list(node.sortClause)) this.sortBy(s, scope, explicit);
    if (node.limitCount) this.expr(node.limitCount, scope);
    if (node.limitOffset) this.expr(node.limitOffset, scope);
    return outputs;
  }

  private withClause(w: Node, scope: Scope) {
    only(w, ["ctes", "recursive"]);
    for (const c of list(w.ctes)) {
      const [t, cte] = unwrap(c);
      if (t !== "CommonTableExpr") throw new Refused("unsupported");
      only(cte, ["ctename", "aliascolnames", "ctematerialized", "ctequery"]);
      const [qt, query] = unwrap(cte.ctequery);
      if (qt !== "SelectStmt") throw new Refused("not_select");
      const name = cte.ctename as string;
      const aliases = names(cte.aliascolnames);
      const named = (outs: (string | null)[]) => (aliases.length ? withAliases(outs, aliases) : outs);
      if (w.recursive && query.op && query.op !== "SETOP_NONE") {
        // The non-recursive term comes first and fixes the columns the recursive term can read.
        const seed = new Walker(this.visible);
        const outs = named(seed.select(unwrap({ SelectStmt: query.larg })[1], beside(scope)));
        this.tables.push(...seed.tables);
        scope.ctes.set(name, outs);
        this.select(query, beside(scope));
      } else {
        const outs = named(this.select(query, beside(scope)));
        scope.ctes.set(name, outs);
      }
    }
  }

  /** One FROM item; `scope` holds the items before it, which only LATERAL items and functions may read. */
  private from(item: unknown, scope: Scope): Rel[] {
    const [type, node] = unwrap(item);
    switch (type) {
      case "RangeVar": {
        only(node, ["catalogname", "schemaname", "relname", "inh", "relpersistence", "alias"]);
        if (node.catalogname) throw new Refused("unsupported");
        const alias = node.alias as Node | undefined;
        if (alias) {
          only(alias, ["aliasname"]);
        }
        const relname = node.relname as string;
        const refname = (alias?.aliasname as string | undefined) ?? relname;
        const schema = node.schemaname as string | undefined;
        if (!schema) {
          const outs = scope.cte(relname);
          if (!outs) throw new Refused("unqualified");
          return [{ kind: "derived", refname, outputs: outs }];
        }
        if (SYSTEM_SCHEMA.test(schema)) throw new Refused("unsupported");
        const info = this.visible.tables.get(key(schema, relname));
        if (!info) throw new Refused("hidden");
        this.tables.push({ schema, table: relname });
        return [{ kind: "table", refname, schema, table: relname, aliased: Boolean(alias), info }];
      }
      case "RangeSubselect": {
        only(node, ["lateral", "subquery", "alias"]);
        const [t, sub] = unwrap(node.subquery);
        if (t !== "SelectStmt") throw new Refused("unsupported");
        const outs = this.select(sub, node.lateral ? scope : beside(scope));
        const alias = node.alias as Node | undefined;
        if (alias) only(alias, ["aliasname", "colnames"]);
        const aliases = names(alias?.colnames);
        return [{ kind: "derived", refname: (alias?.aliasname as string | undefined) ?? "", outputs: aliases.length ? withAliases(outs, aliases) : outs }];
      }
      case "RangeFunction": {
        only(node, ["lateral", "functions", "alias"]);
        const fns = list(node.functions);
        if (fns.length !== 1) throw new Refused("unsupported");
        // Each entry pairs the call with its column definition list, which is empty unless one was written.
        const [lt, pair] = unwrap(fns[0]);
        const items = list(pair.items);
        const coldefs = items[1];
        if (lt !== "List" || items.length > 2 || (coldefs && Object.keys(coldefs as Node).length)) throw new Refused("unsupported");
        const [ft, call] = unwrap(items[0]);
        if (ft !== "FuncCall") throw new Refused("unsupported");
        const name = builtinName(call.funcname);
        if (!SET_RETURNING.has(name)) throw new Refused("unsupported");
        // A function in FROM may read the items before it, as PostgreSQL makes it implicitly LATERAL.
        this.expr(items[0], scope);
        const alias = node.alias as Node | undefined;
        if (alias) only(alias, ["aliasname", "colnames"]);
        return [{ kind: "function", refname: (alias?.aliasname as string | undefined) ?? name, outputs: names(alias?.colnames) }];
      }
      case "JoinExpr": {
        only(node, ["jointype", "isNatural", "larg", "rarg", "usingClause", "join_using_alias", "quals", "alias", "rtindex"]);
        if (node.isNatural || list(node.usingClause).length || node.join_using_alias) throw new Refused("unqualified");
        if (node.alias) throw new Refused("unsupported");
        const left = this.from(node.larg, scope);
        const withLeft = new Scope(scope.parent, scope.ctes);
        withLeft.rels = [...scope.rels, ...left];
        const right = this.from(node.rarg, withLeft);
        if (node.quals) {
          // ON reads only the join's own sides, and the query's outer levels.
          const on = beside(scope);
          on.rels = [...left, ...right];
          this.expr(node.quals, on);
        }
        return [...left, ...right];
      }
      default:
        throw new Refused("unsupported");
    }
  }

  private targets(targetList: unknown, scope: Scope): (string | null)[] {
    const outputs: (string | null)[] = [];
    for (const t of list(targetList)) {
      const [type, rt] = unwrap(t);
      if (type !== "ResTarget") throw new Refused("unsupported");
      only(rt, ["name", "indirection", "val"]);
      if (list(rt.indirection).length) throw new Refused("unsupported");
      const [vt, val] = unwrap(rt.val);
      const fields = vt === "ColumnRef" ? list(val.fields) : [];
      if (vt === "ColumnRef" && fields.length && isStar(fields[fields.length - 1])) {
        outputs.push(...this.star(fields.slice(0, -1), scope));
        continue;
      }
      this.expr(rt.val, scope);
      if (rt.name) outputs.push(rt.name as string);
      else if (vt === "ColumnRef" && fields.length > 1) outputs.push(str(fields[fields.length - 1]) ?? null);
      else outputs.push(null);
    }
    return outputs;
  }

  /** `*` or `alias.*` as a whole select-list item. */
  private star(qualifier: unknown[], scope: Scope): (string | null)[] {
    const rels = qualifier.length ? [this.rel(names(qualifier), scope)] : scope.rels;
    const outputs: (string | null)[] = [];
    for (const rel of rels) {
      if (rel.kind === "table") {
        if (!rel.info.allReadable) throw new Refused("star");
        outputs.push(...rel.info.columns.keys());
      } else {
        outputs.push(...rel.outputs);
      }
    }
    return outputs;
  }

  private rel(qualifier: string[], scope: Scope): Rel {
    if (qualifier.length > 2) throw new Refused("unsupported");
    const rel = scope.resolve(qualifier);
    if (!rel) throw new Refused("unqualified");
    return rel;
  }

  private column(node: Node, scope: Scope) {
    only(node, ["fields"]);
    const fields = list(node.fields);
    if (fields.some(isStar)) throw new Refused("unsupported");
    const parts = names(fields);
    if (parts.length < 2) throw new Refused("unqualified");
    const rel = this.rel(parts.slice(0, -1), scope);
    const name = parts[parts.length - 1]!;
    if (rel.kind === "table") {
      const col = rel.info.columns.get(name);
      if (!col) throw new Refused("hidden");
      if (!col.readable) throw new Refused("unreadable_type");
    } else if (!rel.outputs.includes(name)) {
      throw new Refused("unnamed_output");
    }
  }

  private sortBy(item: unknown, scope: Scope, outputNames?: (string | null)[]) {
    const [type, node] = unwrap(item);
    if (type !== "SortBy") throw new Refused("unsupported");
    only(node, ["node", "sortby_dir", "sortby_nulls", "useOp"]);
    if (list(node.useOp).length) throw new Refused("unsupported");
    if (outputNames) {
      // A bare name in the SELECT's own ORDER BY resolves to an output column before any input column.
      const [t, ref] = unwrap(node.node);
      const fields = t === "ColumnRef" ? list(ref.fields) : [];
      const bare = fields.length === 1 ? str(fields[0]) : undefined;
      if (bare !== undefined && outputNames.filter((n) => n === bare).length === 1) return;
    }
    this.expr(node.node, scope);
  }

  private window(w: Node, scope: Scope) {
    only(w, ["name", "refname", "partitionClause", "orderClause", "frameOptions", "startOffset", "endOffset"]);
    for (const p of list(w.partitionClause)) this.expr(p, scope);
    for (const s of list(w.orderClause)) this.sortBy(s, scope);
    if (w.startOffset) this.expr(w.startOffset, scope);
    if (w.endOffset) this.expr(w.endOffset, scope);
  }

  private operator(name: unknown) {
    builtinName(name);
  }

  private typeName(t: Node) {
    only(t, ["names", "typmods", "typemod", "arrayBounds"]);
    if (list(t.arrayBounds).length) throw new Refused("unsupported");
    if (!CAST_TYPES.has(builtinName(t.names))) throw new Refused("unsupported");
    // A type modifier is a whole number (`numeric(12,2)`); anything else written there is a value.
    for (const m of list(t.typmods)) {
      const [mt, c] = unwrap(m);
      if (mt !== "A_Const" || !("ival" in c)) throw new Refused("unsupported");
    }
  }

  expr(item: unknown, scope: Scope): void {
    const [type, node] = unwrap(item);
    switch (type) {
      case "A_Const":
        return;
      case "ColumnRef":
        return this.column(node, scope);
      case "TypeCast":
        only(node, ["arg", "typeName"]);
        this.typeName(node.typeName as Node);
        return this.expr(node.arg, scope);
      case "A_Expr":
        only(node, ["kind", "name", "lexpr", "rexpr"]);
        if (!EXPR_KINDS.has(node.kind as string)) throw new Refused("unsupported");
        this.operator(node.name);
        if (node.lexpr) this.expr(node.lexpr, scope);
        if (node.rexpr) this.expr(node.rexpr, scope);
        return;
      case "List":
        only(node, ["items"]);
        for (const i of list(node.items)) this.expr(i, scope);
        return;
      case "BoolExpr":
        only(node, ["boolop", "args"]);
        for (const a of list(node.args)) this.expr(a, scope);
        return;
      case "NullTest":
        only(node, ["arg", "nulltesttype"]);
        return this.expr(node.arg, scope);
      case "BooleanTest":
        only(node, ["arg", "booltesttype"]);
        return this.expr(node.arg, scope);
      case "CaseExpr":
        only(node, ["arg", "args", "defresult"]);
        if (node.arg) this.expr(node.arg, scope);
        for (const w of list(node.args)) {
          const [wt, when] = unwrap(w);
          if (wt !== "CaseWhen") throw new Refused("unsupported");
          only(when, ["expr", "result"]);
          this.expr(when.expr, scope);
          this.expr(when.result, scope);
        }
        if (node.defresult) this.expr(node.defresult, scope);
        return;
      case "CoalesceExpr":
        only(node, ["args"]);
        for (const a of list(node.args)) this.expr(a, scope);
        return;
      case "MinMaxExpr":
        only(node, ["op", "args"]);
        for (const a of list(node.args)) this.expr(a, scope);
        return;
      case "SQLValueFunction":
        only(node, ["op", "typmod"]);
        if (!VALUE_FUNCTIONS.has(node.op as string)) throw new Refused("unsupported");
        return;
      case "FuncCall": {
        only(node, ["funcname", "args", "agg_order", "agg_filter", "over", "agg_within_group", "agg_star", "agg_distinct", "func_variadic", "funcformat"]);
        if (node.func_variadic) throw new Refused("unsupported");
        if (!FUNCTIONS.has(builtinName(node.funcname))) throw new Refused("unsupported");
        for (const a of list(node.args)) this.expr(a, scope);
        for (const s of list(node.agg_order)) this.sortBy(s, scope);
        if (node.agg_filter) this.expr(node.agg_filter, scope);
        if (node.over) this.window(node.over as Node, scope);
        return;
      }
      case "SubLink": {
        only(node, ["subLinkType", "testexpr", "operName", "subselect"]);
        if (!SUBLINK_KINDS.has(node.subLinkType as string)) throw new Refused("unsupported");
        if (list(node.operName).length) this.operator(node.operName);
        if (node.testexpr) this.expr(node.testexpr, scope);
        const [t, sub] = unwrap(node.subselect);
        if (t !== "SelectStmt") throw new Refused("unsupported");
        this.select(sub, scope);
        return;
      }
      case "A_ArrayExpr":
        only(node, ["elements"]);
        for (const e of list(node.elements)) this.expr(e, scope);
        return;
      case "GroupingSet":
        only(node, ["kind", "content"]);
        for (const c of list(node.content)) this.expr(c, scope);
        return;
      default:
        throw new Refused("unsupported");
    }
  }
}

const isStar = (n: unknown) => Boolean(n && typeof n === "object" && "A_Star" in (n as Node));

/** A column-alias list renames a relation's first outputs. */
function withAliases(outputs: (string | null)[], aliases: string[]): (string | null)[] {
  return outputs.map((o, i) => (i < aliases.length ? aliases[i]! : o));
}

/** A set operation's output names are its leftmost SELECT's explicit `AS` names. */
function leftmostNames(node: Node): (string | null)[] {
  let n = node;
  while (n.op && n.op !== "SETOP_NONE") n = n.larg as Node;
  return list(n.targetList).map((t) => (unwrap(t)[1].name as string | undefined) ?? null);
}

export const utf8Length = (s: string) => new TextEncoder().encode(s).length;

/** The one SelectStmt a parse tree holds, if that is all it holds. */
export function onlySelect(tree: ReturnType<PgParser["parse"]>): Node | undefined {
  const stmts = tree.stmts ?? [];
  if (stmts.length !== 1) return undefined;
  const [type, select] = Object.entries(stmts[0]!.stmt)[0] ?? [];
  return type === "SelectStmt" ? (select as Node) : undefined;
}

/** Runs the size and structural steps of the Query check over one Agent-written query. */
export function checkStructure(sql: string, parser: PgParser, visible: VisibleObjects): StructureCheckResult {
  if (utf8Length(sql) > QUERY_MAX_BYTES) return { ok: false, refusal: "too_long" };
  let tree: ReturnType<PgParser["parse"]>;
  try {
    tree = parser.parse(sql);
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, refusal: "not_parsed" };
    // A tree nested deeper than JavaScript can read back: refused like any construct the walk cannot read.
    if (e instanceof RangeError) return { ok: false, refusal: "unsupported" };
    throw e;
  }
  const select = onlySelect(tree);
  if (!select) return { ok: false, refusal: "not_select" };
  const walker = new Walker(visible);
  try {
    walker.select(select, undefined);
  } catch (e) {
    if (e instanceof Refused) return { ok: false, refusal: e.refusal };
    // Nested deeper than the walk can follow, within the size limit: refused like any construct it cannot read.
    if (e instanceof RangeError) return { ok: false, refusal: "unsupported" };
    throw e;
  }
  return { ok: true, tables: walker.tables };
}
