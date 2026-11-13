import { nameProblemOf, slugProblemOf, subdomainProblemOf, type SaveProblem } from "@miramenu/admin-core";
import { useState, type FormEvent } from "react";
import { fieldText, saveText, takenOn } from "../app/problems";
import { t } from "../i18n";
import controls from "../ui/controls.module.css";
import { Field } from "../ui/Field";
import page from "../ui/page.module.css";

export interface BranchValues {
  name: string;
  slug: string;
  /** Empty: no subdomain of its own, the branch uses its business's. */
  subdomain: string;
}

/** A branch's name and addresses, to create it or to change them. */
export function BranchForm({
  initial = { name: "", slug: "", subdomain: "" },
  submitLabel,
  pending,
  problem,
  onSubmit,
  onCancel,
  onEdit,
}: {
  initial?: BranchValues;
  submitLabel: string;
  pending: boolean;
  problem: SaveProblem | null;
  onSubmit: (values: BranchValues) => void;
  onCancel?: () => void;
  /** Any change: a taken address the API reported may no longer be. */
  onEdit: () => void;
}) {
  const [values, setValues] = useState(initial);
  const [tried, setTried] = useState(false);
  const problems = {
    name: nameProblemOf(values.name),
    slug: slugProblemOf(values.slug),
    subdomain: values.subdomain === "" ? null : subdomainProblemOf(values.subdomain),
  };
  const shown = (field: keyof typeof problems) => (tried ? problems[field] : null);
  const change = (field: keyof BranchValues, value: string) => {
    setValues((current) => ({ ...current, [field]: field === "name" ? value : value.toLowerCase() }));
    onEdit();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (pending || Object.values(problems).some((each) => each !== null)) return;
    onSubmit({ ...values, name: values.name.trim() });
  };

  return (
    <form className={page.form} onSubmit={submit} noValidate>
      <Field label={t("branch.name")} value={values.name} error={fieldText("name", shown("name"))} onChange={(event) => change("name", event.target.value)} />
      <Field
        label={t("branch.slug")}
        hint={t("branch.slugHint")}
        value={values.slug}
        autoCapitalize="none"
        spellCheck={false}
        error={fieldText("slug", shown("slug") ?? takenOn(problem, "slug"))}
        onChange={(event) => change("slug", event.target.value)}
      />
      <Field
        label={t("branch.ownSubdomain")}
        hint={t("branch.ownSubdomainHint")}
        value={values.subdomain}
        autoCapitalize="none"
        spellCheck={false}
        error={fieldText("subdomain", shown("subdomain") ?? takenOn(problem, "subdomain"))}
        onChange={(event) => change("subdomain", event.target.value)}
      />
      {saveText(problem) !== null && (
        <p className={controls.problem} role="alert">
          {saveText(problem)}
        </p>
      )}
      <div className={page.actions}>
        <button type="submit" className={controls.primary} disabled={pending}>
          {pending ? t("common.saving") : submitLabel}
        </button>
        {onCancel !== undefined && (
          <button type="button" className={controls.secondary} onClick={onCancel}>
            {t("common.cancel")}
          </button>
        )}
      </div>
    </form>
  );
}
