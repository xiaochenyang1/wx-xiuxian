import { Type, type TSchema } from "@sinclair/typebox";

export const errorEnvelopeSchema = Type.Object({
  requestId: Type.String(),
  serverTime: Type.String({ format: "date-time" }),
  error: Type.Object({
    code: Type.String(),
    message: Type.String(),
    retryable: Type.Boolean(),
    details: Type.Record(Type.String(), Type.Unknown()),
  }),
});

export function successEnvelopeSchema<T extends TSchema>(data: T) {
  return Type.Object({
    requestId: Type.String(),
    serverTime: Type.String({ format: "date-time" }),
    playerVersion: Type.String(),
    data,
  });
}
