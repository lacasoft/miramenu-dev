import type { DishRow } from "@miramenu/admin-core";
import { formatCount } from "@miramenu/i18n";
import { t } from "../i18n";
import styles from "./Dashboard.module.css";

/**
 * The most viewed dishes as ranked bars (dataviz: part-to-whole compared, largest first,
 * one hue): each bar from one baseline, its value at the tip and its name above it.
 */
export function RankingList({ rows }: { rows: readonly DishRow[] }) {
  if (rows.length === 0)
    return <p className={styles.hint}>{t("dashboard.rankingEmpty")}</p>;
  const top = rows[0]!.views;
  return (
    <ol className={styles.ranking}>
      {rows.map((row) => (
        <li key={row.dishId}>
          <span className={styles.rankName}>
            {row.name ?? t("dashboard.unknownDish")}
          </span>
          <span className={styles.rankBar}>
            <span
              className={styles.bar}
              style={{ width: `${(row.views / top) * 100}%` }}
            />
            <span className={styles.rankValue}>{formatCount(row.views)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
