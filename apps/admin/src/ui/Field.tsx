import { useId, type InputHTMLAttributes } from "react";
import styles from "./Field.module.css";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Said under the field and tied to it, so a screen reader reads it with the field. */
  error?: string | null;
}

/** A labeled input whose error is announced with it (WCAG 3.3.1). */
export function Field({ label, error = null, ...input }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        {...input}
        id={id}
        className={styles.input}
        aria-invalid={error !== null || undefined}
        aria-describedby={error === null ? undefined : errorId}
      />
      {error !== null && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
