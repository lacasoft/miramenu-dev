import { formatRelativeTime } from "@miramenu/i18n";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useDinerApi } from "../app/api-context";
import { t } from "../i18n";
import styles from "./CommentsSheet.module.css";

/** The approved comments of a dish, newest first, a page at a time, for everyone. */
export function CommentList({
  branchId,
  dishId,
}: {
  branchId: string;
  dishId: string;
}) {
  const api = useDinerApi();
  // "Hace 3 horas" is read from when the sheet opened; it does not tick while open.
  const [now] = useState(() => Date.now());
  const comments = useInfiniteQuery({
    queryKey: ["comments", branchId, dishId],
    queryFn: ({ pageParam }) => api.comments(branchId, dishId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  if (comments.isPending)
    return <div className={styles.loading} aria-busy="true" />;
  if (comments.isError && comments.data === undefined) {
    return (
      <div className={styles.state}>
        <p>{t("comments.loadFailed")}</p>
        <button
          type="button"
          className={styles.link}
          onClick={() => void comments.refetch()}
        >
          {t("comments.retry")}
        </button>
      </div>
    );
  }
  const items = comments.data?.pages.flatMap((page) => page.items) ?? [];
  if (items.length === 0)
    return <p className={styles.state}>{t("comments.empty")}</p>;

  return (
    <>
      <ul className={styles.list}>
        {items.map((comment) => (
          <li key={comment.id} className={styles.comment}>
            <p className={styles.meta}>
              <span className={styles.author}>{comment.author.name}</span>
              <span>{formatRelativeTime(comment.approvedAt, now)}</span>
            </p>
            <p className={styles.text}>{comment.text}</p>
          </li>
        ))}
      </ul>
      {comments.hasNextPage && (
        <button
          type="button"
          className={styles.link}
          disabled={comments.isFetchingNextPage}
          onClick={() => void comments.fetchNextPage()}
        >
          {t("comments.loadMore")}
        </button>
      )}
    </>
  );
}
