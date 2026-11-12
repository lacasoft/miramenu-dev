import { t } from "../i18n";
import styles from "./MenuSkeleton.module.css";

const PLACEHOLDER_CELLS = 6;

/**
 * The opening while the menu loads: the grid's shape (RNF-09) with the brand fading in
 * over it, the splash the design asks for. It lasts only as long as the load: nothing
 * waits for the animation (RNF-01).
 */
export function MenuSkeleton() {
  return (
    <main
      className={styles.screen}
      aria-busy="true"
      aria-label={t("menu.loading")}
    >
      <div className={styles.capsule} />
      <div className={styles.cells}>
        {Array.from({ length: PLACEHOLDER_CELLS }, (_, cell) => (
          <div key={cell} className={styles.cell} />
        ))}
      </div>
      <p className={styles.brand} aria-hidden="true">
        {t("app.title")}
      </p>
    </main>
  );
}
