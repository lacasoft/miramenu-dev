import { coverOf, type VisibleDish } from "@miramenu/diner-core";
import { useId } from "react";
import { t } from "../i18n";
import { Icon } from "../ui/Icon";
import { MediaImage } from "../ui/MediaImage";
import { useModalDialog } from "../ui/use-modal-dialog";
import styles from "./DishDetail.module.css";
import { priceLabel } from "./price";

/**
 * The editorial detail over the dish's still: its category as the kicker, a clean title,
 * the description and the bottom bar with the price. Only real data shows: the menu has
 * no portion, preparation or ingredients yet, so no empty module stands in for them
 * (design-system §10). Close, Escape and the system's back all close it, and the focus
 * returns to the control that opened it.
 */
export function DishDetail({
  entry: { dish, category },
  onClose,
}: {
  entry: VisibleDish;
  onClose: () => void;
}) {
  const dialog = useModalDialog(onClose);
  const titleId = useId();

  return (
    <dialog ref={dialog} className={styles.detail} aria-labelledby={titleId}>
      <MediaImage
        image={coverOf(dish)}
        sizes="(min-width: 30rem) 30rem, 100vw"
        eager
        className={styles.still}
      />
      <div className={`scrim-top ${styles.scrimTop}`} />
      <div className={`scrim-bottom ${styles.scrimBottom}`} />
      <button
        type="button"
        className={`glass-smoke ${styles.close}`}
        aria-label={t("dish.close")}
        onClick={onClose}
      >
        <Icon name="close" />
      </button>
      <header className={styles.heading}>
        <p className={styles.kicker}>{category.name}</p>
        <h2 id={titleId} className={styles.title}>
          {dish.name}
        </h2>
        {dish.description && (
          <p className={styles.description}>{dish.description}</p>
        )}
      </header>
      <div className={`glass-smoke ${styles.bar}`}>
        <p className={styles.price}>{priceLabel(dish)}</p>
      </div>
    </dialog>
  );
}
