import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { errorEnvelopeSchema, successEnvelopeSchema } from "../../common/http-schema";
import type { AuthServicePort } from "../auth/auth-service";
import {
  bootstrapSnapshotSchema,
  dropRewardSummarySchema,
  offlineSettlementSummarySchema,
} from "../bootstrap/bootstrap-schema";
import type { CultivationServicePort } from "./cultivation-service";

const mutationHeadersSchema = Type.Object({
  authorization: Type.Optional(Type.String()),
  "idempotency-key": Type.String({ format: "uuid" }),
  "if-player-version": Type.Optional(Type.String({ pattern: "^[0-9]+$" })),
});

const progressionEventSchema = Type.Union([
  Type.Object({
    type: Type.Literal("level_up"),
    fromLevel: Type.Integer(),
    toLevel: Type.Integer(),
  }),
  Type.Object({
    type: Type.Literal("breakthrough_ready"),
    level: Type.Integer(),
  }),
  Type.Object({
    type: Type.Literal("version_cap_reached"),
    level: Type.Integer(),
  }),
]);

const settleResponseSchema = successEnvelopeSchema(
  Type.Object({
    settlement: Type.Object({
      settlementId: Type.String({ format: "uuid" }),
      mode: Type.Union([Type.Literal("online"), Type.Literal("offline")]),
      efficiencyBp: Type.Integer({ minimum: 0 }),
      elapsedMilliseconds: Type.Integer({ minimum: 0 }),
      experienceGained: Type.String(),
      experienceDiscarded: Type.String(),
      spiritStoneGained: Type.String(),
      dropAttempts: Type.Integer({ minimum: 0 }),
      drops: dropRewardSummarySchema,
      events: Type.Array(progressionEventSchema),
      newcomerRewardGranted: Type.Boolean(),
      offlineSettlement: Type.Union([
        offlineSettlementSummarySchema,
        Type.Null(),
      ]),
    }),
    bootstrap: bootstrapSnapshotSchema,
  }),
);

const breakthroughResponseSchema = successEnvelopeSchema(
  Type.Object({
    breakthroughId: Type.String({ format: "uuid" }),
    fromLevel: Type.Integer(),
    toLevel: Type.Integer(),
    consumedPills: Type.Integer({ minimum: 1 }),
    bootstrap: bootstrapSnapshotSchema,
  }),
);

const mutationErrorResponses = {
  400: errorEnvelopeSchema,
  401: errorEnvelopeSchema,
  403: errorEnvelopeSchema,
  409: errorEnvelopeSchema,
};

interface MutationHeaders {
  authorization?: string;
  "idempotency-key": string;
  "if-player-version"?: string;
}

export async function registerCultivationRoutes(
  app: FastifyInstance,
  authService: AuthServicePort,
  cultivationService: CultivationServicePort,
): Promise<void> {
  app.post<{ Body: Record<string, never>; Headers: MutationHeaders }>(
    "/api/v1/sync/heartbeat",
    {
      schema: {
        tags: ["sync"],
        summary: "同步服务器时间并结算修炼进度",
        security: [{ bearerAuth: [] }],
        headers: mutationHeadersSchema,
        body: Type.Object({}, { additionalProperties: false }),
        response: { 200: settleResponseSchema, ...mutationErrorResponses },
      },
    },
    async (request) => {
      const identity = await authService.authenticate(request.headers.authorization);
      const result = await cultivationService.heartbeat(
        identity,
        request.headers["idempotency-key"],
        request.headers["if-player-version"],
      );
      return success(request.id, result.playerVersion, result.data);
    },
  );

  app.post<{ Body: Record<string, never>; Headers: MutationHeaders }>(
    "/api/v1/cultivation/settle",
    {
      schema: {
        tags: ["cultivation"],
        summary: "结算在线或离线修炼进度",
        security: [{ bearerAuth: [] }],
        headers: mutationHeadersSchema,
        body: Type.Object({}, { additionalProperties: false }),
        response: { 200: settleResponseSchema, ...mutationErrorResponses },
      },
    },
    async (request) => {
      const identity = await authService.authenticate(request.headers.authorization);
      const result = await cultivationService.settle(
        identity,
        request.headers["idempotency-key"],
        request.headers["if-player-version"],
      );
      return success(request.id, result.playerVersion, result.data);
    },
  );

  app.post<{ Body: Record<string, never>; Headers: MutationHeaders }>(
    "/api/v1/cultivation/breakthrough",
    {
      schema: {
        tags: ["cultivation"],
        summary: "消耗突破丹完成境界突破",
        security: [{ bearerAuth: [] }],
        headers: mutationHeadersSchema,
        body: Type.Object({}, { additionalProperties: false }),
        response: { 200: breakthroughResponseSchema, ...mutationErrorResponses },
      },
    },
    async (request) => {
      const identity = await authService.authenticate(request.headers.authorization);
      const result = await cultivationService.breakthrough(
        identity,
        request.headers["idempotency-key"],
        request.headers["if-player-version"],
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
