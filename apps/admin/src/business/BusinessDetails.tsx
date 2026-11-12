import { nameProblemOf, saveProblemOf, subdomainProblemOf, type SaveProblem } from "@miramenu/admin-core";
import type { Business, UpdateBusinessRequest } from "@miramenu/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useAdminApi } from "../app/api-context";
import { callFailureOf } from "../app/failures";
import { keys } from "../app/keys";
import { fieldText, saveText, takenOn } from "../app/problems";
import { t } from "../i18n";
import controls from "../ui/controls.module.css";
import { Field } from "../ui/Field";
import page from "../ui/page.module.css";

/** Only what changed goes to the API; nothing changed is nothing to send. */
function changesOf(business: Business, name: string, subdomain: string): UpdateBusinessRequest | null {
  const update: UpdateBusinessRequest = {
    ...(name.trim() === business.name ? {} : { name: name.trim() }),
    ...(subdomain === business.subdomain ? {} : { subdomain }),
  };
  return Object.keys(update).length === 0 ? null : update;
}

function BusinessForm({ business, onDone }: { business: Business; onDone: (saved: boolean) => void }) {
  const api = useAdminApi();
  const client = useQueryClient();
  const [name, setName] = useState(business.name);
  const [subdomain, setSubdomain] = useState(business.subdomain);
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<SaveProblem | null>(null);
  const problems = { name: nameProblemOf(name), subdomain: subdomainProblemOf(subdomain) };

  const save = useMutation({
    mutationFn: (update: UpdateBusinessRequest) => api.updateBusiness(business.id, update),
    onSuccess: (updated) => {
      client.setQueryData(keys.business(business.id), updated);
      void client.invalidateQueries({ queryKey: keys.businesses });
      onDone(true);
    },
    onError: (error) => setProblem(saveProblemOf(callFailureOf(error))),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (save.isPending || problems.name !== null || problems.subdomain !== null) return;
    const update = changesOf(business, name, subdomain);
    if (update === null) return onDone(false);
    setProblem(null);
    save.mutate(update);
  };

  return (
    <form className={page.form} onSubmit={submit} noValidate>
      <Field label={t("business.name")} value={name} error={fieldText("name", tried ? problems.name : null)} onChange={(event) => setName(event.target.value)} />
      <Field
        label={t("business.subdomain")}
        hint={t("business.aliasNote")}
        value={subdomain}
        autoCapitalize="none"
        spellCheck={false}
        error={fieldText("subdomain", (tried ? problems.subdomain : null) ?? takenOn(problem, "subdomain"))}
        onChange={(event) => {
          setSubdomain(event.target.value.toLowerCase());
          setProblem(null);
        }}
      />
      {saveText(problem) !== null && (
        <p className={controls.problem} role="alert">
          {saveText(problem)}
        </p>
      )}
      <div className={page.actions}>
        <button type="submit" className={controls.primary} disabled={save.isPending}>
          {t(save.isPending ? "common.saving" : "common.save")}
        </button>
        <button type="button" className={controls.secondary} onClick={() => onDone(false)}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

/** The business's name and subdomain; its admin and the superadmin may change them. */
export function BusinessDetails({ business, editable }: { business: Business; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <section className={`${controls.card} ${page.section}`} aria-labelledby="business-details">
      <div className={page.sectionHeader}>
        <h2 id="business-details" className={page.sectionTitle}>
          {t("business.details")}
        </h2>
        {editable && !editing && (
          <button
            type="button"
            className={controls.secondary}
            onClick={() => {
              setSaved(false);
              setEditing(true);
            }}
          >
            {t("business.edit")}
          </button>
        )}
      </div>
      {saved && (
        <p className={controls.notice} role="status">
          {t("business.saved")}
        </p>
      )}
      {editing ? (
        <BusinessForm
          business={business}
          onDone={(didSave) => {
            setSaved(didSave);
            setEditing(false);
          }}
        />
      ) : (
        <dl className={page.facts}>
          <div>
            <dt>{t("business.name")}</dt>
            <dd>{business.name}</dd>
          </div>
          <div>
            <dt>{t("business.subdomain")}</dt>
            <dd>{business.subdomain}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
