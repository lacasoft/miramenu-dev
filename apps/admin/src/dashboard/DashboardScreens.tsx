import { hrefOf } from "@miramenu/admin-core";
import type { BranchMenuDraft, BusinessMenuDraft } from "@miramenu/contracts";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useAdminApi } from "../app/api-context";
import { keys } from "../app/keys";
import { LoadState } from "../app/LoadState";
import { navigate } from "../platform/location";
import { allBranchesOf } from "../team/team-data";
import { t } from "../i18n";
import { AppLink } from "../ui/AppLink";
import { SelectField } from "../ui/Field";
import page from "../ui/page.module.css";
import styles from "./Dashboard.module.css";
import { DashboardView } from "./DashboardView";

/**
 * Each dish's name by id: the base menu's, and each branch's own. The figures only carry
 * ids; a dish none of these drafts has is one that left the menu.
 */
function namesOf(
  base: BusinessMenuDraft | undefined,
  branches: readonly (BranchMenuDraft | undefined)[],
) {
  return new Map([
    ...(base?.dishes ?? []).map((dish) => [dish.id, dish.name] as const),
    ...branches.flatMap((draft) =>
      (draft?.dishes ?? []).map((dish) => [dish.id, dish.name] as const),
    ),
  ]);
}

/** The business's figures grouped over every branch: its admin and the superadmin. */
export function BusinessDashboardScreen({
  businessId,
}: {
  businessId: string;
}) {
  const api = useAdminApi();
  const business = useQuery({
    queryKey: keys.business(businessId),
    queryFn: () => api.business(businessId),
  });
  const base = useQuery({
    queryKey: keys.menuDraft(businessId),
    queryFn: () => api.menuDraft(businessId),
  });
  const branches = useQuery({
    queryKey: keys.allBranches(businessId),
    queryFn: () => allBranchesOf(api, businessId),
  });
  const drafts = useQueries({
    queries: (branches.data ?? []).map((branch) => ({
      queryKey: keys.branchMenuDraft(branch.id),
      queryFn: () => api.branchMenuDraft(branch.id),
    })),
  });
  if (business.data === undefined)
    return <LoadState query={business} loading={t("dashboard.loading")} />;
  return (
    <main className={page.page}>
      <AppLink
        className={page.back}
        href={hrefOf({ screen: "business", businessId })}
      >
        {t("common.backTo", { name: business.data.name })}
      </AppLink>
      <h1 className={page.title}>
        {t("dashboard.title", { name: business.data.name })}
      </h1>
      <DashboardView
        queryKey={["admin-metrics", "business", businessId]}
        load={(client, period) => client.businessMetrics(businessId, period)}
        names={namesOf(
          base.data,
          drafts.map((each) => each.data),
        )}
        scope={
          (branches.data?.length ?? 0) > 0 && (
            <div className={styles.scope}>
              <SelectField
                label={t("dashboard.scope")}
                value=""
                onChange={(event) =>
                  navigate(
                    hrefOf({
                      screen: "branchDashboard",
                      branchId: event.target.value,
                    }),
                  )
                }
              >
                <option value="">{t("dashboard.wholeBusiness")}</option>
                {branches.data?.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </SelectField>
            </div>
          )
        }
      />
    </main>
  );
}

/** One branch's figures: its own admin, its business's admin and the superadmin. */
export function BranchDashboardScreen({ branchId }: { branchId: string }) {
  const api = useAdminApi();
  const branch = useQuery({
    queryKey: keys.branch(branchId),
    queryFn: () => api.branch(branchId),
  });
  const businessId = branch.data?.businessId ?? "";
  const base = useQuery({
    queryKey: keys.menuDraft(businessId),
    queryFn: () => api.menuDraft(businessId),
    enabled: branch.data !== undefined,
  });
  const own = useQuery({
    queryKey: keys.branchMenuDraft(branchId),
    queryFn: () => api.branchMenuDraft(branchId),
  });
  if (branch.data === undefined)
    return <LoadState query={branch} loading={t("dashboard.loading")} />;
  return (
    <main className={page.page}>
      <AppLink
        className={page.back}
        href={hrefOf({ screen: "branch", branchId })}
      >
        {t("common.backTo", { name: branch.data.name })}
      </AppLink>
      <h1 className={page.title}>
        {t("dashboard.title", { name: branch.data.name })}
      </h1>
      <DashboardView
        queryKey={["admin-metrics", "branch", branchId]}
        load={(client, period) => client.branchMetrics(branchId, period)}
        names={namesOf(base.data, [own.data])}
      />
    </main>
  );
}
