import { ApiError } from "@miramenu/api-client";
import type { CallFailure } from "@miramenu/admin-core";
import { UploadError } from "../platform/upload";

/** What the flows of admin-core read from a failed call to the API or to storage. */
export function callFailureOf(error: unknown): CallFailure {
  if (error instanceof ApiError || error instanceof UploadError) return error.failure;
  return { kind: "unexpected" };
}
