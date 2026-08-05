import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { errorEnvelopeSchema, successEnvelopeSchema } from "../../common/http-schema";
import type { AuthServicePort } from "../auth/auth-service";
import { bootstrapSnapshotSchema } from "../bootstrap/bootstrap-schema";
import type { ChosenAvatarVariant } from "./player-profile-repository";
import type { PlayerProfileServicePort } from "./player-profile-service";

const mutationHeadersSchema = Type.Object({
  authorization: Type.Optional(Type.String()),
  "idempotency-key": Type.String({ format: "uuid" }),
  "if-player-version": Type.Optional(Type.String({ pattern: "^[0-9]+$" })),
});

const avatarVariantSchema = Type.Union([
  Type.Literal("male"),
  Type.Literal("female"),
]);

const avatarResponseSchema = successEnvelopeSchema(
  Type.Object({
    operationId: Type.String({ format: "uuid" }),
    avatarVariant: avatarVariantSchema,
    bootstrap: bootstrapSnapshotSchema,
  }),
);

const renameResponseSchema = successEnvelopeSchema(
  Type.Object({
    operationId: Type.String({ format: "uuid" }),
    previousDisplayName: Type.String(),
    displayName: Type.String(),
    usedFreeRename: Type.Boolean(),
    renameCardsConsumed: Type.Union([Type.Literal(0), Type.Literal(1)]),
    bootstrap: bootstrapSnapshotSchema,
  }),
);

const errorResponses = {
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

export async function registerPlayerProfileRoutes(
  app: FastifyInstance,
  authService: AuthServicePort,
  playerProfileService: PlayerProfileServicePort,
): Promise<void> {
  app.post<{
    Body: { avatarVariant: ChosenAvatarVariant };
    Headers: MutationHeaders;
  }>(
    "/api/v1/player/avatar",
    {
      schema: {
        tags: ["player"],
        summary: "首次选择主角形象",
        security: [{ bearerAuth: [] }],
        headers: mutationHeadersSchema,
        body: Type.Object(
          { avatarVariant: avatarVariantSchema },
          { additionalProperties: false },
        ),
        response: { 200: avatarResponseSchema, ...errorResponses },
      },
    },
    async (request) => success(
      request.id,
      await playerProfileService.chooseAvatar(
        await authService.authenticate(request.headers.authorization),
        request.headers["idempotency-key"],
        request.body.avatarVariant,
        request.headers["if-player-version"],
      ),
    ),
  );

  app.post<{
    Body: { displayName: string };
    Headers: MutationHeaders;
  }>(
    "/api/v1/player/rename",
    {
      schema: {
        tags: ["player"],
        summary: "使用免费次数或改名卡修改道号",
        security: [{ bearerAuth: [] }],
        headers: mutationHeadersSchema,
        body: Type.Object(
          { displayName: Type.String({ minLength: 1, maxLength: 48 }) },
          { additionalProperties: false },
        ),
        response: { 200: renameResponseSchema, ...errorResponses },
      },
    },
    async (request) => success(
      request.id,
      await playerProfileService.rename(
        await authService.authenticate(request.headers.authorization),
        request.headers["idempotency-key"],
        request.body.displayName,
        request.headers["if-player-version"],
      ),
    ),
  );
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
