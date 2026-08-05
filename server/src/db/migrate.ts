import "dotenv/config";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { loadAppConfig } from "../config/env";

async function run(): Promise<void> {
  const config = loadAppConfig();
  const pool = new Pool({ connectionString: config.databaseUrl });
  const database = drizzle(pool);

  try {
    await migrate(database, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  } finally {
    await pool.end();
  }
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
