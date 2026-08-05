import "dotenv/config";
import { buildApp } from "./app";
import { createServerServices } from "./bootstrap";
import { loadAppConfig } from "./config/env";
import { createInfrastructure } from "./infrastructure";

async function main(): Promise<void> {
  const config = loadAppConfig();
  const infrastructure = createInfrastructure(config);
  const services = createServerServices(config, infrastructure.database);
  const app = await buildApp({
    config,
    readiness: infrastructure,
    services,
    logger: {
      level: config.logLevel,
    },
  });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "Shutting down");
    await app.close();
    process.exitCode = 0;
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ host: config.host, port: config.port });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
