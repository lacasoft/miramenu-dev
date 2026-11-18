import type { Change } from "@miramenu/admin-core";
import { formatSignedPercent } from "@miramenu/i18n";
import { t } from "../i18n";
import styles from "./Dashboard.module.css";

function changeText(change: Change): string {
  if (change.direction === "flat") return t("dashboard.same");
  if (change.ratio === null) return t("dashboard.fromZero");
  return t("dashboard.vsBefore", { change: formatSignedPercent(change.ratio) });
}

/**
 * A stat tile: its label, its figure, and how it moved against the period before. The
 * move says its sign and words, and its color says whether that is good: for the quick
 * skip rate, going up is bad. A figure without a denominator is "—", never 0.
 */
export function KpiTile({
  label,
  value,
  change,
  missing,
  accent = false,
}: {
  label: string;
  /** The figure as it reads, or null when there is nothing to divide by. */
  value: string | null;
  change: Change | null;
  /** What "—" means, said to whoever cannot see it. */
  missing?: string;
  /** The one accent card of the view. */
  accent?: boolean;
}) {
  const tone =
    change?.good === true
      ? styles.good
      : change?.good === false
        ? styles.bad
        : styles.neutral;
  return (
    <section
      className={`${styles.card} ${styles.kpi} ${accent ? `dashboard-accent ${styles.accent}` : ""}`}
    >
      <h2 className={styles.kpiLabel}>{label}</h2>
      <p className={styles.kpiValue}>
        {value ?? (
          <>
            <span aria-hidden="true">{t("dashboard.none")}</span>
            <span className={styles.hidden}>{missing}</span>
          </>
        )}
      </p>
      {change !== null && (
        <p className={`${styles.delta} ${tone}`}>{changeText(change)}</p>
      )}
    </section>
  );
}
