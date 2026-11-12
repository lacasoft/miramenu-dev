import { t } from "../i18n";
import { Icon } from "../ui/Icon";
import styles from "./CommentCount.module.css";
import { useLikesContext } from "./use-likes";

function commentsLabel(count: number): string {
  return count === 1 ? t("comments.one") : t("comments.other", { count });
}

/**
 * The approved comments of a dish. In the feed's rail it is the bubble over its number, as
 * the approved screen draws it; in the detail's bar it reads in words.
 */
export function CommentCount({
  dishId,
  variant,
}: {
  dishId: string;
  variant: "rail" | "inline";
}) {
  const count = useLikesContext().commentsOf(dishId);
  return (
    <p className={styles.count} data-variant={variant}>
      <span className={`glass-smoke ${styles.bubble}`}>
        <Icon name="comment" size={variant === "rail" ? 24 : 20} />
      </span>
      {variant === "rail" ? (
        <>
          <span aria-hidden="true">{count}</span>
          <span className="visually-hidden">{commentsLabel(count)}</span>
        </>
      ) : (
        <span>{commentsLabel(count)}</span>
      )}
    </p>
  );
}
