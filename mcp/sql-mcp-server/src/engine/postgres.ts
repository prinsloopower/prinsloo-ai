import pg from "pg";

/** Health-check Server statement (R-004 permits it); opens and closes one connection. */
export async function pingPostgres(connectionString: string): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    await client.end();
  }
}
