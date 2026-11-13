import { nameProblemOf } from "@miramenu/admin-core";
import { useState, type FormEvent } from "react";
import { fieldText } from "../app/problems";
import { t } from "../i18n";
import controls from "../ui/controls.module.css";
import { Field } from "../ui/Field";
import page from "../ui/page.module.css";

/** A category's name, to create it or to rename it; an unchanged name is nothing to send. */
export function CategoryNameForm({
  initial = "",
  submitLabel,
  pending,
  problem,
  onSubmit,
  onCancel,
}: {
  initial?: string;
  submitLabel: string;
  pending: boolean;
  problem: string | null;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const [tried, setTried] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (pending || nameProblemOf(name) !== null) return;
    if (name.trim() === initial) return onCancel();
    onSubmit(name.trim());
  };
  return (
    <form className={page.form} onSubmit={submit} noValidate>
      <Field
        label={t("menu.categoryName")}
        value={name}
        error={fieldText("name", tried ? nameProblemOf(name) : null)}
        onChange={(event) => setName(event.target.value)}
      />
      {problem !== null && (
        <p className={controls.problem} role="alert">
          {problem}
        </p>
      )}
      <div className={page.actions}>
        <button type="submit" className={controls.primary} disabled={pending}>
          {pending ? t("common.saving") : submitLabel}
        </button>
        <button type="button" className={controls.secondary} onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
