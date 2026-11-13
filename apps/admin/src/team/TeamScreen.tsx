import { hrefOf } from "@miramenu/admin-core";
import type { SessionActor } from "@miramenu/contracts";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAdminApi } from "../app/api-context";
import { keys } from "../app/keys";
import { LoadState } from "../app/LoadState";
import { t } from "../i18n";
import { AppLink } from "../ui/AppLink";
import controls from "../ui/controls.module.css";
import page from "../ui/page.module.css";
import { InviteForm } from "./InviteForm";
import { MemberItem } from "./MemberItem";
import { allBranchesOf } from "./team-data";

/** Who administers the business and each branch (admin restaurante and superadmin only). */
export function TeamScreen({ actor, businessId }: { actor: SessionActor; businessId: string }) {
  const api = useAdminApi();
  const [inviting, setInviting] = useState(false);
  const [said, setSaid] = useState("");
  const business = useQuery({ queryKey: keys.business(businessId), queryFn: () => api.business(businessId) });
  const team = useInfiniteQuery({
    queryKey: keys.team(businessId),
    queryFn: ({ pageParam }) => api.team(businessId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const branches = useQuery({ queryKey: keys.allBranches(businessId), queryFn: () => allBranchesOf(api, businessId) });

  if (business.data === undefined) return <LoadState query={business} loading={t("team.loading")} />;
  if (team.data === undefined) return <LoadState query={team} loading={t("team.loading")} />;
  const members = team.data.pages.flatMap((each) => each.items);

  return (
    <main className={page.page}>
      <AppLink className={page.back} href={hrefOf({ screen: "business", businessId })}>
        {t("common.backTo", { name: business.data.name })}
      </AppLink>
      <h1 className={page.title}>{t("team.title", { name: business.data.name })}</h1>
      <section className={`${controls.card} ${page.section}`} aria-labelledby="team-members">
        <div className={page.sectionHeader}>
          <h2 id="team-members" className={page.sectionTitle}>
            {t("team.members")}
          </h2>
          {!inviting && (
            <button
              type="button"
              className={controls.primary}
              onClick={() => {
                setSaid("");
                setInviting(true);
              }}
            >
              {t("team.invite")}
            </button>
          )}
        </div>
        <p className={controls.notice} role="status" hidden={said === ""}>
          {said}
        </p>
        {inviting && (
          <InviteForm
            businessId={businessId}
            branches={branches.data ?? []}
            onDone={(text) => {
              setSaid(text);
              setInviting(false);
            }}
          />
        )}
        <ul className={page.list}>
          {members.map((user) => (
            <MemberItem
              key={user.id}
              businessId={businessId}
              user={user}
              branches={branches.data ?? []}
              isYou={user.id === actor.user.id}
              onSaid={setSaid}
            />
          ))}
        </ul>
        {team.hasNextPage && (
          <button type="button" className={controls.secondary} disabled={team.isFetchingNextPage} onClick={() => void team.fetchNextPage()}>
            {t("common.loadMore")}
          </button>
        )}
      </section>
    </main>
  );
}
