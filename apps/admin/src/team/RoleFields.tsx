import type { RoleChoice } from "@miramenu/admin-core";
import type { Branch } from "@miramenu/contracts";
import { useId } from "react";
import { t } from "../i18n";
import styles from "./RoleFields.module.css";

/** Admin restaurante, or admin of the chosen branches (ADR-0032). */
export function RoleFields({
  choice,
  branches,
  error,
  onChange,
}: {
  choice: RoleChoice;
  branches: readonly Branch[];
  error: string | null;
  onChange: (choice: RoleChoice) => void;
}) {
  const name = useId();
  const errorId = `${name}-error`;
  const chosen = choice.kind === "branches" ? choice.branchIds : [];
  const toggle = (branchId: string, on: boolean) =>
    onChange({
      kind: "branches",
      branchIds: on ? [...chosen, branchId] : chosen.filter((each) => each !== branchId),
    });
  return (
    <fieldset className={styles.fieldset} aria-describedby={error === null ? undefined : errorId}>
      <legend className={styles.legend}>{t("team.role")}</legend>
      <label className={styles.option}>
        <input type="radio" name={name} checked={choice.kind === "business"} onChange={() => onChange({ kind: "business" })} />
        {t("team.roleBusiness")}
      </label>
      <label className={styles.option}>
        <input
          type="radio"
          name={name}
          checked={choice.kind === "branches"}
          onChange={() => onChange({ kind: "branches", branchIds: chosen })}
        />
        {t("team.roleBranches")}
      </label>
      {choice.kind === "branches" &&
        (branches.length === 0 ? (
          <p className={styles.hint}>{t("team.noBranches")}</p>
        ) : (
          <fieldset className={styles.branches}>
            <legend className={styles.legend}>{t("team.branches")}</legend>
            {branches.map((branch) => (
              <label key={branch.id} className={styles.option}>
                <input
                  type="checkbox"
                  checked={chosen.includes(branch.id)}
                  onChange={(event) => toggle(branch.id, event.target.checked)}
                />
                {branch.name}
              </label>
            ))}
          </fieldset>
        ))}
      {error !== null && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </fieldset>
  );
}
