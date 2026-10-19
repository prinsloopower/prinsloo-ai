import { describe, expect, it } from "vitest";
import { Tokens, type TokenKind } from "../../src/signin/tokens.js";
import { flip, OTHER_SECRET, SECRET } from "./helpers.js";

const KINDS: TokenKind[] = ["signin", "refresh", "authreq", "code", "client"];

describe("S-001 T-003 tokens", () => {
  it("token_roundtrip_each_kind", async () => {
    const t = await Tokens.create(SECRET);
    for (const kind of KINDS) {
      const payload = { v: 1, sub: "staff-123", note: kind };
      const issued = await t.issue(kind, payload);
      expect(await t.open(kind, issued)).toMatchObject(payload);
      for (const other of KINDS.filter((k) => k !== kind)) expect(await t.open(other, issued)).toBeNull();
    }
  });

  it("tampered_token_rejected", async () => {
    const t = await Tokens.create(SECRET);
    for (const kind of KINDS) {
      const issued = await t.issue(kind, { v: 1, sub: "staff-123" });
      expect(await t.open(kind, flip(issued))).toBeNull();
    }
  });

  it("foreign_secret_token_rejected", async () => {
    const ours = await Tokens.create(SECRET);
    const theirs = await Tokens.create(OTHER_SECRET);
    for (const kind of KINDS) {
      expect(await ours.open(kind, await theirs.issue(kind, { v: 1, sub: "staff-123" }))).toBeNull();
    }
  });

  it("unknown_version_rejected", async () => {
    const t = await Tokens.create(SECRET);
    for (const kind of KINDS) {
      expect(await t.open(kind, await t.issue(kind, { v: 2, sub: "staff-123" }))).toBeNull();
    }
  });

  it("previous_secret_verifies_but_never_issues", async () => {
    const before = await Tokens.create(OTHER_SECRET);
    const rotated = await Tokens.create(SECRET, OTHER_SECRET);
    const after = await Tokens.create(SECRET);
    for (const kind of KINDS) {
      expect(await rotated.open(kind, await before.issue(kind, { v: 1, sub: "old" }))).toMatchObject({ sub: "old" });
      const fresh = await rotated.issue(kind, { v: 1, sub: "new" });
      expect(await after.open(kind, fresh)).toMatchObject({ sub: "new" });
      expect(await before.open(kind, fresh)).toBeNull();
    }
  });
});
