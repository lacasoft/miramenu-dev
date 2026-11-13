import { canAdminister, currencyOf, hrefOf } from "@miramenu/admin-core";
import type { SessionActor } from "@miramenu/contracts";
import { useQuery } from "@tanstack/react-query";
import { useAdminApi } from "../app/api-context";
import { keys } from "../app/keys";
import { LoadState } from "../app/LoadState";
import { t } from "../i18n";
import { AppLink } from "../ui/AppLink";
import page from "../ui/page.module.css";
import { CategoriesSection } from "./CategoriesSection";
import styles from "./menu.module.css";
import { ProfileSection } from "./ProfileSection";
import { PublishSection } from "./PublishSection";

/**
 * The business's base menu: its draft (profile, categories and dishes) and its
 * publication. Its admin restaurante and the superadmin change it; its branch admins
 * read it, to adjust their branch (ADR-0036).
 */
export function MenuScreen({
  actor,
  businessId,
}: {
  actor: SessionActor;
  businessId: string;
}) {
  const api = useAdminApi();
  const business = useQuery({
    queryKey: keys.business(businessId),
    queryFn: () => api.business(businessId),
  });
  const draft = useQuery({
    queryKey: keys.menuDraft(businessId),
    queryFn: () => api.menuDraft(businessId),
  });
  if (business.data === undefined)
    return <LoadState query={business} loading={t("menu.loading")} />;
  if (draft.data === undefined)
    return <LoadState query={draft} loading={t("menu.loading")} />;
  const editable = canAdminister(actor, businessId);
  return (
    <main className={page.page}>
      <AppLink
        className={page.back}
        href={hrefOf({ screen: "business", businessId })}
      >
        {t("common.backTo", { name: business.data.name })}
      </AppLink>
      <h1 className={page.title}>
        {t("menu.title", { name: business.data.name })}
      </h1>
      <p className={page.subtitle}>
        {t(editable ? "menu.draftNote" : "menu.readOnly")}
      </p>
      <div className={styles.layout}>
        <div className={styles.aside}>
          <PublishSection
            businessId={businessId}
            draft={draft.data}
            editable={editable}
          />
          <ProfileSection
            businessId={businessId}
            profile={draft.data.profile}
            suggestedName={business.data.name}
            editable={editable}
          />
        </div>
        <CategoriesSection
          businessId={businessId}
          draft={draft.data}
          currency={currencyOf(business.data.country)}
          editable={editable}
        />
      </div>
    </main>
  );
}
