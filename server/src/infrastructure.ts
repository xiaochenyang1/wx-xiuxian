import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import Redis from "ioredis";
import { Pool } from "pg";
import type { AppConfig } from "./config/env";
import * as schema from "./db/schema";

export type GameDatabase = NodePgDatabase<typeof schema>;

export interface Infrastructure {
  pool: Pool;
  database: GameDatabase;
  redis: Redis;
  checkDatabase(): Promise<void>;
  checkRedis(): Promise<void>;
  close(): Promise<void>;
}

export function createInfrastructure(config: AppConfig): Infrastructure {
  const pool = new Pool({ connectionString: config.databaseUrl });
  const database = drizzle(pool, { schema });
  const redis = new Redis(config.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  // Readiness owns dependency status; listeners prevent driver fallback logging and process crashes.
  pool.on("error", () => undefined);
  redis.on("error", () => undefined);

  return {
    pool,
    database,
    redis,
    async checkDatabase(): Promise<void> {
      await pool.query("select 1");
    },
    async checkRedis(): Promise<void> {
      if (redis.status === "wait") {
        await redis.connect();
      }
      await redis.ping();
    },
    async close(): Promise<void> {
      const closeRedis =
        redis.status === "ready"
          ? redis.quit()
          : Promise.resolve(redis.disconnect());
      await Promise.allSettled([pool.end(), closeRedis]);
    },
  };
}
