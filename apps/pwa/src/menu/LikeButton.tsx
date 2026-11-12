import { t } from "../i18n";
import { Icon } from "../ui/Icon";
import styles from "./LikeButton.module.css";
import { useLikesContext } from "./use-likes";

interface LikeButtonProps {
  dishId: string;
  dishName: string;
  /** In a dense cell the circle is smaller; the 48 px target stays. */
  compact?: boolean;
  /** "Me gusta" next to the heart: under it in the feed's rail, beside it in the detail. */
  label?: "below" | "beside";
  className?: string;
}

/** The heart: Me gusta, filled once given, answering the touch at once (RNF-02). */
export function LikeButton({
  dishId,
  dishName,
  compact = false,
  label,
  className = "",
}: LikeButtonProps) {
  const likes = useLikesContext();
  const liked = likes.isLiked(dishId);
  return (
    <button
      type="button"
      className={`${styles.like} ${className}`}
      data-compact={compact || undefined}
      data-label={label}
      aria-pressed={liked}
      aria-label={t("like.action", { name: dishName })}
      onClick={() => likes.toggle(dishId)}
    >
      <span
        className={`glass-smoke ${styles.circle}`}
        data-liked={liked || undefined}
      >
        <Icon name="heart" filled={liked} size={compact ? 20 : 24} />
      </span>
      {label && (
        <span className={styles.label} aria-hidden="true">
          {t("like.label")}
        </span>
      )}
    </button>
  );
}
