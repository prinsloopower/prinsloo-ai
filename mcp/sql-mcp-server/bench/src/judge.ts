/** What a Question's answer must be (S-004 spec, Judging). */
export type Expected =
  | { type: "integer"; value: number }
  | { type: "number"; value: number }
  | { type: "text"; value: string }
  | { type: "list"; value: string[] }
  | { type: "map"; value: Record<string, number>; values: "integer" | "number" }
  | { type: "unavailable" };

/** Floating point puts a difference of exactly the tolerance a hair beyond it. */
const EPSILON = 1e-9;

/** Backticks, `*` and `_` wrapping a line or a value, as Markdown emphasis and code put them. */
const unwrap = (s: string) => s.replace(/^[\s`*_]+|[\s`*_]+$/g, "");

/** Judges a reply by its last `ANSWER:` line, with Markdown removed around the line and around the value. */
export function judge(reply: string, expected: Expected): { correct: boolean; given: string | null } {
  const answers = reply
    .split(/\r?\n/)
    .map((line) => unwrap(line.replace(/^\s*>\s*/, "")))
    .filter((line) => line.startsWith("ANSWER:"));
  const last = answers.at(-1);
  if (last === undefined) return { correct: false, given: null };
  const given = unwrap(last.slice("ANSWER:".length));
  return { correct: matches(given, expected), given };
}

function matches(given: string, expected: Expected): boolean {
  switch (expected.type) {
    case "integer":
    case "number":
      return numberMatches(given.replace(/,/g, ""), expected.type, expected.value);
    case "text":
      return text(given) === text(expected.value);
    case "unavailable":
      return text(given) === "unavailable";
    case "list": {
      const got = new Set(given.split(",").map(text));
      const want = new Set(expected.value.map(text));
      return got.size === want.size && [...want].every((v) => got.has(v));
    }
    case "map": {
      const want = new Map(Object.entries(expected.value).map(([k, v]) => [text(k), v]));
      const pairs = given.split(",").map((pair) => pair.split("="));
      if (pairs.some((p) => p.length !== 2)) return false;
      const got = new Map(pairs.map(([k, v]) => [text(k!), v!.trim()]));
      return (
        got.size === want.size &&
        [...want].every(([k, v]) => got.has(k) && numberMatches(got.get(k)!, expected.values, v))
      );
    }
  }
}

function numberMatches(given: string, type: "integer" | "number", value: number): boolean {
  const s = given.replace(/\s/g, "");
  if (!/^[-+]?\d+(\.\d+)?$/.test(s)) return false;
  const n = Number(s);
  if (type === "integer") return n === value;
  return Math.abs(n - value) <= Math.max(Math.abs(value) * 0.005, 0.01) + EPSILON;
}

/** Text compares ignoring case, surrounding spaces and a trailing full stop; a run of inner spaces counts as one. */
function text(s: string): string {
  return s.trim().replace(/\.$/, "").trim().replace(/\s+/g, " ").toLowerCase();
}
