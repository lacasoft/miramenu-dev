import { formatPercent } from "@miramenu/i18n";
import { t } from "../i18n";
import styles from "./Dashboard.module.css";

/** A half circle from left to right: the track and, over it, the share filled. */
const ARC = "M 12 64 A 48 48 0 0 1 108 64";

/**
 * The share of entries that reached a valid view, as the dashboard's gauge (design
 * system: fill on a lighter track of the same hue, the percentage in the middle). The
 * percentage says it, never the color alone; without entries, "—".
 */
export function ViewRateGauge({ rate }: { rate: number | null }) {
  const filled = rate === null ? 0 : Math.round(rate * 100);
  const label =
    rate === null
      ? t("dashboard.noRate")
      : t("dashboard.viewRateOf", { rate: formatPercent(rate) });
  return (
    <figure className={styles.gauge}>
      <svg viewBox="0 0 120 72" role="img" aria-label={label}>
        <path className={styles.gaugeTrack} d={ARC} pathLength={100} />
        {filled > 0 && (
          <path
            className={styles.gaugeFill}
            d={ARC}
            pathLength={100}
            strokeDasharray={`${filled} 100`}
          />
        )}
        <text className={styles.gaugeValue} x={60} y={60} textAnchor="middle">
          {rate === null ? t("dashboard.none") : formatPercent(rate)}
        </text>
      </svg>
      <figcaption className={styles.hint}>
        {t("dashboard.viewRateHint")}
      </figcaption>
    </figure>
  );
}
