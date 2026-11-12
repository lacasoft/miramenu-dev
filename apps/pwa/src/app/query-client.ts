import { isTemporary } from "@miramenu/api-client";
import { QueryClient } from "@tanstack/react-query";

/** Retries only what may work later (no network, a 503); never a 404 or a broken answer. */
export const MAX_RETRIES = 2;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failures, error) =>
          isTemporary(error) && failures < MAX_RETRIES,
        staleTime: 60_000,
        // Ask even when the browser says it is offline: the transport answers with the
        // last copy of the menu (withLastCopy) or fails, and the screens show either.
        networkMode: "always",
      },
    },
  });
}
