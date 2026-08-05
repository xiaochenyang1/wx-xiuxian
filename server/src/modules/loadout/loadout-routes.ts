import { Type } from "@sinclair/typebox";
import type { EquippedEquipmentSlot } from "@cultivation-diary/shared";
import type { FastifyInstance } from "fastify";
import { errorEnvelopeSchema, successEnvelopeSchema } from "../../common/http-schema";
import type { AuthServicePort } from "../auth/auth-service";
import { bootstrapSnapshotSchema } from "../bootstrap/bootstrap-schema";
import type { LoadoutServicePort } from "./loadout-service";

const mutationHeadersSchema = Type.Object({
  authorization: Type.Optional(Type.String()),
  "idempotency-key": Type.String({ format: "uuid" }),
  "if-player-version": Type.Optional(Type.String({ pattern: "^[0-9]+$" })),
});

const equippedEquipmentSlotSchema = Type.Union([
  Type.Literal("weapon"),
  Type.Literal("armor"),
  Type.Literal("accessory_left"),
  Type.Literal("accessory_right"),
  Type.Literal("mount"),
  Type.Literal("pet"),
]);

const responseSchema = successEnvelopeSchema(
  Type.Object({
    operationId: Type.String({ format: "uuid" }),
    assetType: Type.Union([Type.Literal("technique"), Type.Literal("equipment")]),
    action: Type.Union([Type.Literal("equip"), Type.Literal("unequip")]),
    assetId: Type.String(),
    equippedSlot: Type.String(),
    replacedAssetId: Type.Union([Type.String(), Type.Null()]),
    previousTotalPower: Type.String(),
    totalPower: Type.String(),
    powerDelta: Type.String(),
    bootstrap: bootstrapSnapshotSchema,
  }),
);

const errorResponses = {
  400: errorEnvelopeSchema,
  401: errorEnvelopeSchema,
  403: errorEnvelopeSchema,
  404: errorEnvelopeSchema,
  409: errorEnvelopeSchema,
};

interface MutationHeaders {
  authorization?: string;
  "idempotency-key": string;
  "if-player-version"?: string;
}

export async function registerLoadoutRoutes(
  app: FastifyInstance,
  authService: AuthServicePort,
  loadoutService: LoadoutServicePort,
): Promise<void> {
  app.post<{
    Body: { techniqueConfigId: string };
    Headers: MutationHeaders;
  }>(
    "/api/v1/techniques/equip",
    routeOptions(
      "功法",
      "装备或替换已收录功法",
      Type.Object(
        { techniqueConfigId: Type.String({ minLength: 1, maxLength: 64 }) },
        { additionalProperties: false },
      ),
    ),
    async (request) => success(
      request.id,
      await loadoutService.equipTechnique(
        await authService.authenticate(request.headers.authorization),
        request.headers["idempotency-key"],
        request.body.techniqueConfigId,
        request.headers["if-player-version"],
      ),
    ),
  );

  app.post<{
    Body: { techniqueConfigId: string };
    Headers: MutationHeaders;
  }>(
    "/api/v1/techniques/unequip",
    routeOptions(
      "功法",
      "卸下已装备功法",
      Type.Object(
        { techniqueConfigId: Type.String({ minLength: 1, maxLength: 64 }) },
        { additionalProperties: false },
      ),
    ),
    async (request) => success(
      request.id,
      await loadoutService.unequipTechnique(
        await authService.authenticate(request.headers.authorization),
        request.headers["idempotency-key"],
        request.body.techniqueConfigId,
        request.headers["if-player-version"],
      ),
    ),
  );

  app.post<{
    Body: { equipmentInstanceId: string; equippedSlot: EquippedEquipmentSlot };
    Headers: MutationHeaders;
  }>(
    "/api/v1/equipment/equip",
    routeOptions(
      "法宝",
      "装备或替换行囊中的法宝",
      Type.Object(
        {
          equipmentInstanceId: Type.String({ format: "uuid" }),
          equippedSlot: equippedEquipmentSlotSchema,
        },
        { additionalProperties: false },
      ),
    ),
    async (request) => success(
      request.id,
      await loadoutService.equipEquipment(
        await authService.authenticate(request.headers.authorization),
        request.headers["idempotency-key"],
        request.body.equipmentInstanceId,
        request.body.equippedSlot,
        request.headers["if-player-version"],
      ),
    ),
  );

  app.post<{
    Body: { equipmentInstanceId: string };
    Headers: MutationHeaders;
  }>(
    "/api/v1/equipment/unequip",
    routeOptions(
      "法宝",
      "卸下已装备法宝",
      Type.Object(
        { equipmentInstanceId: Type.String({ format: "uuid" }) },
        { additionalProperties: false },
      ),
    ),
    async (request) => success(
      request.id,
      await loadoutService.unequipEquipment(
        await authService.authenticate(request.headers.authorization),
        request.headers["idempotency-key"],
        request.body.equipmentInstanceId,
        request.headers["if-player-version"],
      ),
    ),
  );
}

function routeOptions(tag: string, summary: string, body: ReturnType<typeof Type.Object>) {
  return {
    schema: {
      tags: [tag],
      summary,
      security: [{ bearerAuth: [] }],
      headers: mutationHeadersSchema,
      body,
      response: { 200: responseSchema, ...errorResponses },
    },
  };
}

function success(
  requestId: string,
  result: { playerVersion: string; data: unknown },
) {
  return {
    requestId,
    serverTime: new Date().toISOString(),
    playerVersion: result.playerVersion,
    data: result.data,
  };
}
