import { SIGN_IN_PATH } from "@miramenu/admin-core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { navigate } from "../platform/location";
import { useAdminApi } from "./api-context";
import { SESSION_KEY } from "./query-client";

/** Who is signed in: an actor, null without a session, or still loading. */
export function useSession() {
  const api = useAdminApi();
  return useQuery({ queryKey: SESSION_KEY, queryFn: () => api.session() });
}

/**
 * Closes the session, forgets everything this admin loaded, and goes to signing in.
 * Removing the queries does not refetch them, so nothing asks for the old data again.
 */
export function useSignOut() {
  const api = useAdminApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.signOut(),
    onSuccess: () => {
      client.removeQueries();
      navigate(SIGN_IN_PATH, { replace: true });
    },
  });
}
