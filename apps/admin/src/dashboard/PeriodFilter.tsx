import {
  customPeriodOf,
  DASHBOARD_TIME_ZONE,
  presetPeriodOf,
  type Period,
  type PeriodProblem,
  type Preset,
} from "@miramenu/admin-core";
import { useState, type FormEvent } from "react";
import { t } from "../i18n";
import controls from "../ui/controls.module.css";
import { Field } from "../ui/Field";
import page from "../ui/page.module.css";
import styles from "./Dashboard.module.css";

/** Which period the figures cover: one of the presets, or days of the admin's choice. */
export type Choice = Preset | "custom";

const PRESETS: readonly [
  Preset,
  "dashboard.last7" | "dashboard.last30" | "dashboard.last90",
][] = [
  [7, "dashboard.last7"],
  [30, "dashboard.last30"],
  [90, "dashboard.last90"],
];

const PROBLEM_TEXT = {
  required: "dashboard.problem.required",
  order: "dashboard.problem.order",
  tooLong: "dashboard.problem.tooLong",
} as const;

/**
 * The period of every figure below (dataviz: date range first, presets before a custom
 * range). A preset counts back from now, read when it is chosen; a custom period takes
 * whole days in the dashboard's zone.
 */
export function PeriodFilter({
  choice,
  onChange,
}: {
  choice: Choice;
  onChange: (choice: Choice, period: Period) => void;
}) {
  const [custom, setCustom] = useState(choice === "custom");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [problem, setProblem] = useState<PeriodProblem | null>(null);

  const apply = (event: FormEvent) => {
    event.preventDefault();
    const result = customPeriodOf(start, end, DASHBOARD_TIME_ZONE);
    if ("problem" in result) return setProblem(result.problem);
    setProblem(null);
    onChange("custom", result.period);
  };

  return (
    <div className={styles.filters}>
      <div className={page.actions}>
        {PRESETS.map(([days, label]) => (
          <button
            key={days}
            type="button"
            className={
              choice === days && !custom ? controls.primary : controls.secondary
            }
            aria-pressed={choice === days && !custom}
            onClick={() => {
              setCustom(false);
              onChange(
                days,
                presetPeriodOf(days, Date.now(), DASHBOARD_TIME_ZONE),
              );
            }}
          >
            {t(label)}
          </button>
        ))}
        <button
          type="button"
          className={custom ? controls.primary : controls.secondary}
          aria-pressed={custom}
          onClick={() => setCustom(true)}
        >
          {t("dashboard.custom")}
        </button>
      </div>
      {custom && (
        <form className={styles.custom} onSubmit={apply} noValidate>
          <Field
            label={t("dashboard.from")}
            type="date"
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
          <Field
            label={t("dashboard.to")}
            type="date"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
          <button type="submit" className={controls.secondary}>
            {t("dashboard.apply")}
          </button>
          {problem !== null && (
            <p className={controls.problem} role="alert">
              {t(PROBLEM_TEXT[problem])}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
