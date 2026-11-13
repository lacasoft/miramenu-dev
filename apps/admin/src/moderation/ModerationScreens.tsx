import { hrefOf } from "@miramenu/admin-core";
import { useQuery } from "@tanstack/react-query";
import { useAdminApi } from "../app/api-context";
import { keys } from "../app/keys";
import { LoadState } from "../app/LoadState";
import { allBranchesOf } from "../team/team-data";
import { t } from "../i18n";
import { AppLink } from "../ui/AppLink";
import page from "../ui/page.module.css";
import { ModerationQueue } from "./ModerationQueue";

/**
 * The comments of every branch of a business waiting for a moderator: its admin and the
 * superadmin (the API's `operate` on the business). Each one says its branch.
 */
export function BusinessModerationScreen({
  businessId,
}: {
  businessId: string;
}) {
  const api = useAdminApi();
  const business = useQuery({
    queryKey: keys.business(businessId),
    queryFn: () => api.business(businessId),
  });
  // The branches only name each comment's: without them the queue still works.
  const branches = useQuery({
    queryKey: keys.allBranches(businessId),
    queryFn: () => allBranchesOf(api, businessId),
  });
  if (business.data === undefined)
    return <LoadState query={business} loading={t("moderation.loading")} />;
  const names = new Map(
    (branches.data ?? []).map((branch) => [branch.id, branch.name]),
  );
  return (
    <main className={page.page}>
      <AppLink
        className={page.back}
        href={hrefOf({ screen: "business", businessId })}
      >
        {t("common.backTo", { name: business.data.name })}
      </AppLink>
      <h1 className={page.title}>
        {t("moderation.title", { name: business.data.name })}
      </h1>
      <p className={page.subtitle}>{t("moderation.note")}</p>
      <ModerationQueue
        queueKey={keys.moderation("business", businessId)}
        load={(client, query) => client.businessModeration(businessId, query)}
        branchNames={names}
      />
    </main>
  );
}

/** The comments of one branch waiting for a moderator: its own admin, its business's, the superadmin. */
export function BranchModerationScreen({ branchId }: { branchId: string }) {
  const api = useAdminApi();
  const branch = useQuery({
    queryKey: keys.branch(branchId),
    queryFn: () => api.branch(branchId),
  });
  if (branch.data === undefined)
    return <LoadState query={branch} loading={t("moderation.loading")} />;
  return (
    <main className={page.page}>
      <AppLink
        className={page.back}
        href={hrefOf({ screen: "branch", branchId })}
      >
        {t("common.backTo", { name: branch.data.name })}
      </AppLink>
      <h1 className={page.title}>
        {t("moderation.title", { name: branch.data.name })}
      </h1>
      <p className={page.subtitle}>{t("moderation.note")}</p>
      <ModerationQueue
        queueKey={keys.moderation("branch", branchId)}
        load={(client, query) => client.branchModeration(branchId, query)}
      />
    </main>
  );
}
