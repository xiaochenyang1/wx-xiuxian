import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { DebugGrantTarget } from "@cultivation-diary/shared";
import { errorEnvelopeSchema, successEnvelopeSchema } from "../../common/http-schema";
import type { AppConfig } from "../../config/env";
import type { AuthServicePort } from "../auth/auth-service";
import { bootstrapSnapshotSchema } from "../bootstrap/bootstrap-schema";
import type { InventoryServicePort } from "./inventory-service";

const mutationHeadersSchema = Type.Object({
  authorization: Type.Optional(Type.String()),
  "idempotency-key": Type.String({ format: "uuid" }),
  "if-player-version": Type.Optional(Type.String({ pattern: "^[0-9]+$" })),
});

const debugMutationHeadersSchema = Type.Object({
  authorization: Type.Optional(Type.String()),
  "idempotency-key": Type.String({ format: "uuid" }),
  "if-player-version": Type.String({ pattern: "^[0-9]+$" }),
});

const entryIdsSchema = Type.Array(Type.String({ format: "uuid" }), {
  minItems: 1,
  maxItems: 100,
  uniqueItems: true,
});

const expandResponseSchema = successEnvelopeSchema(
  Type.Object({
    operationId: Type.String({ format: "uuid" }),
    expandedBy: Type.Integer({ minimum: 1 }),
    cost: Type.String(),
    nextCost: Type.Union([Type.String(), Type.Null()]),
    bootstrap: bootstrapSnapshotSchema,
  }),
);

const progressionEventSchema = Type.Union([
  Type.Object({
    type: Type.Literal("level_up"),
    fromLevel: Type.Integer({ minimum: 1 }),
    toLevel: Type.Integer({ minimum: 1 }),
  }),
  Type.Object({
    type: Type.Literal("breakthrough_ready"),
    level: Type.Integer({ minimum: 1 }),
  }),
  Type.Object({
    type: Type.Literal("version_cap_reached"),
    level: Type.Integer({ minimum: 1 }),
  }),
]);

const useResponseSchema = successEnvelopeSchema(
  Type.Object({
    operationId: Type.String({ format: "uuid" }),
    itemConfigId: Type.String(),
    consumedQuantity: Type.Integer({ minimum: 1 }),
    remainingQuantity: Type.String(),
    effectType: Type.Literal("simulated_online_experience"),
    experienceGained: Type.String(),
    experienceDiscarded: Type.String(),
    fromLevel: Type.Integer({ minimum: 1 }),
    toLevel: Type.Integer({ minimum: 1 }),
    reachedBreakthrough: Type.Boolean(),
    newcomerRewardGranted: Type.Boolean(),
    events: Type.Array(progressionEventSchema),
    bootstrap: bootstrapSnapshotSchema,
  }),
);

const debugGrantTargetSchema = Type.Union([
  Type.Literal("fill_experience"),
  Type.Literal("spirit_stone"),
  Type.Literal("breakthrough_pill"),
]);

const debugGrantResponseSchema = successEnvelopeSchema(
  Type.Object({
    operationId: Type.String({ format: "uuid" }),
    target: debugGrantTargetSchema,
    grantedAmount: Type.String(),
    balanceAfter: Type.String(),
    fromLevel: Type.Integer({ minimum: 1 }),
    toLevel: Type.Integer({ minimum: 1 }),
    reachedBreakthrough: Type.Boolean(),
    newcomerRewardGranted: Type.Boolean(),
    events: Type.Array(progressionEventSchema),
    bootstrap: bootstrapSnapshotSchema,
  }),
);

const transferResponseSchema = successEnvelopeSchema(
  Type.Object({
    operationId: Type.String({ format: "uuid" }),
    transferredEquipment: Type.Integer({ minimum: 0 }),
    collectedTechniques: Type.Integer({ minimum: 0 }),
    techniqueDuplicates: Type.Integer({ minimum: 0 }),
    bootstrap: bootstrapSnapshotSchema,
  }),
);

const salvageResponseSchema = successEnvelopeSchema(
  Type.Object({
    operationId: Type.String({ format: "uuid" }),
    salvagedCount: Type.Integer({ minimum: 1 }),
    spiritStoneGained: Type.String(),
    enhanceStoneGained: Type.String(),
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

interface DebugMutationHeaders extends MutationHeaders {
  "if-player-version": string;
}

interface UseBody {
  itemConfigId: string;
  quantity: number;
}

interface DebugGrantBody {
  target: DebugGrantTarget;
}

interface HarvestBody {
  entryIds: string[];
}

interface SalvageBody extends HarvestBody {
  confirmHighQuality?: boolean;
}

export async function registerInventoryRoutes(
  app: FastifyInstance,
  authService: AuthServicePort,
  inventoryService: InventoryServicePort,
  config: Pick<AppConfig, "enableDevAuth">,
): Promise<void> {
  if (config.enableDevAuth) {
    app.post<{ Body: DebugGrantBody; Headers: DebugMutationHeaders }>(
      "/api/v1/debug/inventory/grant",
      {
        schema: {
          tags: ["debug"],
          summary: "开发环境注入修为或基础资源",
          security: [{ bearerAuth: [] }],
          headers: debugMutationHeadersSchema,
          body: Type.Object(
            { target: debugGrantTargetSchema },
            { additionalProperties: false },
          ),
          response: { 200: debugGrantResponseSchema, ...mutationErrorResponses },
        },
      },
      async (request) => {
        const identity = await authService.authenticate(request.headers.authorization);
        const result = await inventoryService.debugGrant(
          identity,
          request.headers["idempotency-key"],
          request.body.target,
          request.headers["if-player-version"],
        );
        return success(request.id, result.playerVersion, result.data);
      },
    );
  }

  app.post<{ Body: UseBody; Headers: MutationHeaders }>(
    "/api/v1/inventory/use",
    {
      schema: {
        tags: ["inventory"],
        summary: "使用服务端配置允许的堆叠消耗品",
        security: [{ bearerAuth: [] }],
        headers: mutationHeadersSchema,
        body: Type.Object(
          {
            itemConfigId: Type.String({
              minLength: 1,
              maxLength: 64,
              pattern: "^[a-z0-9_]+$",
            }),
            quantity: Type.Integer({ minimum: 1, maximum: 99 }),
          },
          { additionalProperties: false },
        ),
        response: { 200: useResponseSchema, ...mutationErrorResponses },
      },
    },
    async (request) => {
      const identity = await authService.authenticate(request.headers.authorization);
      const result = await inventoryService.useItem(
        identity,
        request.headers["idempotency-key"],
        request.body.itemConfigId,
        request.body.quantity,
        request.headers["if-player-version"],
      );
      return success(request.id, result.playerVersion, result.data);
    },
  );

  app.post<{ Body: Record<string, never>; Headers: MutationHeaders }>(
    "/api/v1/inventory/expand",
    {
      schema: {
        tags: ["inventory"],
        summary: "消耗灵石扩展十格行囊",
        security: [{ bearerAuth: [] }],
        headers: mutationHeadersSchema,
        body: Type.Object({}, { additionalProperties: false }),
        response: { 200: expandResponseSchema, ...mutationErrorResponses },
      },
    },
    async (request) => {
      const identity = await authService.authenticate(request.headers.authorization);
      const result = await inventoryService.expandBag(
        identity,
        request.headers["idempotency-key"],
        request.headers["if-player-version"],
      );
      return success(request.id, result.playerVersion, result.data);
    },
  );

  app.post<{ Body: HarvestBody; Headers: MutationHeaders }>(
    "/api/v1/harvest/transfer",
    {
      schema: {
        tags: ["inventory"],
        summary: "将挂机收获移入行囊或功法库",
        security: [{ bearerAuth: [] }],
        headers: mutationHeadersSchema,
        body: Type.Object(
          { entryIds: entryIdsSchema },
          { additionalProperties: false },
        ),
        response: { 200: transferResponseSchema, ...mutationErrorResponses },
      },
    },
    async (request) => {
      const identity = await authService.authenticate(request.headers.authorization);
      const result = await inventoryService.transferHarvest(
        identity,
        request.headers["idempotency-key"],
        request.body.entryIds,
        request.headers["if-player-version"],
      );
      return success(request.id, result.playerVersion, result.data);
    },
  );

  app.post<{ Body: SalvageBody; Headers: MutationHeaders }>(
    "/api/v1/harvest/salvage",
    {
      schema: {
        tags: ["inventory"],
        summary: "分解挂机收获并获得材料",
        security: [{ bearerAuth: [] }],
        headers: mutationHeadersSchema,
        body: Type.Object(
          {
            entryIds: entryIdsSchema,
            confirmHighQuality: Type.Optional(Type.Boolean()),
          },
          { additionalProperties: false },
        ),
        response: { 200: salvageResponseSchema, ...mutationErrorResponses },
      },
    },
    async (request) => {
      const identity = await authService.authenticate(request.headers.authorization);
      const result = await inventoryService.salvageHarvest(
        identity,
        request.headers["idempotency-key"],
        request.body.entryIds,
        request.body.confirmHighQuality ?? false,
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
