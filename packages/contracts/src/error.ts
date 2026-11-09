import { z } from "zod";

/** Machine-readable error code in UPPER_SNAKE_CASE, stable for clients to branch on. */
export const errorCodeSchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/);

/**
 * Body of every error response of the API (design: "código, mensaje y un id de solicitud").
 * Strict on purpose: anything else, such as a stack trace, is not part of the contract.
 */
export const errorResponseSchema = z.strictObject({
  code: errorCodeSchema,
  message: z.string().min(1),
  requestId: z.string().min(1),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/** Codes for failures that are not specific to a context; contexts declare their own. */
export const GENERIC_ERROR_CODES = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  /** A state-changing admin request from an origin other than the admin app (ADR-0035). */
  ORIGIN_NOT_ALLOWED: "ORIGIN_NOT_ALLOWED",
  NOT_FOUND: "NOT_FOUND",
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  CONFLICT: "CONFLICT",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
} as const;

export type GenericErrorCode =
  (typeof GENERIC_ERROR_CODES)[keyof typeof GENERIC_ERROR_CODES];
