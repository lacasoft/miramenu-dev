import {
  emailProblemOf,
  hrefOf,
  nameProblemOf,
  saveProblemOf,
  subdomainProblemOf,
  type SaveProblem,
} from "@miramenu/admin-core";
import type { CreatedBusiness } from "@miramenu/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useAdminApi } from "../app/api-context";
import { callFailureOf } from "../app/failures";
import { keys } from "../app/keys";
import { fieldText, saveText, takenOn } from "../app/problems";
import { t } from "../i18n";
import { AppLink } from "../ui/AppLink";
import controls from "../ui/controls.module.css";
import { Field } from "../ui/Field";
import page from "../ui/page.module.css";

/** Mexico only today (RNF-06); the API already takes any two-letter country. */
const COUNTRY = "MX";

function createdText({ business, invitation }: CreatedBusiness): string {
  if (invitation === null) return t("newBusiness.createdExisting", { name: business.name });
  return invitation.sent
    ? t("newBusiness.created", { name: business.name })
    : t("newBusiness.createdNotSent", { name: business.name });
}

/** The superadmin gives a restaurant its place in Miramenu and its first admin (ADR-0020). */
export function NewBusinessScreen() {
  const api = useAdminApi();
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<SaveProblem | null>(null);
  const [created, setCreated] = useState<CreatedBusiness | null>(null);

  const problems = {
    name: nameProblemOf(name),
    subdomain: subdomainProblemOf(subdomain),
    adminName: nameProblemOf(adminName),
    adminEmail: emailProblemOf(adminEmail),
  };
  const shown = (field: keyof typeof problems) => (tried ? problems[field] : null);

  const create = useMutation({
    mutationFn: () =>
      api.createBusiness({
        name: name.trim(),
        country: COUNTRY,
        subdomain,
        admin: { name: adminName.trim(), email: adminEmail.trim() },
      }),
    onSuccess: (result) => {
      setCreated(result);
      void client.invalidateQueries({ queryKey: keys.businesses });
    },
    onError: (error) => setProblem(saveProblemOf(callFailureOf(error))),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (create.isPending || Object.values(problems).some((each) => each !== null)) return;
    setProblem(null);
    create.mutate();
  };

  const again = () => {
    for (const reset of [setName, setSubdomain, setAdminName, setAdminEmail]) reset("");
    setTried(false);
    setCreated(null);
  };

  return (
    <main className={page.page}>
      <AppLink className={page.back} href="/">
        {t("common.backHome")}
      </AppLink>
      <h1 className={page.title}>{t("newBusiness.title")}</h1>
      <section className={`${controls.card} ${page.section}`}>
        {created !== null ? (
          <>
            <p className={controls.notice} role="status">
              {createdText(created)}
            </p>
            <div className={page.actions}>
              <AppLink className={controls.primary} href={hrefOf({ screen: "business", businessId: created.business.id })}>
                {t("newBusiness.open", { name: created.business.name })}
              </AppLink>
              <button type="button" className={controls.secondary} onClick={again}>
                {t("newBusiness.another")}
              </button>
            </div>
          </>
        ) : (
          <form className={page.form} onSubmit={submit} noValidate>
            <p className={page.subtitle}>{t("newBusiness.description")}</p>
            <Field label={t("newBusiness.name")} value={name} error={fieldText("name", shown("name"))} onChange={(event) => setName(event.target.value)} />
            <Field
              label={t("newBusiness.subdomain")}
              hint={t("newBusiness.subdomainHint")}
              value={subdomain}
              autoCapitalize="none"
              spellCheck={false}
              error={fieldText("subdomain", shown("subdomain") ?? takenOn(problem, "subdomain"))}
              onChange={(event) => {
                setSubdomain(event.target.value.toLowerCase());
                setProblem(null);
              }}
            />
            <dl className={page.facts}>
              <div>
                <dt>{t("newBusiness.country")}</dt>
                <dd>{t("newBusiness.countryMexico")}</dd>
              </div>
            </dl>
            <h2 className={page.sectionTitle}>{t("newBusiness.admin")}</h2>
            <Field label={t("newBusiness.adminName")} value={adminName} error={fieldText("name", shown("adminName"))} onChange={(event) => setAdminName(event.target.value)} />
            <Field
              label={t("newBusiness.adminEmail")}
              type="email"
              value={adminEmail}
              error={fieldText("email", shown("adminEmail"))}
              onChange={(event) => setAdminEmail(event.target.value)}
            />
            {saveText(problem) !== null && (
              <p className={controls.problem} role="alert">
                {saveText(problem)}
              </p>
            )}
            <div className={page.actions}>
              <button type="submit" className={controls.primary} disabled={create.isPending}>
                {t(create.isPending ? "common.saving" : "newBusiness.submit")}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
