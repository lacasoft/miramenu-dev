import type { ReactNode } from "react";
import { t } from "../i18n";
import controls from "../ui/controls.module.css";
import styles from "./StatusScreen.module.css";

type StatusKind = "unavailable" | "noAccess" | "notFound";

const TEXTS = {
  unavailable: ["status.unavailable.title", "status.unavailable.description"],
  noAccess: ["noAccess.title", "noAccess.description"],
  notFound: ["notFound.title", "notFound.description"],
} as const;

/** A whole screen that says what happened and offers the one way on. */
export function StatusScreen({
  kind,
  action,
  inShell = false,
}: {
  kind: StatusKind;
  action?: ReactNode;
  /** Inside the app's frame, under its header, instead of the whole page. */
  inShell?: boolean;
}) {
  const [title, description] = TEXTS[kind];
  return (
    <main className={`${styles.screen} ${inShell ? styles.inShell : ""}`}>
      <section className={`${controls.card} ${styles.box}`}>
        <h1 className={styles.title}>{t(title)}</h1>
        <p className={styles.description}>{t(description)}</p>
        {action}
      </section>
    </main>
  );
}

/** While the session or a screen loads: said, not only drawn (RNF-09). */
export function LoadingScreen() {
  return (
    <main className={styles.screen} aria-busy="true">
      <p className={styles.loading} role="status">
        {t("app.loading")}
      </p>
    </main>
  );
}
