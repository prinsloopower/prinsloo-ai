// Sign-in smoke test for a deployed Deployment (S-001): node scripts/smoke-signin.mjs https://<host>
// Drives Sign-in as far as a script can without a person: registration, /authorize, and the
// Identity provider's own authorize page, which checks the client ID, tenant and redirect URI.
// Exits non-zero if any check fails.
import { createHash, randomBytes } from "node:crypto";

const base = (process.argv[2] ?? process.env.SMOKE_URL ?? "").replace(/\/$/, "");
if (!base) {
  console.error("usage: node scripts/smoke-signin.mjs https://<deployment-host>");
  process.exit(2);
}

const checks = [];
const check = (name, ok, detail) => {
  checks.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (${detail})`}`);
};
const b64url = (buf) => buf.toString("base64url");

const prm = await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json().catch(() => ({}));
check("Sign-in is configured: the resource names this origin as its authorization server",
  JSON.stringify(prm.authorization_servers) === JSON.stringify([base]), JSON.stringify(prm));

const redirect = "https://smoke.invalid/callback";
const reg = await fetch(`${base}/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ redirect_uris: [redirect], client_name: "smoke-signin" }),
});
const regBody = await reg.json().catch(() => ({}));
check("an AI tool can register", reg.status === 201 && typeof regBody.client_id === "string", `status ${reg.status}`);

const verifier = b64url(randomBytes(32));
const challenge = b64url(createHash("sha256").update(verifier).digest());
const q = new URLSearchParams({
  response_type: "code",
  client_id: regBody.client_id ?? "",
  redirect_uri: redirect,
  code_challenge: challenge,
  code_challenge_method: "S256",
  resource: `${base}/mcp`,
  state: "smoke",
});
const auth = await fetch(`${base}/authorize?${q}`, { redirect: "manual" });
const to = auth.headers.get("location") ? new URL(auth.headers.get("location")) : null;
check("/authorize sends the browser to the Identity provider with PKCE and a state",
  auth.status === 302 && to !== null && to.origin !== new URL(base).origin
    && to.searchParams.get("redirect_uri") === `${base}/oauth/callback`
    && to.searchParams.get("code_challenge_method") === "S256" && !!to.searchParams.get("state"),
  `status ${auth.status}, location ${to?.origin}${to?.pathname}`);
check("/authorize sets the sign-in cookie",
  /^__Host-sqlmcp-auth=[^;]+;.*HttpOnly.*Secure/i.test(auth.headers.get("set-cookie") ?? ""),
  auth.headers.get("set-cookie") ?? "none");

if (to) {
  // Entra ID reports a bad client ID, tenant or unregistered redirect URI as an AADSTS error.
  const idp = await fetch(to.href, { redirect: "manual" });
  const page = await idp.text().catch(() => "");
  const aadsts = page.match(/AADSTS\d+/)?.[0];
  check("the Identity provider accepts the Server's client ID and redirect URI",
    idp.status < 400 && !aadsts, `status ${idp.status}${aadsts ? `, ${aadsts}` : ""}`);
}

const cb = await fetch(`${base}/oauth/callback?state=forged&code=x`);
check("/oauth/callback refuses a forged state", cb.status === 400, `status ${cb.status}`);

const mcp = await fetch(`${base}/mcp`, {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: "Bearer forged" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
});
check("/mcp refuses a forged Sign-in as an invalid token",
  mcp.status === 401 && (mcp.headers.get("www-authenticate") ?? "").includes('error="invalid_token"'),
  `status ${mcp.status}, ${mcp.headers.get("www-authenticate")}`);

// exitCode rather than process.exit(): exiting while fetch sockets close trips a libuv assertion on Windows.
process.exitCode = checks.every(Boolean) ? 0 : 1;
