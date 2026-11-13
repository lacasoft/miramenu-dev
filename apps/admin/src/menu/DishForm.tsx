import {
  descriptionProblemOf,
  nameProblemOf,
  priceProblemOf,
  type DishValues,
  type PriceProblem,
} from "@miramenu/admin-core";
import type { Category } from "@miramenu/contracts";
import { useState, type FormEvent } from "react";
import { fieldText } from "../app/problems";
import { t } from "../i18n";
import controls from "../ui/controls.module.css";
import { Field, SelectField, TextAreaField } from "../ui/Field";
import page from "../ui/page.module.css";

function priceText(problem: PriceProblem | null): string | null {
  if (problem === "format") return t("field.price.format");
  if (problem === "tooHigh") return t("field.price.tooHigh");
  return problem === null ? null : t("field.required");
}

/**
 * A dish's name, description, price and, when it already exists, its category. Problems
 * are said next to each field before anything is sent.
 */
export function DishForm({
  initial,
  categories,
  submitLabel,
  pending,
  problem,
  onSubmit,
  onCancel,
}: {
  initial: DishValues;
  /** Given when the dish may change category. */
  categories?: readonly Category[];
  submitLabel: string;
  pending: boolean;
  problem: string | null;
  onSubmit: (values: DishValues) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState(initial);
  const [tried, setTried] = useState(false);
  const problems = {
    name: nameProblemOf(values.name),
    description: descriptionProblemOf(values.description),
    price: priceProblemOf(values.price),
  };
  const set = (patch: Partial<DishValues>) =>
    setValues((current) => ({ ...current, ...patch }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (pending || Object.values(problems).some((each) => each !== null))
      return;
    onSubmit(values);
  };

  return (
    <form className={page.form} onSubmit={submit} noValidate>
      <Field
        label={t("menu.dishName")}
        value={values.name}
        error={fieldText("name", tried ? problems.name : null)}
        onChange={(event) => set({ name: event.target.value })}
      />
      <TextAreaField
        label={t("menu.description")}
        value={values.description}
        error={
          tried && problems.description !== null
            ? t("field.description.tooLong")
            : null
        }
        onChange={(event) => set({ description: event.target.value })}
      />
      <Field
        label={t("menu.price")}
        hint={t("menu.priceHint")}
        inputMode="decimal"
        value={values.price}
        error={tried ? priceText(problems.price) : null}
        onChange={(event) => set({ price: event.target.value })}
      />
      {categories !== undefined && (
        <SelectField
          label={t("menu.category")}
          value={values.categoryId}
          onChange={(event) => set({ categoryId: event.target.value })}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </SelectField>
      )}
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
