import { canAdminister, hrefOf, saveProblemOf, type SaveProblem } from "@miramenu/admin-core";
import type { Branch, SessionActor, UpdateBranchRequest } from "@miramenu/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAdminApi } from "../app/api-context";
import { callFailureOf } from "../app/failures";
import { keys } from "../app/keys";
import { LoadState } from "../app/LoadState";
import { t } from "../i18n";
import { AppLink } from "../ui/AppLink";
import controls from "../ui/controls.module.css";
import page from "../ui/page.module.css";
import { BranchForm, type BranchValues } from "./BranchForm";
import { QrCard } from "./QrCard";

/** Only what changed goes to the API; an emptied subdomain removes the branch's own. */
function changesOf(branch: Branch, values: BranchValues): UpdateBranchRequest | null {
  const subdomain = values.subdomain === "" ? null : values.subdomain;
  const update: UpdateBranchRequest = {
    ...(values.name === branch.name ? {} : { name: values.name }),
    ...(values.slug === branch.slug ? {} : { slug: values.slug }),
    ...(subdomain === branch.subdomain ? {} : { subdomain }),
  };
  return Object.keys(update).length === 0 ? null : update;
}

function BranchDetails({ branch, editable }: { branch: Branch; editable: boolean }) {
  const api = useAdminApi();
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<SaveProblem | null>(null);
  const save = useMutation({
    mutationFn: (update: UpdateBranchRequest) => api.updateBranch(branch.id, update),
    onSuccess: (updated) => {
      client.setQueryData(keys.branch(branch.id), updated);
      void client.invalidateQueries({ queryKey: keys.branches(branch.businessId) });
      setSaved(true);
      setEditing(false);
    },
    onError: (error) => setProblem(saveProblemOf(callFailureOf(error))),
  });

  return (
    <section className={`${controls.card} ${page.section}`} aria-labelledby="branch-details">
      <div className={page.sectionHeader}>
        <h2 id="branch-details" className={page.sectionTitle}>
          {t("branch.details")}
        </h2>
        {editable && !editing && (
          <button
            type="button"
            className={controls.secondary}
            onClick={() => {
              setSaved(false);
              setProblem(null);
              setEditing(true);
            }}
          >
            {t("branch.edit")}
          </button>
        )}
      </div>
      {saved && (
        <p className={controls.notice} role="status">
          {t("branch.saved")} {t("branch.aliasNote")}
        </p>
      )}
      {editing ? (
        <BranchForm
          initial={{ name: branch.name, slug: branch.slug, subdomain: branch.subdomain ?? "" }}
          submitLabel={t("common.save")}
          pending={save.isPending}
          problem={problem}
          onSubmit={(values) => {
            const update = changesOf(branch, values);
            if (update === null) return setEditing(false);
            setProblem(null);
            save.mutate(update);
          }}
          onCancel={() => setEditing(false)}
          onEdit={() => setProblem(null)}
        />
      ) : (
        <dl className={page.facts}>
          <div>
            <dt>{t("branch.address")}</dt>
            <dd>
              <a className={page.itemLink} href={branch.url} target="_blank" rel="noreferrer">
                {branch.url}
              </a>
            </dd>
          </div>
          <div>
            <dt>{t("branch.ownSubdomain")}</dt>
            <dd>{branch.subdomain ?? t("branch.usesBusinessSubdomain")}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}

/** A branch: its addresses and its QR code; its business's admin changes them. */
export function BranchScreen({ actor, branchId }: { actor: SessionActor; branchId: string }) {
  const api = useAdminApi();
  const branch = useQuery({ queryKey: keys.branch(branchId), queryFn: () => api.branch(branchId) });
  const businessId = branch.data?.businessId;
  const business = useQuery({
    queryKey: keys.business(businessId ?? ""),
    queryFn: () => api.business(businessId ?? ""),
    enabled: businessId !== undefined,
  });
  if (branch.data === undefined) return <LoadState query={branch} loading={t("branch.loading")} />;
  return (
    <main className={page.page}>
      <AppLink className={page.back} href={hrefOf({ screen: "business", businessId: branch.data.businessId })}>
        {business.data === undefined ? t("common.backToBusiness") : t("common.backTo", { name: business.data.name })}
      </AppLink>
      <h1 className={page.title}>{branch.data.name}</h1>
      <div className={page.columns}>
        <BranchDetails branch={branch.data} editable={canAdminister(actor, branch.data.businessId)} />
        <QrCard branch={branch.data} businessName={business.data?.name} />
      </div>
    </main>
  );
}
