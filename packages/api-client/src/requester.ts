import { ApiError, failureOf } from "./api-error.ts";
import type { HttpRequest, Transport } from "./transport.ts";

/** What checks an answer against its contract: a Zod schema, or anything shaped like one. */
export interface Schema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

/**
 * Sends requests through the transport and turns each answer into its data or an
 * ApiError. Shared by the diner's and the admin's clients; not exported by the package.
 */
export function requester(transport: Transport) {
  /** Sends a request and gives back its status and body, or throws its failure. */
  async function exchange(request: HttpRequest) {
    let response;
    try {
      response = await transport(request);
    } catch {
      throw new ApiError({ kind: "network" });
    }
    let body: string;
    try {
      body = await response.text();
    } catch {
      throw new ApiError({ kind: "network" });
    }
    if (response.status < 200 || response.status >= 300)
      throw new ApiError(
        failureOf(response.status, body, response.header("retry-after")),
      );
    return { response, body };
  }

  /** A call whose answer carries nothing to read (204). */
  async function act(request: HttpRequest): Promise<void> {
    await exchange(request);
  }

  /** A call whose answer is read and checked against its contract. */
  async function call<T>(request: HttpRequest, schema: Schema<T>): Promise<T> {
    const { response, body } = await exchange(request);
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new ApiError({ kind: "unexpected", status: response.status });
    }
    const result = schema.safeParse(parsed);
    if (!result.success)
      throw new ApiError({ kind: "unexpected", status: response.status });
    return result.data;
  }

  return { act, call };
}
