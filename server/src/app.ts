import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import fastifyCors from "@fastify/cors";
import fastifySwagger from "@fastify/swagger";
import { Type } from "@sinclair/typebox";
import type { AppConfig } from "./config/env";
import { AppError } from "./common/app-error";
import type { ServerServices } from "./bootstrap";
import { registerAuthRoutes } from "./modules/auth/auth-routes";
import { registerBootstrapRoutes } from "./modules/bootstrap/bootstrap-routes";
import { registerCultivationRoutes } from "./modules/cultivation/cultivation-routes";
import { registerInventoryRoutes } from "./modules/inventory/inventory-routes";
import { registerLoadoutRoutes } from "./modules/loadout/loadout-routes";

export interface ReadinessChecks {
  checkDatabase(): Promise<void>;
  checkRedis(): Promise<void>;
  close?(): Promise<void>;
}

export interface BuildAppOptions {
  config: AppConfig;
  readiness: ReadinessChecks;
  logger?: FastifyServerOptions["logger"];
  services?: ServerServices;
}

const healthResponseSchema = Type.Object({
  requestId: Type.String(),
  serverTime: Type.String({ format: "date-time" }),
  data: Type.Object({
    status: Type.Union([Type.Literal("ok"), Type.Literal("not_ready")]),
    service: Type.Literal("cultivation-diary-server"),
    checks: Type.Optional(
      Type.Object({
        postgres: Type.Boolean(),
        redis: Type.Boolean(),
      }),
    ),
  }),
});

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
  });

  await app.register(fastifyCors, {
    origin(origin, callback) {
      callback(null, isCorsOriginAllowed(origin, options.config));
    },
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Idempotency-Key",
      "If-Player-Version",
    ],
    methods: ["GET", "POST", "OPTIONS"],
  });

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "我的修仙日记 API",
        version: "0.1.0",
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
  });

  app.setErrorHandler((error, request, reply) => {
    const validation = getValidationDetails(error);
    const appError =
      error instanceof AppError
        ? error
        : validation
          ? new AppError(
              "INVALID_REQUEST",
              "请求参数不合法",
              400,
              false,
              { validation },
            )
          : null;
    const statusCode = appError?.statusCode ?? 500;

    if (statusCode >= 500) {
      request.log.error({ err: error }, "Unhandled request error");
    }

    return reply.status(statusCode).send({
      requestId: request.id,
      serverTime: new Date().toISOString(),
      error: {
        code: appError?.code ?? "INTERNAL_ERROR",
        message: appError?.message ?? "服务暂时不可用",
        retryable: appError?.retryable ?? true,
        details: appError?.details ?? {},
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      requestId: request.id,
      serverTime: new Date().toISOString(),
      error: {
        code: "ROUTE_NOT_FOUND",
        message: "接口不存在",
        retryable: false,
        details: {},
      },
    });
  });

  app.get(
    "/health/live",
    {
      schema: {
        response: { 200: healthResponseSchema },
      },
    },
    async (request) => ({
      requestId: request.id,
      serverTime: new Date().toISOString(),
      data: {
        status: "ok" as const,
        service: "cultivation-diary-server" as const,
      },
    }),
  );

  app.get(
    "/health/ready",
    {
      schema: {
        response: {
          200: healthResponseSchema,
          503: healthResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const [postgres, redis] = await Promise.allSettled([
        options.readiness.checkDatabase(),
        options.readiness.checkRedis(),
      ]);
      const checks = {
        postgres: postgres.status === "fulfilled",
        redis: redis.status === "fulfilled",
      };
      const ready = checks.postgres && checks.redis;

      return reply.status(ready ? 200 : 503).send({
        requestId: request.id,
        serverTime: new Date().toISOString(),
        data: {
          status: ready ? ("ok" as const) : ("not_ready" as const),
          service: "cultivation-diary-server" as const,
          checks,
        },
      });
    },
  );

  if (options.readiness.close) {
    app.addHook("onClose", async () => {
      await options.readiness.close?.();
    });
  }

  if (options.services) {
    await registerAuthRoutes(app, {
      config: options.config,
      authService: options.services.authService,
    });
    await registerBootstrapRoutes(app, options.services.authService);
    await registerCultivationRoutes(
      app,
      options.services.authService,
      options.services.cultivationService,
    );
    if (options.services.inventoryService) {
      await registerInventoryRoutes(
        app,
        options.services.authService,
        options.services.inventoryService,
      );
    }
    if (options.services.loadoutService) {
      await registerLoadoutRoutes(
        app,
        options.services.authService,
        options.services.loadoutService,
      );
    }
  }

  if (options.config.nodeEnv !== "production") {
    app.get(
      "/openapi.json",
      { schema: { hide: true } },
      async () => app.swagger(),
    );
  }

  return app;
}

function getValidationDetails(error: unknown): unknown[] | null {
  if (typeof error !== "object" || error === null || !("validation" in error)) {
    return null;
  }

  return Array.isArray(error.validation) ? error.validation : null;
}

function isCorsOriginAllowed(origin: string | undefined, config: AppConfig): boolean {
  if (!origin) {
    return true;
  }
  if (config.corsAllowedOrigins.includes(origin)) {
    return true;
  }
  if (config.nodeEnv === "production") {
    return false;
  }

  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}
