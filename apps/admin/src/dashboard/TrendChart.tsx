import { ticksOf } from "@miramenu/admin-core";
import { formatCount, formatShortDay } from "@miramenu/i18n";
import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { t } from "../i18n";
import styles from "./Dashboard.module.css";

const WIDTH = 640;
const HEIGHT = 220;
const PAD = { top: 12, right: 16, bottom: 28, left: 48 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

interface Day {
  day: string;
  views: number;
}

/** The x of the n-th day: one day alone sits in the middle. */
const xOf = (index: number, count: number) =>
  PAD.left + (count === 1 ? PLOT_W / 2 : (index * PLOT_W) / (count - 1));

/** The days whose date the x axis says: the first, the last, and the middle one between. */
const labeledOf = (count: number) => [
  ...new Set([0, Math.floor((count - 1) / 2), count - 1]),
];

/**
 * Views per day, one series (dataviz): a 2px line over a 10% wash of its hue, hairline
 * gridlines on clean ticks, an end dot. The crosshair finds the day under the pointer,
 * and the arrow keys walk the days with the same readout; the table gives every value
 * without hovering.
 */
export function TrendChart({ days }: { days: readonly Day[] }) {
  const [active, setActive] = useState<number | null>(null);
  const ticks = ticksOf(Math.max(0, ...days.map((each) => each.views)));
  const top = ticks[ticks.length - 1]!;
  const yOf = (views: number) => PAD.top + PLOT_H - (views / top) * PLOT_H;
  const points = days.map(
    (each, index) => [xOf(index, days.length), yOf(each.views)] as const,
  );
  const line = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x},${y}`)
    .join(" ");
  const base = PAD.top + PLOT_H;
  const area =
    points.length === 0
      ? ""
      : `${line} L${points[points.length - 1]![0]},${base} L${points[0]![0]},${base} Z`;
  const last = points[points.length - 1];
  const shown = active === null ? null : days[active];

  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0 || days.length === 0) return;
    const x = ((event.clientX - box.left) / box.width) * WIDTH;
    const step = days.length === 1 ? PLOT_W : PLOT_W / (days.length - 1);
    setActive(
      Math.min(days.length - 1, Math.max(0, Math.round((x - PAD.left) / step))),
    );
  };
  const walk = (event: KeyboardEvent<SVGSVGElement>) => {
    const moves: Record<string, (index: number) => number> = {
      ArrowRight: (index) => Math.min(days.length - 1, index + 1),
      ArrowLeft: (index) => Math.max(0, index - 1),
      Home: () => 0,
      End: () => days.length - 1,
    };
    const move = moves[event.key];
    if (move === undefined || days.length === 0) return;
    event.preventDefault();
    setActive((index) => move(index ?? days.length - 1));
  };

  return (
    <div className={styles.chart}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="group"
        tabIndex={0}
        aria-label={t("dashboard.trendChart", {
          from: formatShortDay(days[0]?.day ?? ""),
          to: formatShortDay(days[days.length - 1]?.day ?? ""),
        })}
        onPointerMove={pick}
        onPointerLeave={() => setActive(null)}
        onKeyDown={walk}
        onBlur={() => setActive(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              className={styles.rule}
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={yOf(tick)}
              y2={yOf(tick)}
            />
            <text
              className={styles.tick}
              x={PAD.left - 8}
              y={yOf(tick)}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {formatCount(tick)}
            </text>
          </g>
        ))}
        {labeledOf(days.length).map((index) => (
          <text
            key={days[index]!.day}
            className={styles.tick}
            x={xOf(index, days.length)}
            y={HEIGHT - 8}
            textAnchor={
              index === 0
                ? "start"
                : index === days.length - 1
                  ? "end"
                  : "middle"
            }
          >
            {formatShortDay(days[index]!.day)}
          </text>
        ))}
        <path className={styles.area} d={area} />
        <path className={styles.line} d={line} />
        {active !== null && (
          <line
            className={styles.crosshair}
            x1={points[active]![0]}
            x2={points[active]![0]}
            y1={PAD.top}
            y2={base}
          />
        )}
        {last !== undefined && (
          <circle className={styles.dot} cx={last[0]} cy={last[1]} r={4} />
        )}
        {active !== null && (
          <circle
            className={styles.dot}
            cx={points[active]![0]}
            cy={points[active]![1]}
            r={4}
          />
        )}
      </svg>
      <p className={styles.readout} aria-live="polite">
        {shown != null && t("dashboard.trendPoint", { views: formatCount(shown.views), day: formatShortDay(shown.day) })}
      </p>
      <details className={styles.table}>
        <summary>{t("dashboard.trendTable")}</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{t("dashboard.day")}</th>
              <th scope="col">{t("dashboard.views")}</th>
            </tr>
          </thead>
          <tbody>
            {days.map((each) => (
              <tr key={each.day}>
                <th scope="row">{formatShortDay(each.day)}</th>
                <td>{formatCount(each.views)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
