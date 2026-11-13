import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import styles from "./Field.module.css";

interface FrameProps {
  label: string;
  /** Said under the field and tied to it, so a screen reader reads it with the field. */
  error?: string | null;
  /** What the field expects, under its label and tied to it. */
  hint?: string;
}

/** The control's id and what describes it, for the label, the hint and the error. */
interface ControlProps {
  id: string;
  className: string;
  "aria-invalid": true | undefined;
  "aria-describedby": string | undefined;
}

/** A labeled control whose hint and error are announced with it (WCAG 3.3.1). */
function Frame({
  label,
  error = null,
  hint,
  control,
}: FrameProps & { control: (props: ControlProps) => ReactNode }) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [
    hint === undefined ? null : hintId,
    error === null ? null : errorId,
  ]
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
      {control({
        id,
        className: styles.input,
        "aria-invalid": error !== null || undefined,
        "aria-describedby": describedBy === "" ? undefined : describedBy,
      })}
      {error !== null && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

export function Field({
  label,
  error,
  hint,
  ...input
}: FrameProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Frame
      label={label}
      error={error}
      hint={hint}
      control={(props) => <input {...input} {...props} />}
    />
  );
}

export function TextAreaField({
  label,
  error,
  hint,
  ...area
}: FrameProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Frame
      label={label}
      error={error}
      hint={hint}
      control={(props) => (
        <textarea
          rows={3}
          {...area}
          {...props}
          className={`${props.className} ${styles.area}`}
        />
      )}
    />
  );
}

export function SelectField({
  label,
  error,
  hint,
  children,
  ...select
}: FrameProps & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Frame
      label={label}
      error={error}
      hint={hint}
      control={(props) => (
        <select {...select} {...props}>
          {children}
        </select>
      )}
    />
  );
}
