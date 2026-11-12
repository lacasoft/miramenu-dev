import { coverOf, type VisibleDish } from "@miramenu/diner-core";
import { formatDuration } from "@miramenu/i18n";
import { useLayoutEffect, useRef } from "react";
import { t } from "../i18n";
import { Icon } from "../ui/Icon";
import { MediaImage } from "../ui/MediaImage";
import styles from "./GridView.module.css";
import { LikeButton } from "./LikeButton";
import { priceLabel } from "./price";

interface GridViewProps {
  dishes: readonly VisibleDish[];
  columns: 2 | 3;
  active: VisibleDish;
  onOpenDish: (dishId: string) => void;
  onOpenDetail: () => void;
}

/**
 * Two or three columns of covers, read by rows in the menu's order. Touching a dish opens
 * the feed on it; the active dish keeps its champagne border and the contextual bar, with
 * "Ver detalle", below (decided 2026-11-12). Each cell carries its heart, outside the
 * cell's own button so the two never nest.
 */
export function GridView({
  dishes,
  columns,
  active,
  onOpenDish,
  onOpenDetail,
}: GridViewProps) {
  const listRef = useRef<HTMLUListElement>(null);

  // A new density, or coming back from the feed, keeps the active dish in sight.
  useLayoutEffect(() => {
    listRef.current
      ?.querySelector(`[data-dish-id="${active.dish.id}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [columns, active.dish.id]);

  return (
    <main className={styles.grid}>
      <ul
        ref={listRef}
        className={styles.cells}
        data-columns={columns}
        aria-label={t("menu.dishes")}
      >
        {dishes.map(({ dish }) => (
          <li key={dish.id} className={styles.cell} data-dish-id={dish.id}>
            <button
              type="button"
              className={styles.open}
              aria-label={t("menu.openDish", { name: dish.name })}
              aria-current={dish.id === active.dish.id || undefined}
              onClick={() => onOpenDish(dish.id)}
            >
              <MediaImage
                image={coverOf(dish)}
                sizes={
                  columns === 2
                    ? "(min-width: 30rem) 15rem, 50vw"
                    : "(min-width: 30rem) 10rem, 33vw"
                }
                className={styles.cover}
              />
              {dish.video && (
                <span className={`glass-smoke ${styles.play}`}>
                  <Icon name="play" size={16} />
                  {columns === 2 && formatDuration(dish.video.durationMs)}
                </span>
              )}
              {columns === 2 && (
                <span className={`scrim-bottom ${styles.name}`}>
                  {dish.name}
                </span>
              )}
            </button>
            <LikeButton
              dishId={dish.id}
              dishName={dish.name}
              compact
              className={styles.cellLike}
            />
          </li>
        ))}
      </ul>
      <ContextBar entry={active} onOpenDetail={onOpenDetail} />
    </main>
  );
}

function ContextBar({
  entry: { dish },
  onOpenDetail,
}: {
  entry: VisibleDish;
  onOpenDetail: () => void;
}) {
  return (
    <div className={styles.barSlot}>
      <div className={`glass-smoke ${styles.bar}`}>
        <MediaImage
          image={coverOf(dish)}
          sizes="56px"
          eager
          className={styles.thumb}
        />
        <div className={styles.barText}>
          <p className={styles.barName}>{dish.name}</p>
          <p className={styles.barPrice}>{priceLabel(dish)}</p>
        </div>
        <LikeButton dishId={dish.id} dishName={dish.name} />
        <button
          type="button"
          className={styles.detail}
          aria-label={t("dish.seeDetailOf", { name: dish.name })}
          onClick={onOpenDetail}
        >
          {t("dish.seeDetail")}
          <Icon name="chevronRight" size={20} />
        </button>
      </div>
    </div>
  );
}
