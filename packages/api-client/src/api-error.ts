import { errorResponseSchema } from "@miramenu/contracts";

/**
 * Why a call failed. http: the API answered with its error envelope. network: nothing came
 * back. unexpected: something answered that does not follow the contract (a proxy's error
 * page, a changed schema); its body is never shown to anyone.
 */
export type ApiFailure =
  | {
      kind: "http";
      status: number;
      code: string;
      message: string;
      requestId: string;
    }
  | { kind: "network" }
  | { kind: "unexpected"; status: number };

export class ApiError extends Error {
  readonly failure: ApiFailure;

  constructor(failure: ApiFailure) {
    super(
      failure.kind === "http"
        ? `${failure.status} ${failure.code}`
        : failure.kind === "network"
          ? "network unavailable"
          : `unexpected response ${failure.status}`,
    );
    this.name = "ApiError";
    this.failure = failure;
  }
}

/** The failure of an answered request: its envelope when it has one, unexpected if not. */
export function failureOf(status: number, body: string): ApiFailure {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { kind: "unexpected", status };
  }
  const envelope = errorResponseSchema.safeParse(parsed);
  return envelope.success
    ? { kind: "http", status, ...envelope.data }
    : { kind: "unexpected", status };
}

export const isNotFound = (error: unknown): boolean =>
  error instanceof ApiError &&
  error.failure.kind === "http" &&
  error.failure.status === 404;

/**
 * Worth trying again later: no network, the API or a dependency down (503 such as
 * SERVICE_UNAVAILABLE), or a proxy that answered in its place with a 5xx page.
 */
export function isTemporary(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const { failure } = error;
  if (failure.kind === "network") return true;
  if (failure.kind === "unexpected") return failure.status >= 500;
  return failure.status === 503;
}
