import { ApiError, type ApiFailure } from "@miramenu/api-client";
import { emailSchema, type DinerSession } from "@miramenu/contracts";
import {
  nextRegistration,
  phoneFromLocal,
  REGISTRATION_START,
  secondsUntilResend,
  type RegistrationProblem,
} from "@miramenu/diner-core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useReducer, useState, type FormEvent } from "react";
import { useDinerApi } from "../app/api-context";
import { t } from "../i18n";
import styles from "./CommentsSheet.module.css";

type LocalProblem =
  "phoneInvalid" | "nameRequired" | "emailInvalid" | "privacyRequired";

const failureOf = (error: unknown): ApiFailure =>
  error instanceof ApiError ? error.failure : { kind: "network" };

function problemText(problem: RegistrationProblem): string {
  switch (problem.reason) {
    case "phoneNotReachable":
      return t("registration.phoneNotReachable");
    case "codeInvalid":
      return t("registration.codeInvalid");
    case "codeExpired":
      return t("registration.codeExpired");
    case "wait":
      return t("registration.wait", { seconds: problem.seconds });
    case "privacyOutdated":
      return t("registration.privacyOutdated");
    case "invalid":
      return t("registration.invalid");
    case "unavailable":
      return t("registration.unavailable");
  }
}

/** Ticks every second while a countdown is shown, so it can say how long is left. */
function useNow(ticking: boolean): [number, () => void] {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return undefined;
    const handle = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, [ticking]);
  // An answer that changes the wait reads the clock again, so the count starts on time.
  return [now, () => setNow(Date.now())];
}

/**
 * Registration with a code, asked for in context when the diner wants to comment
 * (design-system §5): their phone, name, optional email, offers and the privacy notice,
 * then the code. Every failure says what happened and what to do (§14).
 */
export function RegistrationForm({
  onRegistered,
}: {
  onRegistered: (session: DinerSession) => void;
}) {
  const api = useDinerApi();
  const notice = useQuery({
    queryKey: ["privacy-notice"],
    queryFn: () => api.privacyNotice(),
    staleTime: 5 * 60_000,
  });
  const [state, dispatch] = useReducer(nextRegistration, REGISTRATION_START);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [offers, setOffers] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [code, setCode] = useState("");
  const [local, setLocal] = useState<LocalProblem | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, readClock] = useNow(state.step === "code");
  const ids = {
    phone: useId(),
    name: useId(),
    email: useId(),
    code: useId(),
    error: useId(),
  };

  const problem = state.step === "done" ? null : state.problem;
  const fieldError = (field: RegistrationProblem["field"]) =>
    problem?.field === field ? problemText(problem) : null;

  const requestCode = async (target: string) => {
    setBusy(true);
    try {
      const answer = await api.requestCode(target);
      dispatch({
        type: "codeRequested",
        phone: target,
        answer,
        now: Date.now(),
      });
    } catch (error) {
      dispatch({ type: "failed", failure: failureOf(error), now: Date.now() });
    } finally {
      readClock();
      setBusy(false);
    }
  };

  const onDetails = (event: FormEvent) => {
    event.preventDefault();
    const target = phoneFromLocal(phone);
    const problem: LocalProblem | null =
      target === null
        ? "phoneInvalid"
        : name.trim().length === 0
          ? "nameRequired"
          : email.trim().length > 0 &&
              !emailSchema.safeParse(email.trim()).success
            ? "emailInvalid"
            : !privacy
              ? "privacyRequired"
              : null;
    setLocal(problem);
    if (problem === null && target !== null) void requestCode(target);
  };

  const onCode = async (event: FormEvent) => {
    event.preventDefault();
    if (state.step !== "code" || notice.data === undefined) return;
    setBusy(true);
    try {
      const session = await api.verify({
        phone: state.phone,
        code: code.trim(),
        name: name.trim(),
        ...(email.trim().length > 0 ? { email: email.trim() } : {}),
        offersConsent: offers,
        privacyNoticeVersion: notice.data.version,
      });
      dispatch({ type: "verified" });
      onRegistered(session);
    } catch (error) {
      const failure = failureOf(error);
      dispatch({ type: "failed", failure, now: Date.now() });
      readClock();
      if (
        failure.kind === "http" &&
        failure.code === "PRIVACY_NOTICE_OUTDATED"
      ) {
        setPrivacy(false);
        void notice.refetch();
      }
    } finally {
      setBusy(false);
    }
  };

  if (state.step === "code") {
    const wait = secondsUntilResend(state, now);
    return (
      <form className={styles.form} onSubmit={onCode} noValidate>
        <p className={styles.note}>
          {t(
            state.delivery === "sent"
              ? "registration.codeSent"
              : "registration.codeUnconfirmed",
            {
              phone: state.phone,
            },
          )}
        </p>
        <label className={styles.label} htmlFor={ids.code}>
          {t("registration.code")}
        </label>
        <input
          id={ids.code}
          className={styles.input}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          aria-invalid={fieldError("code") !== null}
          aria-describedby={fieldError("code") ? ids.error : undefined}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
        />
        {(fieldError("code") ?? fieldError("form")) && (
          <p id={ids.error} className={styles.error} role="alert">
            {fieldError("code") ?? fieldError("form")}
          </p>
        )}
        <button
          type="submit"
          className={styles.primary}
          disabled={busy || code.length !== 6}
        >
          {t("registration.verify")}
        </button>
        <div className={styles.row}>
          <button
            type="button"
            className={styles.link}
            disabled={busy || wait > 0}
            onClick={() => void requestCode(state.phone)}
          >
            {wait > 0
              ? t("registration.resendIn", { seconds: wait })
              : t("registration.resend")}
          </button>
          <button
            type="button"
            className={styles.link}
            onClick={() => dispatch({ type: "changePhone" })}
          >
            {t("registration.changePhone")}
          </button>
        </div>
      </form>
    );
  }

  const localText = local === null ? null : t(`registration.${local}`);
  // Without the notice in force there is nothing to accept: registration waits for it.
  const detailsError =
    localText ??
    fieldError("phone") ??
    fieldError("form") ??
    (notice.isError ? t("registration.unavailable") : null);
  return (
    <form className={styles.form} onSubmit={onDetails} noValidate>
      <p className={styles.note}>{t("registration.intro")}</p>
      <label className={styles.label} htmlFor={ids.phone}>
        {t("registration.phone")}{" "}
        <span className={styles.hint}>{t("registration.phoneHint")}</span>
      </label>
      <input
        id={ids.phone}
        className={styles.input}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={phone}
        aria-invalid={local === "phoneInvalid" || fieldError("phone") !== null}
        onChange={(event) => setPhone(event.target.value)}
      />
      <label className={styles.label} htmlFor={ids.name}>
        {t("registration.name")}{" "}
        <span className={styles.hint}>{t("registration.nameHint")}</span>
      </label>
      <input
        id={ids.name}
        className={styles.input}
        autoComplete="name"
        maxLength={60}
        value={name}
        aria-invalid={local === "nameRequired"}
        onChange={(event) => setName(event.target.value)}
      />
      <label className={styles.label} htmlFor={ids.email}>
        {t("registration.email")}
      </label>
      <input
        id={ids.email}
        className={styles.input}
        type="email"
        autoComplete="email"
        value={email}
        aria-invalid={local === "emailInvalid"}
        onChange={(event) => setEmail(event.target.value)}
      />
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={offers}
          onChange={(event) => setOffers(event.target.checked)}
        />
        {t("registration.offers")}
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={privacy}
          onChange={(event) => setPrivacy(event.target.checked)}
        />
        {t("registration.privacy")}
      </label>
      {notice.data && (
        <a
          className={styles.link}
          href={notice.data.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("registration.privacyLink")}
        </a>
      )}
      {detailsError && (
        <p id={ids.error} className={styles.error} role="alert">
          {detailsError}
        </p>
      )}
      <button
        type="submit"
        className={styles.primary}
        disabled={busy || notice.data === undefined}
      >
        {t("registration.sendCode")}
      </button>
    </form>
  );
}
