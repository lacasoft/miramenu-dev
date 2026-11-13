import {
  canOperateBranch,
  currencyOf,
  hrefOf,
  mediaPollIntervalOf,
  mediaStatesOf,
} from "@miramenu/admin-core";
import type { SessionActor } from "@miramenu/contracts";
import { useQuery } from "@tanstack/react-query";
import { useAdminApi } from "../app/api-context";
import { keys } from "../app/keys";
import { LoadState } from "../app/LoadState";
import { t } from "../i18n";
import { MediaProblemsSection } from "../menu/MediaProblemsSection";
import menu from "../menu/menu.module.css";
import { AppLink } from "../ui/AppLink";
import page from "../ui/page.module.css";
import { BranchDishesSection } from "./BranchDishesSection";
import { BranchProfileSection } from "./BranchProfileSection";
import { BranchPublishSection } from "./BranchPublishSection";

/**
 * A branch's menu (ADR-0036): its business's base draft with the branch's adjustments,
 * its own dishes, its profile and its publication. Its own admin, its business's admin
 * and the superadmin change it.
 */
export function BranchMenuScreen({
  actor,
  branchId,
}: {
  actor: SessionActor;
  branchId: string;
}) {
  const api = useAdminApi();
  const branch = useQuery({
    queryKey: keys.branch(branchId),
    queryFn: () => api.branch(branchId),
  });
  const businessId = branch.data?.businessId ?? "";
  const known = branch.data !== undefined;
  const business = useQuery({
    queryKey: keys.business(businessId),
    queryFn: () => api.business(businessId),
    enabled: known,
  });
  const base = useQuery({
    queryKey: keys.menuDraft(businessId),
    queryFn: () => api.menuDraft(businessId),
    enabled: known,
    refetchInterval: (query) =>
      mediaPollIntervalOf(query.state.data?.media ?? []),
  });
  const draft = useQuery({
    queryKey: keys.branchMenuDraft(branchId),
    queryFn: () => api.branchMenuDraft(branchId),
    // While a photo or video of its own is processing, read it again until it is ready.
    refetchInterval: (query) =>
      mediaPollIntervalOf(query.state.data?.media ?? []),
  });
  const loading = t("branchMenu.loading");
  if (branch.data === undefined)
    return <LoadState query={branch} loading={loading} />;
  if (draft.data === undefined)
    return <LoadState query={draft} loading={loading} />;
  if (business.data === undefined)
    return <LoadState query={business} loading={loading} />;
  if (base.data === undefined)
    return <LoadState query={base} loading={loading} />;
  const editable = canOperateBranch(actor, branch.data);
  const baseMedia = new Map(base.data.media.map((each) => [each.id, each]));

  return (
    <main className={page.page}>
      <AppLink
        className={page.back}
        href={hrefOf({ screen: "branch", branchId })}
      >
        {t("common.backTo", { name: branch.data.name })}
      </AppLink>
      <h1 className={page.title}>
        {t("branchMenu.title", { name: branch.data.name })}
      </h1>
      <p className={page.subtitle}>{t("branchMenu.note")}</p>
      <div className={menu.layout}>
        <div className={menu.aside}>
          <BranchPublishSection
            branchId={branchId}
            draft={draft.data}
            basePublished={base.data.publishedVersion !== null}
            editable={editable}
          />
          <BranchProfileSection
            branchId={branchId}
            branchName={branch.data.name}
            draft={draft.data}
            baseProfile={base.data.profile}
            baseMedia={baseMedia}
            editable={editable}
          />
          {editable && (
            <MediaProblemsSection
              queryKey={keys.branchMediaProblemsAt(
                branchId,
                mediaStatesOf(draft.data.media),
              )}
              list={(client, cursor) =>
                client.branchMediaProblems(branchId, cursor)
              }
              // The branch also sees its business's media; only its own are its to fix.
              only={(media) => media.branchId === branchId}
            />
          )}
        </div>
        <BranchDishesSection
          branchId={branchId}
          base={base.data}
          draft={draft.data}
          currency={currencyOf(business.data.country)}
          editable={editable}
        />
      </div>
    </main>
  );
}
