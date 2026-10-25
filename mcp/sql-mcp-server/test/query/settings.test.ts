import { describe, expect, it } from "vitest";
import { readConfig } from "../../src/config.js";
import { salesDatabase } from "../listing/fake-database.js";
import { callMcp, captureConsole, harness, SECRET } from "../signin/helpers.js";

const base = { SERVER_SECRET: SECRET };

describe("S-003 Row limit and Redaction settings", () => {
  it("row_limit_setting_parsed_and_validated", () => {
    const rowLimit = (v?: string) => {
      const r = readConfig(v === undefined ? base : { ...base, ROW_LIMIT: v });
      return r.ok ? r.config.rowLimit : r;
    };
    expect(rowLimit()).toBe(500);
    expect(rowLimit("1")).toBe(1);
    expect(rowLimit("3")).toBe(3);
    expect(rowLimit("10000")).toBe(10000);
    for (const bad of ["0", "10001", "abc", "1.5", "-3", "5e2", " "]) {
      expect(rowLimit(bad), bad).toEqual(bad.trim() === "" ? 500 : { ok: false, variable: "ROW_LIMIT" });
    }
  });

  it("redaction_setting_parsed_and_validated", () => {
    const redaction = (v?: string) => {
      const r = readConfig(v === undefined ? base : { ...base, REDACTION: v });
      return r.ok ? r.config.redaction : r;
    };
    expect(redaction()).toBe(true);
    expect(redaction("on")).toBe(true);
    expect(redaction("off")).toBe(false);
    for (const bad of ["maybe", "true", "OFF", "0"]) {
      expect(redaction(bad), bad).toEqual({ ok: false, variable: "REDACTION" });
    }
  });

  it("invalid_row_limit_or_redaction_answers_503", async () => {
    for (const [variable, value] of [["ROW_LIMIT", "0"], ["ROW_LIMIT", "10001"], ["ROW_LIMIT", "abc"], ["REDACTION", "maybe"]] as const) {
      const lines = await captureConsole(async () => {
        const h = await harness({ [variable]: value }, { realMcp: true, database: salesDatabase() });
        const res = await callMcp(h, null);
        expect(res.status).toBe(503);
        expect(await res.text()).toBe(`Deployment misconfigured: ${variable}`);
      });
      const parsed = lines.map((l) => { try { return JSON.parse(l) as Record<string, unknown>; } catch { return null; } });
      expect(parsed.some((l) => l?.type === "op" && l.event === "config_invalid" && l.variable === variable)).toBe(true);
      expect(parsed.some((l) => l?.type === "audit")).toBe(false);
    }
  });
});
