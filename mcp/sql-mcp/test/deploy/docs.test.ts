import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { table } from "../markdown.js";

const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const guide = () => read("deploy/cloudflare/guide.md");
/** The guide's section headed `## <n>. …`, up to the next one. */
const section = (n: number) => guide().split(/^## /m).find((s) => s.startsWith(`${n}. `)) ?? "";

describe("the Deployment kit's docs", () => {
  it("kit_guide_names_every_cloudflare_setting", () => {
    const variables = table(read("docs/settings.md"), "## Variables").map((r) => r[0]!);
    // DATABASE_URL is Azure's, and PORT the container's; every other variable applies on Cloudflare.
    const azureOnly = ["DATABASE_URL", "PORT"];
    expect(variables).toEqual(expect.arrayContaining(azureOnly));
    const cloudflare = variables.filter((v) => !azureOnly.includes(v));
    expect(cloudflare.length).toBeGreaterThanOrEqual(12);
    for (const v of cloudflare) expect(guide(), v).toContain(`\`${v}\``);
    for (const term of ["Boundary", "Row limit", "Permission tier", "Redaction", "Database account", "Allow-list"]) expect(guide(), term).toContain(term);
  });

  it("kit_guide_explains_healthz_failures", () => {
    const trouble = section(9);
    for (const report of ["config: invalid", "database: unreachable", "database: unsafe"]) {
      const at = trouble.indexOf(report);
      expect(at, report).toBeGreaterThan(-1);
      // Each report is followed by what it means and what to change, not just named.
      expect(trouble.slice(at).split("\n")[0]!.length, report).toBeGreaterThan(report.length + 60);
    }
  });

  it("kit_guide_gives_smoke_checks_as_curl", () => {
    const smoke = read("scripts/smoke.mjs");
    const paths = [...smoke.matchAll(/fetch\(`\$\{base\}([^`]+)`/g)].map((m) => m[1]!);
    expect(paths).toEqual(["/healthz", "/mcp", "/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-authorization-server"]);
    const curls = guide().split("\n").filter((l) => /^\s*curl /.test(l));
    for (const p of paths) expect(curls.some((l) => l.includes(p)), p).toBe(true);
    // The unauthenticated MCP call is a POST, and the check reads its WWW-Authenticate header.
    expect(curls.some((l) => l.includes("/mcp") && l.includes("-X POST") && l.includes("-i"))).toBe(true);
  });

  it("kit_guide_names_every_setup_call", () => {
    const setup = read("deploy/cloudflare/lib/setup.ts");
    const api = read("deploy/cloudflare/lib/cloudflare.ts");
    // Each Wrangler call's leading words, up to its first flag or variable: `wrangler secret put`.
    const commands = [...setup.matchAll(/deps\.wrangler\(\[([^\]]*)\]/g)].map((m) => {
      const words: string[] = [];
      for (const item of m[1]!.split(",").map((x) => x.trim())) {
        const word = item.match(/^"([a-z]+)"$/)?.[1];
        if (!word) break;
        words.push(word);
      }
      return `wrangler ${words.join(" ")}`;
    });
    const calls = [...api.matchAll(/\("(GET|POST|PATCH|DELETE)", [`"]([^`"]+)[`"]/g)].map((m) => [m[1]!, m[2]!.replace(/\$\{[^}]+\}/g, "<")] as const);
    // The scan must find the calls at all, or this test would pass on an empty list.
    expect(commands).toContain("wrangler deploy");
    expect(calls.map(([m]) => m)).toContain("POST");
    const text = section(3);
    for (const c of new Set(commands)) expect(text, c).toContain(c);
    for (const [method, path] of calls) {
      const pattern = new RegExp(`${method} \`?/accounts/<[^>]+>${path.split("<").map(escapeRegExp).join("<[^>]+>")}`);
      expect(text, `${method} ${path}`).toMatch(pattern);
    }
  });

  it("kit_guide_covers_every_monitoring_signal", () => {
    const rows = table(read("docs/settings.md"), "## Monitoring");
    expect(rows.map((r) => r[0])).toEqual(["`/healthz`", "Database errors", "Identity provider failures", "Server faults", "configuration errors", "5xx responses"]);
    // Each signal's own entry: a list item that opens with the signal's name in bold.
    const entries = section(8).split("\n").filter((l) => l.startsWith("- **"));
    for (const [signal, , threshold] of rows) {
      const name = signal!.replace(/`/g, "").toLowerCase();
      const entry = entries.find((l) => l.toLowerCase().replace(/`/g, "").startsWith(`- **${name}`));
      expect(entry, name).toBeDefined();
      expect(entry, `${name}: ${threshold}`).toContain(`Call a human at ${threshold}.`);
      // Workers Logs entries filter on the Server's own lines, so another Worker's lines never match.
      if (/Audit records|operational lines/.test(rows.find((r) => r[0] === signal)![1]!)) expect(entry, name).toContain("`$metadata.type` equals `cf-worker`");
    }
  });

  it("readme_states_pairings_ai_tools_and_retention", () => {
    const readme = read("README.md");
    expect(readme).toMatch(/PostgreSQL on Supabase[^\n]*Cloudflare/);
    expect(readme).toMatch(/MS SQL Server[^\n]*Azure/);
    expect(readme).toMatch(/AWS[^\n]*planned/);
    expect(readme).toMatch(/Claude and ChatGPT/);
    expect(readme).toMatch(/Copilot[^\n]*planned/);
    expect(readme).toMatch(/3 days[^\n]*Free[^\n]*7[^\n]*Paid/);
    expect(readme).toContain("deploy/cloudflare/guide.md");
  });

  it("staff_guide_covers_claude_chatgpt_and_refusals", () => {
    const staff = read("deploy/cloudflare/staff.md");
    for (const heading of ["## Claude", "## ChatGPT", "## What to expect"]) expect(staff, heading).toContain(heading);
    // How to connect each tool: the address ending in /mcp, and signing in with the work account.
    for (const tool of staff.split(/^## /m).filter((s) => /^(Claude|ChatGPT)\n/.test(s))) {
      expect(tool).toMatch(/address/);
      expect(tool).toMatch(/work account/);
    }
    // What a Staff member meets: a cut-short result, a Refusal that names nothing, signing in again.
    expect(staff).toMatch(/cut short/);
    expect(staff).toMatch(/refused[^\n]*names nothing it hides/);
    expect(staff).toMatch(/sign in again/);
    expect(staff).toMatch(/recorded with your name/);
  });
});

function escapeRegExp(t: string) {
  return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
