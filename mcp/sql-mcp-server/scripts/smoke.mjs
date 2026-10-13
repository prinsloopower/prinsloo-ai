// Smoke test for a deployed Deployment: node scripts/smoke.mjs https://<host>
// Exits non-zero on the first failed check.
const base = (process.argv[2] ?? process.env.SMOKE_URL ?? "").replace(/\/$/, "");
if (!base) {
  console.error("usage: node scripts/smoke.mjs https://<deployment-host>");
  process.exit(2);
}

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (${detail})`}`);
};

const health = await fetch(`${base}/healthz`);
const healthBody = await health.json().catch(() => ({}));
check("healthz reaches the Database", health.status === 200 && healthBody.database === "ok",
  `status ${health.status}, body ${JSON.stringify(healthBody)}`);

const mcp = await fetch(`${base}/mcp`, {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
});
const mcpBody = await mcp.json().catch(() => ({}));
check("unauthenticated MCP call is blocked", mcp.status === 401, `status ${mcp.status}`);
check("block says the connection is not authenticated",
  /not been authenticated/.test(mcpBody?.error?.message ?? ""), JSON.stringify(mcpBody));
const challenge = mcp.headers.get("www-authenticate") ?? "";
check("block points at protected-resource metadata",
  challenge.includes(`resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`), challenge);

const prm = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`);
const prmBody = await prm.json().catch(() => ({}));
check("protected-resource metadata names this resource", prmBody.resource === `${base}/mcp`,
  JSON.stringify(prmBody));

process.exit(checks.every((c) => c.ok) ? 0 : 1);
