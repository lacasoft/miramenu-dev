import type { PublishedMenu } from "@miramenu/contracts";
import { formatPrice } from "@miramenu/i18n";
import { t } from "../i18n";
import styles from "./MenuList.module.css";

/**
 * The published menu as a plain list: the foundation's screen, replaced by the approved
 * grid and feed in phase 6b.
 */
export function MenuList({ menu }: { menu: PublishedMenu }) {
  return (
    <main className={styles.screen}>
      <h1 className={styles.restaurant}>{menu.profile.name}</h1>
      {menu.categories.map((category) => (
        <section key={category.id} className={styles.category}>
          <h2 className={styles.categoryName}>{category.name}</h2>
          <ul className={styles.dishes}>
            {category.dishes.map((dish) => (
              <li key={dish.id} className={styles.dish}>
                <div>
                  <h3 className={styles.dishName}>{dish.name}</h3>
                  {dish.description && (
                    <p className={styles.description}>{dish.description}</p>
                  )}
                </div>
                <p className={styles.price}>
                  {dish.available
                    ? formatPrice(dish.priceCents, dish.currency)
                    : t("menu.dishUnavailable")}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
