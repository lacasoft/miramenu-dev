import type { AdminApi } from "@miramenu/api-client";
import type { ModerationPage } from "@miramenu/contracts";
import { useQuery, type QueryKey } from "@tanstack/react-query";
import { useAdminApi } from "../app/api-context";
import { t } from "../i18n";
import { AppLink } from "../ui/AppLink";
import controls from "../ui/controls.module.css";
import page from "../ui/page.module.css";

/**
 * The way to a moderation queue from its business or branch, with the notice of the
 * comments overdue (design: "aviso al admin de la sucursal y al del negocio"). Without
 * the count, the way is still there.
 */
export function ModerationCard({
  queueKey,
  load,
  href,
}: {
  queueKey: QueryKey;
  load: (api: AdminApi) => Promise<ModerationPage>;
  href: string;
}) {
  const api = useAdminApi();
  const summary = useQuery({
    queryKey: [...queueKey, "summary"],
    queryFn: () => load(api),
  });
  const overdue = summary.data?.overdueCount ?? 0;
  return (
    <section
      className={`${controls.card} ${page.section}`}
      aria-labelledby="moderation-card"
    >
      <h2 id="moderation-card" className={page.sectionTitle}>
        {t("moderation.card")}
      </h2>
      <p className={page.hint}>{t("moderation.cardDescription")}</p>
      {overdue > 0 && (
        <p className={controls.problem}>
          {overdue === 1
            ? t("moderation.overdue.one")
            : t("moderation.overdue.other", { count: overdue })}
        </p>
      )}
      <AppLink className={controls.secondary} href={href}>
        {t("moderation.open")}
      </AppLink>
    </section>
  );
}
