import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { errorEnvelopeSchema, successEnvelopeSchema } from "../../common/http-schema";
import type { AuthServicePort } from "../auth/auth-service";
import { bootstrapSnapshotSchema } from "./bootstrap-schema";

export async function registerBootstrapRoutes(
  app: FastifyInstance,
  authService: AuthServicePort,
): Promise<void> {
  app.get<{ Headers: { authorization?: string } }>(
    "/api/v1/bootstrap",
    {
      schema: {
        tags: ["bootstrap"],
        summary: "获取玩家初始权威快照",
        security: [{ bearerAuth: [] }],
        headers: Type.Object({
          authorization: Type.Optional(Type.String()),
        }),
        response: {
          200: successEnvelopeSchema(bootstrapSnapshotSchema),
          401: errorEnvelopeSchema,
          403: errorEnvelopeSchema,
        },
      },
    },
    async (request) => {
      const result = await authService.bootstrap(request.headers.authorization);
      return {
        requestId: request.id,
        serverTime: new Date().toISOString(),
        playerVersion: result.playerVersion,
        data: result.data,
      };
    },
  );
}
