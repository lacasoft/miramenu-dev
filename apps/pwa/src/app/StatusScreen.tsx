import { t } from "../i18n";
import styles from "./StatusScreen.module.css";

const TEXTS = {
  notFound: ["status.notFound.title", "status.notFound.description"],
  notPublished: [
    "status.notPublished.title",
    "status.notPublished.description",
  ],
  unavailable: ["status.unavailable.title", "status.unavailable.description"],
  empty: ["menu.empty.title", "menu.empty.description"],
} as const;

interface StatusScreenProps {
  kind: keyof typeof TEXTS;
  /** Shown as a button when trying again may help. */
  onRetry?: () => void;
}

/** A full-screen message when there is no menu to show, on a solid reading surface. */
export function StatusScreen({ kind, onRetry }: StatusScreenProps) {
  const [title, description] = TEXTS[kind];
  return (
    <main className={styles.screen}>
      <div className={styles.panel}>
        <h1 className={styles.title}>{t(title)}</h1>
        <p className={styles.description}>{t(description)}</p>
        {onRetry && (
          <button type="button" className={styles.retry} onClick={onRetry}>
            {t("status.retry")}
          </button>
        )}
      </div>
    </main>
  );
}
