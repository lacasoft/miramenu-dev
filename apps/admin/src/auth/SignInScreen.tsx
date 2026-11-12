import { secondsUntil, signInProblemOf, type AdminRoute, type SignInProblem } from "@miramenu/admin-core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useAdminApi } from "../app/api-context";
import { callFailureOf } from "../app/failures";
import { SESSION_KEY } from "../app/query-client";
import { useSession } from "../app/session";
import { t } from "../i18n";
import { navigate } from "../platform/location";
import controls from "../ui/controls.module.css";
import { Field } from "../ui/Field";
import styles from "./AuthScreen.module.css";

type SignInRoute = Extract<AdminRoute, { screen: "signIn" }>;

/** The clock, ticking each second only while a wait is on. */
function useClock(ticking: boolean): [number, (now: number) => void] {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [ticking]);
  return [now, setNow];
}

function problemText(problem: SignInProblem, now: number): string | null {
  switch (problem.reason) {
    case "invalidCredentials":
      return t("signIn.invalidCredentials");
    case "wait": {
      const seconds = secondsUntil(problem.until, now);
      return seconds > 0 ? t("signIn.wait", { seconds }) : null;
    }
    case "invalid":
      return t("signIn.invalid");
    case "unavailable":
      return t("signIn.unavailable");
  }
}

/** Email and password; afterwards, back to where the admin was going. */
export function SignInScreen({ route }: { route: SignInRoute }) {
  const api = useAdminApi();
  const client = useQueryClient();
  const session = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<SignInProblem | null>(null);
  const [now, setNow] = useClock(problem?.reason === "wait");
  const waiting = problem?.reason === "wait" && secondsUntil(problem.until, now) > 0;
  const destination = route.next ?? "/";

  // Already signed in (another tab, a bookmark): straight to where they were going.
  useEffect(() => {
    if (session.data) navigate(destination, { replace: true });
  }, [session.data, destination]);

  const signIn = useMutation({
    mutationFn: () => api.signIn({ email: email.trim(), password }),
    onSuccess: () => {
      client.removeQueries({ queryKey: SESSION_KEY });
      navigate(destination, { replace: true });
    },
    onError: (error) => {
      const at = Date.now();
      setNow(at);
      setProblem(signInProblemOf(callFailureOf(error), at));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (signIn.isPending || waiting) return;
    setProblem(null);
    signIn.mutate();
  };

  const said = problem === null ? null : problemText(problem, now);
  return (
    <main className={styles.screen}>
      <section className={`${controls.card} ${styles.card}`} aria-labelledby="sign-in-title">
        <p className={styles.brand}>{t("app.title")}</p>
        <h1 id="sign-in-title" className={styles.title}>
          {t("signIn.title")}
        </h1>
        {route.notice !== null && (
          <p className={controls.notice} role="status">
            {t(route.notice === "ended" ? "signIn.ended" : "signIn.invited")}
          </p>
        )}
        <form className={styles.form} onSubmit={submit} noValidate>
          <Field
            label={t("signIn.email")}
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Field
            label={t("signIn.password")}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {said !== null && (
            <p className={controls.problem} role="alert">
              {said}
            </p>
          )}
          <button
            type="submit"
            className={controls.primary}
            disabled={signIn.isPending || waiting || email.trim() === "" || password === ""}
          >
            {t(signIn.isPending ? "signIn.submitting" : "signIn.submit")}
          </button>
        </form>
      </section>
    </main>
  );
}
