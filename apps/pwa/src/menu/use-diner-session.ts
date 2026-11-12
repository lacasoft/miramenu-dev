import type { DinerSession } from "@miramenu/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDinerApi } from "../app/api-context";

export const SESSION_KEY = ["diner", "session"] as const;
export const MY_COMMENTS_KEY = ["comments", "mine"] as const;

/**
 * The registered diner, or null. Signing out forgets their own comments here, and their
 * likes go back to being the device's (ADR-0040).
 */
export function useDinerSession() {
  const api = useDinerApi();
  const client = useQueryClient();
  const session = useQuery({
    queryKey: SESSION_KEY,
    queryFn: () => api.session(),
    staleTime: 5 * 60_000,
  });
  const signOut = useMutation({
    mutationFn: () => api.signOut(),
    onSuccess: () => {
      client.setQueryData<DinerSession | null>(SESSION_KEY, null);
      client.removeQueries({ queryKey: MY_COMMENTS_KEY });
      void client.invalidateQueries({ queryKey: ["likes"] });
    },
  });
  return {
    diner: session.data?.diner ?? null,
    signedIn: (diner: DinerSession) => {
      client.setQueryData<DinerSession | null>(SESSION_KEY, diner);
      // The device's likes now belong to the account; the worker moves them shortly.
      void client.invalidateQueries({ queryKey: ["likes"] });
    },
    signOut: () => signOut.mutate(),
  };
}
