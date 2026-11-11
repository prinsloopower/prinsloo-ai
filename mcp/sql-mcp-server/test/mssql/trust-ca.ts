import { existsSync, readFileSync } from "node:fs";
import tls from "node:tls";

// Each test process trusts Docker's test CA alongside Node's own, as NODE_EXTRA_CA_CERTS makes the
// image do. Node reads that variable only at start-up, so tests add the CA to the default store
// instead; the tests that prove the variable itself run in a fresh process (pool.int.test.ts).
const CA = "test/mssql/certs/ca.crt";
if (existsSync(CA)) tls.setDefaultCACertificates([...tls.getCACertificates("default"), readFileSync(CA, "utf8")]);
