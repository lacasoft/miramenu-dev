import { t } from "../i18n";
import { Icon } from "../ui/Icon";
import styles from "./CommentCount.module.css";
import { useLikesContext } from "./use-likes";

function commentsLabel(count: number): string {
  return count === 1 ? t("comments.one") : t("comments.other", { count });
}

/**
 * The approved comments of a dish, and the way into them. In the feed's rail it is the
 * bubble over its number, as the approved screen draws it; in the detail's bar it reads
 * in words. Its name says both what it opens and how many there are.
 */
export function CommentCount({
  dishId,
  dishName,
  variant,
  onOpen,
}: {
  dishId: string;
  dishName: string;
  variant: "rail" | "inline";
  onOpen: () => void;
}) {
  const count = useLikesContext().commentsOf(dishId);
  const label = commentsLabel(count);
  return (
    <button
      type="button"
      className={styles.count}
      data-variant={variant}
      aria-label={`${t("comments.open", { name: dishName })}, ${label}`}
      onClick={onOpen}
    >
      <span className={`glass-smoke ${styles.bubble}`}>
        <Icon name="comment" size={variant === "rail" ? 24 : 20} />
      </span>
      <span>{variant === "rail" ? count : label}</span>
    </button>
  );
}
