import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { loadPgParser, type PgParser } from "../../src/engine/pg-parser.js";

let loaded: Promise<PgParser> | undefined;

/** The parser as Node loads it: the same .wasm file the Worker bundles, compiled from disk. */
export function nodeParser(): Promise<PgParser> {
  const file = createRequire(import.meta.url).resolve("@libpg-query/parser/wasm/libpg-query.wasm");
  // The Workers types leave WebAssembly's compile entry points out; Node has them.
  const compile = WebAssembly as unknown as { compile(bytes: Uint8Array): Promise<WebAssembly.Module> };
  return (loaded ??= compile.compile(readFileSync(file)).then(loadPgParser));
}
