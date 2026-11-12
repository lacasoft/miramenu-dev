import { commentTextSchema, type OwnComment } from "@miramenu/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useDinerApi } from "../app/api-context";
import { t } from "../i18n";
import styles from "./CommentsSheet.module.css";
import { MY_COMMENTS_KEY } from "./use-diner-session";

const STATUS = {
  pending: "comments.status.pending",
  rejected: "comments.status.rejected",
  approved: "comments.status.approved",
} as const;

/**
 * The diner's own comments on this dish, whatever their state, so a pending one is not a
 * mystery. They can edit one (it goes back to moderation) or delete it.
 */
export function OwnComments({ dishId }: { dishId: string }) {
  const api = useDinerApi();
  const mine = useQuery({
    queryKey: MY_COMMENTS_KEY,
    queryFn: () => api.myComments(),
  });
  const own =
    mine.data?.items.filter((comment) => comment.dishId === dishId) ?? [];
  if (own.length === 0) return null;
  return (
    <section className={styles.own}>
      <h3 className={styles.subtitle}>{t("comments.yours")}</h3>
      <ul className={styles.list}>
        {own.map((comment) => (
          <OwnCommentItem key={comment.id} comment={comment} />
        ))}
      </ul>
    </section>
  );
}

function OwnCommentItem({ comment }: { comment: OwnComment }) {
  const api = useDinerApi();
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [text, setText] = useState(comment.text);
  const refresh = () => client.invalidateQueries({ queryKey: MY_COMMENTS_KEY });
  const edit = useMutation({
    mutationFn: () => api.editComment(comment.id, text),
    onSuccess: async () => {
      setEditing(false);
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () => api.deleteComment(comment.id),
    onSuccess: refresh,
  });
  const failed = edit.isError || remove.isError;

  return (
    <li className={styles.comment}>
      <p className={styles.meta}>
        <span className={styles.status} data-status={comment.status}>
          {t(STATUS[comment.status])}
        </span>
      </p>
      {editing ? (
        <>
          <textarea
            className={styles.input}
            aria-label={t("comments.write")}
            value={text}
            rows={3}
            onChange={(event) => setText(event.target.value)}
          />
          <div className={styles.row}>
            <button
              type="button"
              className={styles.primary}
              disabled={
                edit.isPending || !commentTextSchema.safeParse(text).success
              }
              onClick={() => edit.mutate()}
            >
              {t("comments.save")}
            </button>
            <button
              type="button"
              className={styles.link}
              onClick={() => setEditing(false)}
            >
              {t("comments.cancel")}
            </button>
          </div>
        </>
      ) : (
        <p className={styles.text}>{comment.text}</p>
      )}
      {comment.status === "pending" && !editing && (
        <p className={styles.hint}>{t("comments.pendingNote")}</p>
      )}
      {!editing && (
        <div className={styles.row}>
          <button
            type="button"
            className={styles.link}
            onClick={() => setEditing(true)}
          >
            {t("comments.edit")}
          </button>
          {confirming ? (
            <button
              type="button"
              className={styles.link}
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {t("comments.confirmDelete")}
            </button>
          ) : (
            <button
              type="button"
              className={styles.link}
              onClick={() => setConfirming(true)}
            >
              {t("comments.delete")}
            </button>
          )}
        </div>
      )}
      {failed && (
        <p className={styles.error} role="alert">
          {t("comments.actionFailed")}
        </p>
      )}
    </li>
  );
}
