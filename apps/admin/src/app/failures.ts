import { ApiError } from "@miramenu/api-client";
import type { CallFailure } from "@miramenu/admin-core";

/** What the flows of admin-core read from a failed call. */
export const callFailureOf = (error: unknown): CallFailure =>
  error instanceof ApiError ? error.failure : { kind: "unexpected" };
