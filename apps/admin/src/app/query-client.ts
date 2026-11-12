import { isTemporary, isUnauthorized } from "@miramenu/api-client";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

/** Who is signed in; null once the API says there is no session. */
export const SESSION_KEY = ["admin-session"] as const;

/** Retries only what may work later (no network, a 503); never a 401, a 404 or a 403. */
export const MAX_RETRIES = 2;

/**
 * Any call answered with a 401 means the session ended (60 min idle, 12 h at most,
 * ADR-0035): the session is set to none, and the app goes back to signing in.
 */
export function createQueryClient(): QueryClient {
  const ended = (error: unknown) => {
    if (isUnauthorized(error)) client.setQueryData(SESSION_KEY, null);
  };
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: ended }),
    mutationCache: new MutationCache({ onError: ended }),
    defaultOptions: {
      queries: {
        retry: (failures, error) => isTemporary(error) && failures < MAX_RETRIES,
        // Without network the call fails and the screen says so, instead of waiting.
        networkMode: "always",
      },
    },
  });
  return client;
}
