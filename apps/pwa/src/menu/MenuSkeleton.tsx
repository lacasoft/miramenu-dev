import { t } from "../i18n";
import styles from "./MenuSkeleton.module.css";

const PLACEHOLDER_ROWS = 4;

/** The menu's shape while it loads (RNF-09), announced to screen readers as busy. */
export function MenuSkeleton() {
  return (
    <main
      className={styles.screen}
      aria-busy="true"
      aria-label={t("menu.loading")}
    >
      <div className={styles.title} />
      {Array.from({ length: PLACEHOLDER_ROWS }, (_, row) => (
        <div key={row} className={styles.row} />
      ))}
    </main>
  );
}
