import type { DishRow } from "@miramenu/admin-core";
import { formatCount, formatPercent, formatSeconds } from "@miramenu/i18n";
import { t } from "../i18n";
import styles from "./Dashboard.module.css";

const none = t("dashboard.none");

/**
 * Every dish of the period with all its figures, the table every chart has as its twin.
 * A rate without denominator is "—". On a phone, each row stacks as a card with its labels.
 */
export function DishTable({ rows }: { rows: readonly DishRow[] }) {
  if (rows.length === 0)
    return <p className={styles.hint}>{t("dashboard.noDishes")}</p>;
  const columns = [
    t("dashboard.views"),
    t("dashboard.entries"),
    t("dashboard.exposure"),
    t("dashboard.quickSkip"),
    t("dashboard.likes"),
    t("dashboard.comments"),
  ];
  return (
    <table className={styles.dishes}>
      <thead>
        <tr>
          <th scope="col">{t("dashboard.dish")}</th>
          {columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const cells = [
            formatCount(row.views),
            formatCount(row.entries),
            row.exposureAverageMs === null
              ? none
              : formatSeconds(row.exposureAverageMs),
            row.quickSkipRate === null
              ? none
              : formatPercent(row.quickSkipRate),
            formatCount(row.likes),
            formatCount(row.comments),
          ];
          return (
            <tr key={row.dishId}>
              <th scope="row">{row.name ?? t("dashboard.unknownDish")}</th>
              {cells.map((cell, index) => (
                <td key={columns[index]} data-label={columns[index]}>
                  {cell}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
