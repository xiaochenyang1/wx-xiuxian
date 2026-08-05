import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { errorEnvelopeSchema, successEnvelopeSchema } from "../../common/http-schema";
import type { AppConfig } from "../../config/env";
import { bootstrapSnapshotSchema } from "../bootstrap/bootstrap-schema";
import {
  type AuthServicePort,
  type DevLoginInput,
  type RefreshInput,
  type WechatLoginInput,
} from "./auth-service";

const idempotencyHeadersSchema = Type.Object({
  "idempotency-key": Type.String({ format: "uuid" }),
});

const authTokensSchema = Type.Object({
  accessToken: Type.String(),
  accessTokenExpiresAt: Type.String({ format: "date-time" }),
  refreshToken: Type.String(),
  refreshTokenExpiresAt: Type.String({ format: "date-time" }),
});

const loginResponseSchema = successEnvelopeSchema(
  Type.Object({
    isNewPlayer: Type.Boolean(),
    tokens: authTokensSchema,
    bootstrap: bootstrapSnapshotSchema,
  }),
);

const refreshResponseSchema = successEnvelopeSchema(
  Type.Object({
    tokens: authTokensSchema,
    bootstrap: bootstrapSnapshotSchema,
  }),
);

const mutationErrorResponses = {
  400: errorEnvelopeSchema,
  401: errorEnvelopeSchema,
  403: errorEnvelopeSchema,
  404: errorEnvelopeSchema,
  409: errorEnvelopeSchema,
  503: errorEnvelopeSchema,
};

export interface AuthRouteDependencies {
  config: AppConfig;
  authService: AuthServicePort;
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  dependencies: AuthRouteDependencies,
): Promise<void> {
  if (dependencies.config.enableDevAuth) {
    app.post<{
      Body: DevLoginInput;
      Headers: { "idempotency-key": string };
    }>(
      "/api/v1/auth/dev",
      {
        schema: {
          tags: ["auth"],
          summary: "本地开发模拟登录",
          headers: idempotencyHeadersSchema,
          body: Type.Object({
            accountId: Type.String({ minLength: 1, maxLength: 64 }),
            deviceKey: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
          }),
          response: { 200: loginResponseSchema, ...mutationErrorResponses },
        },
      },
      async (request) => {
        const result = await dependencies.authService.loginDev(
          request.body,
          request.headers["idempotency-key"],
        );
        return success(request.id, result.playerVersion, result.data);
      },
    );
  }

  app.post<{
    Body: WechatLoginInput;
    Headers: { "idempotency-key": string };
  }>(
    "/api/v1/auth/wechat",
    {
      schema: {
        tags: ["auth"],
        summary: "微信小游戏登录",
        headers: idempotencyHeadersSchema,
        body: Type.Object({
          code: Type.String({ minLength: 1, maxLength: 256 }),
          deviceKey: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
        }),
        response: { 200: loginResponseSchema, ...mutationErrorResponses },
      },
    },
    async (request) => {
      const result = await dependencies.authService.loginWechat(
        request.body,
        request.headers["idempotency-key"],
      );
      return success(request.id, result.playerVersion, result.data);
    },
  );

  app.post<{
    Body: RefreshInput;
    Headers: { "idempotency-key": string };
  }>(
    "/api/v1/auth/refresh",
    {
      schema: {
        tags: ["auth"],
        summary: "轮换登录会话",
        headers: idempotencyHeadersSchema,
        body: Type.Object({
          refreshToken: Type.String({ minLength: 1, maxLength: 256 }),
        }),
        response: { 200: refreshResponseSchema, ...mutationErrorResponses },
      },
    },
    async (request) => {
      const result = await dependencies.authService.refresh(
        request.body,
        request.headers["idempotency-key"],
      );
      return success(request.id, result.playerVersion, result.data);
    },
  );
}

function success<T>(requestId: string, playerVersion: string, data: T) {
  return {
    requestId,
    serverTime: new Date().toISOString(),
    playerVersion,
    data,
  };
}
