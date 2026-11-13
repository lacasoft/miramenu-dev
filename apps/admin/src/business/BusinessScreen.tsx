import { canAdminister, hrefOf } from "@miramenu/admin-core";
import type { SessionActor } from "@miramenu/contracts";
import { useQuery } from "@tanstack/react-query";
import { useAdminApi } from "../app/api-context";
import { keys } from "../app/keys";
import { LoadState } from "../app/LoadState";
import { t } from "../i18n";
import { AppLink } from "../ui/AppLink";
import controls from "../ui/controls.module.css";
import page from "../ui/page.module.css";
import { BranchesSection } from "./BranchesSection";
import { ModerationCard } from "../moderation/ModerationCard";
import { BusinessDetails } from "./BusinessDetails";

/** A business: its data, its branches, its menu and, for its admin, the way to its team. */
export function BusinessScreen({ actor, businessId }: { actor: SessionActor; businessId: string }) {
  const api = useAdminApi();
  const business = useQuery({
    queryKey: keys.business(businessId),
    queryFn: () => api.business(businessId),
  });
  if (business.data === undefined) return <LoadState query={business} loading={t("business.loading")} />;
  const administer = canAdminister(actor, businessId);
  return (
    <main className={page.page}>
      <AppLink className={page.back} href="/">
        {t("common.backHome")}
      </AppLink>
      <h1 className={page.title}>{business.data.name}</h1>
      <div className={page.columns}>
        <BusinessDetails business={business.data} editable={administer} />
        <BranchesSection businessId={businessId} editable={administer} />
        <section className={`${controls.card} ${page.section}`} aria-labelledby="business-menu">
          <h2 id="business-menu" className={page.sectionTitle}>
            {t("business.menu")}
          </h2>
          <p className={page.hint}>{t("business.menuDescription")}</p>
          <AppLink className={controls.secondary} href={hrefOf({ screen: "menu", businessId })}>
            {t(administer ? "business.openMenu" : "business.viewMenu")}
          </AppLink>
        </section>
        {administer && (
          <section className={`${controls.card} ${page.section}`} aria-labelledby="dashboard-card">
            <h2 id="dashboard-card" className={page.sectionTitle}>
              {t("dashboard.card")}
            </h2>
            <p className={page.hint}>{t("dashboard.cardDescription")}</p>
            <AppLink className={controls.secondary} href={hrefOf({ screen: "businessDashboard", businessId })}>
              {t("dashboard.open")}
            </AppLink>
          </section>
        )}
        {administer && (
          <ModerationCard
            queueKey={keys.moderation("business", businessId)}
            load={(client) => client.businessModeration(businessId)}
            href={hrefOf({ screen: "businessModeration", businessId })}
          />
        )}
        {administer && (
          <section className={`${controls.card} ${page.section}`} aria-labelledby="business-team">
            <h2 id="business-team" className={page.sectionTitle}>
              {t("business.team")}
            </h2>
            <p className={page.hint}>{t("business.teamDescription")}</p>
            <AppLink className={controls.secondary} href={hrefOf({ screen: "team", businessId })}>
              {t("business.openTeam")}
            </AppLink>
          </section>
        )}
      </div>
    </main>
  );
}
