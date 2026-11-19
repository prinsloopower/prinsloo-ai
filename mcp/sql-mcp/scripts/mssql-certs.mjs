// Makes a test CA and a server certificate for SQL Server in Docker: node scripts/mssql-certs.mjs
// Writes test/mssql/certs/, which git ignores and the export refuses. The CA's key never leaves this machine.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = join("test", "mssql", "certs");
const force = process.argv.includes("--force");
if (existsSync(join(dir, "ca.crt")) && !force) {
  console.log(`${dir} already holds a test CA; pass --force to make a new one`);
  process.exit(0);
}
mkdirSync(dir, { recursive: true });
// Its own minimal config, so a machine's OPENSSL_CONF cannot change or break what is made.
writeFileSync(join(dir, "openssl.cnf"), "[req]\ndistinguished_name = dn\n[dn]\n");
const env = { ...process.env, OPENSSL_CONF: "openssl.cnf" };
const openssl = (...args) => execFileSync("openssl", args, { cwd: dir, env, stdio: ["ignore", "ignore", "inherit"] });

openssl("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "825", "-subj", "/CN=sql-mcp test CA", "-keyout", "ca.key", "-out", "ca.crt");
writeFileSync(
  join(dir, "server.ext"),
  "basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,DNS:host.docker.internal\n",
);
openssl("req", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=localhost", "-keyout", "server.key", "-out", "server.csr");
openssl("x509", "-req", "-in", "server.csr", "-CA", "ca.crt", "-CAkey", "ca.key", "-CAcreateserial", "-days", "825", "-extfile", "server.ext", "-out", "server.crt");
// A second CA that never signed anything, for the test that a certificate from the wrong CA is refused.
openssl("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "825", "-subj", "/CN=sql-mcp other CA", "-keyout", "other-ca.key", "-out", "other-ca.crt");
console.log(`wrote ${dir}: ca.crt, server.crt, server.key, other-ca.crt`);
