// @ts-expect-error The Emscripten glue ships without types; its default export builds the module.
import PgQueryModule from "@libpg-query/parser/wasm/libpg-query.js";

/** PostgreSQL's own parser, compiled to WebAssembly (`@libpg-query/parser` 17.x). */
export interface PgParser {
  /** The parse tree as libpg_query's JSON; throws a ParseError when the SQL does not parse. */
  parse(sql: string): { stmts: { stmt: Record<string, unknown> }[] };
  /** The SQL with every literal replaced by `$n`, which Redaction logs. */
  normalize(sql: string): string;
  /** PostgreSQL's own lexer: each token with its byte offsets, comments included. */
  scan(sql: string): { start: number; end: number; tokenName: string }[];
}

/** The SQL did not parse. Its message is the parser's, and is never shown to the Agent or logged. */
export class ParseError extends Error {}

interface Emscripten {
  _malloc(n: number): number;
  _free(p: number): void;
  lengthBytesUTF8(s: string): number;
  stringToUTF8(s: string, p: number, n: number): void;
  UTF8ToString(p: number): string;
  getValue(p: number, type: "i32"): number;
  _wasm_parse_query_raw(p: number): number;
  _wasm_free_parse_result(p: number): void;
  _wasm_normalize_query(p: number): number;
  _wasm_scan(p: number): number;
  _wasm_free_string(p: number): void;
}

/**
 * Loads the parser from a compiled WebAssembly module. Workers cannot compile WebAssembly from
 * bytes at run time, so the Worker imports the `.wasm` file as a module and passes it here; Node
 * compiles the same file from disk. The package's own entry point is not used: it instantiates on
 * import, through Node's file system.
 */
export async function loadPgParser(wasm: WebAssembly.Module): Promise<PgParser> {
  // On Workers the glue needs `__filename` and `__dirname`, which wrangler.jsonc defines at build time.
  const m = (await PgQueryModule({
    instantiateWasm(imports: WebAssembly.Imports, receive: (instance: WebAssembly.Instance) => void) {
      WebAssembly.instantiate(wasm, imports).then(receive);
      return {};
    },
  })) as Emscripten;

  const withString = <T>(sql: string, use: (ptr: number) => T): T => {
    const len = m.lengthBytesUTF8(sql) + 1;
    const ptr = m._malloc(len);
    try {
      m.stringToUTF8(sql, ptr, len);
      return use(ptr);
    } finally {
      m._free(ptr);
    }
  };

  return {
    parse: (sql) =>
      withString(sql, (ptr) => {
        const result = m._wasm_parse_query_raw(ptr);
        try {
          const tree = m.getValue(result, "i32");
          const error = m.getValue(result + 8, "i32");
          if (error || !tree) throw new ParseError(error ? m.UTF8ToString(m.getValue(error, "i32")) : "no parse tree");
          return JSON.parse(m.UTF8ToString(tree)) as ReturnType<PgParser["parse"]>;
        } finally {
          m._wasm_free_parse_result(result);
        }
      }),
    normalize: (sql) => text(sql, m._wasm_normalize_query),
    scan: (sql) => {
      // The lexer answers with error text, not JSON, for input it cannot finish (an unterminated literal).
      const out = text(sql, m._wasm_scan);
      try {
        return (JSON.parse(out) as { tokens?: ReturnType<PgParser["scan"]> }).tokens ?? [];
      } catch {
        throw new ParseError(out);
      }
    },
  };

  /** Calls a WebAssembly entry point that returns a string, which starts with an error's text on failure. */
  function text(sql: string, entry: (ptr: number) => number): string {
    return withString(sql, (ptr) => {
      const result = entry(ptr);
      try {
        const out = m.UTF8ToString(result);
        if (/^(syntax error|deparse error|ERROR)/.test(out)) throw new ParseError(out);
        return out;
      } finally {
        m._wasm_free_string(result);
      }
    });
  }
}
