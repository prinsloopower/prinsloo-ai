/**
 * Builds `bench/sample-db.sql` and `bench/questions.json` against Docker PostgreSQL (`npm run db:up`):
 * tries seeds in order until every tie check holds, then writes the sample and each Question's
 * expected answer from its reference SQL. Run it with `npx tsx bench/build-sample.ts [first seed]`.
 */
import { writeFileSync } from "node:fs";
import pg from "pg";
import { QUESTION_SET } from "./src/question-set.js";
import { type Question, expectedFrom, tieHolds } from "./src/reference.js";
import { sampleSql } from "./src/sample.js";

const ADMIN = process.env.TEST_POSTGRES_URL ?? "postgres://postgres:postgres@localhost:55432/sqlmcp";

const client = new pg.Client({ connectionString: ADMIN });
await client.connect();
const rows = async (sql: string) => (await client.query({ text: sql, rowMode: "array" })).rows as unknown[][];

await client.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sqlmcp_reader') THEN
  CREATE ROLE sqlmcp_reader LOGIN PASSWORD 'sqlmcp_reader_pw'; END IF; END $$;`);

async function close(): Promise<string[]> {
  const failed: string[] = [];
  for (const q of QUESTION_SET.filter((q) => q.tie)) {
    const r = await rows(q.tie!.sql);
    if (r.length === 0 || r.some(([lead, next]) => !tieHolds(Number(lead), Number(next), q.tie!.counts))) failed.push(q.id);
  }
  return failed;
}

let seed = Number(process.argv[2] ?? 1);
for (;; seed++) {
  if (seed > 10_000) throw new Error("no seed up to 10000 gives an answer set with no ties");
  const sql = sampleSql(seed);
  await client.query(sql);
  const failed = await close();
  if (failed.length === 0) {
    writeFileSync("bench/sample-db.sql", sql);
    break;
  }
  console.log(`seed ${seed}: close runner-up in ${failed.join(", ")}`);
}

const questions: Question[] = [];
for (const { values, ...q } of QUESTION_SET) {
  questions.push({ ...q, expected: expectedFrom(q.type, await rows(q.sql), values) });
}
writeFileSync("bench/questions.json", JSON.stringify(questions, null, 2) + "\n");
await client.end();
console.log(`seed ${seed}: wrote bench/sample-db.sql and bench/questions.json`);
