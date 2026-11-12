import { ApiError } from "@miramenu/api-client";
import { COMMENT_MAX_LENGTH, commentTextSchema } from "@miramenu/contracts";
import type { VisibleDish } from "@miramenu/diner-core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type FormEvent } from "react";
import { useDinerApi } from "../app/api-context";
import { t } from "../i18n";
import { Icon } from "../ui/Icon";
import { useModalDialog } from "../ui/use-modal-dialog";
import { CommentList } from "./CommentList";
import styles from "./CommentsSheet.module.css";
import { OwnComments } from "./OwnComments";
import { RegistrationForm } from "./RegistrationForm";
import { MY_COMMENTS_KEY, useDinerSession } from "./use-diner-session";

const newClientId = () => crypto.randomUUID();

function publishProblem(error: unknown): string {
  if (
    error instanceof ApiError &&
    error.failure.kind === "http" &&
    error.failure.status === 429
  ) {
    const minutes = Math.max(
      1,
      Math.ceil((error.failure.retryAfterSeconds ?? 60) / 60),
    );
    return t("comments.tooMany", { minutes });
  }
  return t("comments.publishFailed");
}

const needsSignIn = (error: unknown) =>
  error instanceof ApiError &&
  error.failure.kind === "http" &&
  error.failure.status === 401;

/**
 * A dish's comments in a bottom sheet on a solid reading surface (design-system §7): the
 * approved ones, the diner's own with their state, and a box to comment. Commenting needs
 * registration, asked for right here; once the code checks out, the comment the diner
 * already wrote is posted (§5: access asked in context, then the action resumes).
 */
export function CommentsSheet({
  entry: { dish },
  branchId,
  onClose,
}: {
  entry: VisibleDish;
  branchId: string;
  onClose: () => void;
}) {
  const api = useDinerApi();
  const client = useQueryClient();
  const dialog = useModalDialog(onClose);
  const titleId = useId();
  const draftId = useId();
  const session = useDinerSession();
  const [draft, setDraft] = useState("");
  // Kept until the comment is posted, so a retry after a timeout never posts it twice.
  const [clientId, setClientId] = useState(newClientId);
  const [registering, setRegistering] = useState(false);
  const [posted, setPosted] = useState(false);

  const post = useMutation({
    mutationFn: (text: string) =>
      api.postComment({ branchId, dishId: dish.id, text, clientId }),
    onSuccess: async () => {
      setDraft("");
      setClientId(newClientId());
      setPosted(true);
      await client.invalidateQueries({ queryKey: MY_COMMENTS_KEY });
    },
    onError: (error) => {
      if (needsSignIn(error)) setRegistering(true);
    },
  });

  const valid = commentTextSchema.safeParse(draft).success;
  const onPublish = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setPosted(false);
    if (session.diner === null) setRegistering(true);
    else post.mutate(draft);
  };

  return (
    <dialog ref={dialog} className={styles.sheet} aria-labelledby={titleId}>
      <header className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {t("comments.of", { name: dish.name })}
        </h2>
        <button
          type="button"
          className={styles.close}
          aria-label={t("comments.close")}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      <div className={styles.body}>
        {session.diner !== null && <OwnComments dishId={dish.id} />}
        <CommentList branchId={branchId} dishId={dish.id} />
      </div>
      <footer className={styles.footer}>
        {registering && session.diner === null ? (
          <RegistrationForm
            onRegistered={(registered) => {
              session.signedIn(registered);
              setRegistering(false);
              post.mutate(draft);
            }}
          />
        ) : (
          <form className={styles.form} onSubmit={onPublish}>
            <label className={styles.label} htmlFor={draftId}>
              {t("comments.write")}
            </label>
            <textarea
              id={draftId}
              className={styles.input}
              rows={3}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className={styles.row}>
              <span className={styles.hint} aria-live="polite">
                {t("comments.counter", {
                  count: [...draft].length,
                  max: COMMENT_MAX_LENGTH,
                })}
              </span>
              <button
                type="submit"
                className={styles.primary}
                disabled={!valid || post.isPending}
              >
                {t("comments.publish")}
              </button>
            </div>
            {posted && (
              <p className={styles.note}>{t("comments.pendingNote")}</p>
            )}
            {post.isError && !needsSignIn(post.error) && (
              <p className={styles.error} role="alert">
                {publishProblem(post.error)}
              </p>
            )}
          </form>
        )}
        {session.diner !== null && (
          <p className={styles.session}>
            {t("comments.signedInAs", { name: session.diner.name })}
            <button
              type="button"
              className={styles.link}
              onClick={session.signOut}
            >
              {t("comments.signOut")}
            </button>
          </p>
        )}
      </footer>
    </dialog>
  );
}
