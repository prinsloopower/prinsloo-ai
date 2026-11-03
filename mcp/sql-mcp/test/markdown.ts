/** Rows of the first markdown table after `heading` in `text`, as trimmed cells, header and rule left out. An escaped `\|` stays inside its cell. */
export function table(text: string, heading: string): string[][] {
  const lines = text.slice(text.indexOf(heading)).split("\n");
  const start = lines.findIndex((l) => l.startsWith("|"));
  const end = lines.findIndex((l, i) => i > start && !l.startsWith("|"));
  return lines.slice(start + 2, end === -1 ? undefined : end).map((l) => l.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim()));
}
