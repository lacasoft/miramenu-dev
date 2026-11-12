import type { MyLikes } from "@miramenu/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState } from "react";
import { useDinerApi } from "../app/api-context";

/** How long the "could not save" message stays before it goes by itself. */
const FAILURE_NOTICE_MS = 4000;

export interface Likes {
  isLiked: (dishId: string) => boolean;
  /** Approved comments of the dish, for its counter. */
  commentsOf: (dishId: string) => number;
  toggle: (dishId: string) => void;
  /** The last like could not be saved and was undone (design-system §14). */
  failed: boolean;
}

const withLike = (
  likes: MyLikes | undefined,
  dishId: string,
  active: boolean,
): MyLikes => {
  const others = (likes?.dishIds ?? []).filter((id) => id !== dishId);
  return { dishIds: active ? [...others, dishId] : others };
};

/**
 * The diner's likes in a branch and everyone's counts. A like shows at once (RNF-02) and
 * is undone, with a word, if the API refuses it. The likes of one dish go out one after
 * another, so the last touch always wins. Counts refresh when the diner comes back to the
 * page, within RNF-04's 30 s.
 */
export function useLikes(branchId: string): Likes {
  const api = useDinerApi();
  const client = useQueryClient();
  const mineKey = ["likes", branchId] as const;
  const countsKey = ["interactions", branchId] as const;
  const mine = useQuery({
    queryKey: mineKey,
    queryFn: () => api.myLikes(branchId),
  });
  const counts = useQuery({
    queryKey: countsKey,
    queryFn: () => api.interactions(branchId),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!failed) return undefined;
    const handle = window.setTimeout(() => setFailed(false), FAILURE_NOTICE_MS);
    return () => window.clearTimeout(handle);
  }, [failed]);

  const like = useMutation({
    mutationFn: ({
      dishId,
      active,
    }: {
      dishId: string;
      active: boolean;
      /** The diner's likes had not loaded: their first read was dropped for this one. */
      resync: boolean;
    }) => api.like(branchId, dishId, active),
    onSuccess: (_state, { resync }) => {
      if (resync) void client.invalidateQueries({ queryKey: mineKey });
    },
    scope: { id: `like-${branchId}` },
    onError: (_error, { dishId, active }) => {
      // Undo only this dish's change, then ask the API what is true.
      client.setQueryData<MyLikes>(mineKey, (current) =>
        withLike(current, dishId, !active),
      );
      setFailed(true);
      void client.invalidateQueries({ queryKey: mineKey });
    },
    onSettled: () => client.invalidateQueries({ queryKey: countsKey }),
  });

  const isLiked = (dishId: string) =>
    mine.data?.dishIds.includes(dishId) ?? false;
  return {
    isLiked,
    commentsOf: (dishId) =>
      counts.data?.dishes.find((entry) => entry.dishId === dishId)?.comments ??
      0,
    toggle: (dishId) => {
      // The heart changes in this very touch (RNF-02): a refresh in flight is dropped,
      // without reverting, so it cannot paint the old state over it.
      const active = !isLiked(dishId);
      void client.cancelQueries({ queryKey: mineKey }, { revert: false });
      client.setQueryData<MyLikes>(mineKey, (current) =>
        withLike(current, dishId, active),
      );
      setFailed(false);
      like.mutate({ dishId, active, resync: mine.data === undefined });
    },
    failed,
  };
}

export const LikesContext = createContext<Likes | null>(null);

export function useLikesContext(): Likes {
  const likes = useContext(LikesContext);
  if (likes === null) throw new Error("LikesContext is not provided");
  return likes;
}
