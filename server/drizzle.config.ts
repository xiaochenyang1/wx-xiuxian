import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://cultivation:cultivation_dev@127.0.0.1:5432/cultivation_diary",
  },
  strict: true,
  verbose: true,
});
