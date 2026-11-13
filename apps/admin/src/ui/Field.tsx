import { useId, type InputHTMLAttributes } from "react";
import styles from "./Field.module.css";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Said under the field and tied to it, so a screen reader reads it with the field. */
  error?: string | null;
  /** What the field expects, under its label and tied to it. */
  hint?: string;
}

/** A labeled input whose error is announced with it (WCAG 3.3.1). */
export function Field({ label, error = null, hint, ...input }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [hint === undefined ? null : hintId, error === null ? null : errorId]
    .filter((each) => each !== null)
    .join(" ");
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {hint !== undefined && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      <input
        {...input}
        id={id}
        className={styles.input}
        aria-invalid={error !== null || undefined}
        aria-describedby={describedBy === "" ? undefined : describedBy}
      />
      {error !== null && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
