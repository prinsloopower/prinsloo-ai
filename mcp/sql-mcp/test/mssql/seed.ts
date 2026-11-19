// npm run db:mssql:seed — starts SQL Server 2022 in Docker and seeds it. Only creating the user
// database and the reader's login runs in master; the user, the schema and the grants run in sqlmcp.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { adminPool, CA, DATABASE, READER, READER_PASSWORD, runBatches } from "./connection.js";

if (!existsSync(CA)) execFileSync(process.execPath, ["scripts/mssql-certs.mjs"], { stdio: "inherit" });
execFileSync("docker", ["compose", "-f", "test/docker-compose.yml", "--profile", "mssql", "up", "-d", "--wait", "mssql"], { stdio: "inherit" });

const master = await adminPool("master");
await master.request().batch(`IF DB_ID('${DATABASE}') IS NULL CREATE DATABASE ${DATABASE};`);
// Contained users, as Azure SQL Database has them, for the EngineEdition = 5 statement's tests.
await master.request().batch(`EXEC sp_configure 'contained database authentication', 1; RECONFIGURE;`);
await master.request().batch(`IF (SELECT containment FROM sys.databases WHERE name = '${DATABASE}') = 0 ALTER DATABASE ${DATABASE} SET CONTAINMENT = PARTIAL;`);
await master.request().batch(`IF SUSER_ID('${READER}') IS NULL CREATE LOGIN ${READER} WITH PASSWORD = '${READER_PASSWORD}', CHECK_POLICY = OFF;`);
await master.close();

const db = await adminPool(DATABASE);
await db.request().batch(`IF USER_ID('${READER}') IS NULL CREATE USER ${READER} FOR LOGIN ${READER};`);
await runBatches(db, readFileSync("test/mssql/schema.sql", "utf8"));
await db.close();
console.log(`seeded ${DATABASE}: sqlmcp_test, and ${READER} with its grants`);
