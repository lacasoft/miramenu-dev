import {
  hrefOf,
  INVITATION_PATH,
  invitationProblemOf,
  invitationTokenOf,
  passwordProblemOf,
  SIGN_IN_PATH,
  type InvitationProblem,
} from "@miramenu/admin-core";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useAdminApi } from "../app/api-context";
import { callFailureOf } from "../app/failures";
import { t } from "../i18n";
import { navigate } from "../platform/location";
import controls from "../ui/controls.module.css";
import { Field } from "../ui/Field";
import styles from "./AuthScreen.module.css";

const PROBLEM_TEXT = {
  used: "invitation.used",
  expired: "invitation.expired",
  invalid: "invitation.invalid",
  unavailable: "invitation.unavailable",
} as const;

const PASSWORD_TEXT = {
  tooShort: "invitation.tooShort",
  tooLong: "invitation.tooLong",
  mismatch: "invitation.mismatch",
} as const;

/** Nothing more can be done with this invitation: it is the inviter's to send again. */
const isFinal = (problem: InvitationProblem | null) => problem === "used" || problem === "expired";

function ToSignIn() {
  return (
    <a
      className={controls.link}
      href={SIGN_IN_PATH}
      onClick={(event) => {
        event.preventDefault();
        navigate(SIGN_IN_PATH);
      }}
    >
      {t("invitation.toSignIn")}
    </a>
  );
}

/**
 * The invited admin sets their password (ADR-0023). The token comes in the link's
 * fragment and leaves the address bar at once, so it never stays in the history; it goes
 * to the API in the body (ADR-0033). No session opens: the admin signs in next.
 */
export function InvitationScreen() {
  const api = useAdminApi();
  const [token] = useState(() => invitationTokenOf(window.location.hash));
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<InvitationProblem | null>(null);

  useEffect(() => {
    if (window.location.hash !== "") window.history.replaceState(null, "", INVITATION_PATH);
  }, []);

  const accept = useMutation({
    mutationFn: (accepted: string) => api.acceptInvitation(accepted, password),
    onSuccess: () =>
      navigate(hrefOf({ screen: "signIn", next: null, notice: "invited" }), { replace: true }),
    onError: (error) => setProblem(invitationProblemOf(callFailureOf(error))),
  });

  const passwordProblem = tried ? passwordProblemOf(password, confirmation) : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (token === null || accept.isPending || passwordProblemOf(password, confirmation) !== null) return;
    setProblem(null);
    accept.mutate(token);
  };

  return (
    <main className={styles.screen}>
      <section className={`${controls.card} ${styles.card}`} aria-labelledby="invitation-title">
        <p className={styles.brand}>{t("app.title")}</p>
        <h1 id="invitation-title" className={styles.title}>
          {t("invitation.title")}
        </h1>
        {token === null ? (
          <>
            <p className={controls.problem} role="alert">
              {t("invitation.missing")}
            </p>
            <ToSignIn />
          </>
        ) : isFinal(problem) ? (
          <>
            <p className={controls.problem} role="alert">
              {t(PROBLEM_TEXT[problem as "used" | "expired"])}
            </p>
            <ToSignIn />
          </>
        ) : (
          <form className={styles.form} onSubmit={submit} noValidate>
            <p className={styles.description}>{t("invitation.description")}</p>
            <Field
              label={t("invitation.password")}
              type="password"
              autoComplete="new-password"
              required
              value={password}
              error={passwordProblem === "tooShort" || passwordProblem === "tooLong" ? t(PASSWORD_TEXT[passwordProblem]) : null}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Field
              label={t("invitation.confirmation")}
              type="password"
              autoComplete="new-password"
              required
              value={confirmation}
              error={passwordProblem === "mismatch" ? t(PASSWORD_TEXT.mismatch) : null}
              onChange={(event) => setConfirmation(event.target.value)}
            />
            {problem !== null && (
              <p className={controls.problem} role="alert">
                {t(PROBLEM_TEXT[problem])}
              </p>
            )}
            <button type="submit" className={controls.primary} disabled={accept.isPending}>
              {t(accept.isPending ? "invitation.submitting" : "invitation.submit")}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
