import { accessOf, type BusinessAccess } from "@miramenu/admin-core";
import type { SessionActor } from "@miramenu/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useAdminApi } from "../app/api-context";
import { t } from "../i18n";
import controls from "../ui/controls.module.css";
import styles from "./HomeScreen.module.css";

const SKELETONS = 4;

function accessText(access: BusinessAccess | undefined): string | null {
  if (access === undefined) return null;
  if (access.administers) return t("home.administers");
  const count = access.branchIds.length;
  return count === 1 ? t("home.branches.one") : t("home.branches.other", { count });
}

/** Where this person has access, by business, with what they hold in each. */
export function HomeScreen({ actor }: { actor: SessionActor }) {
  const api = useAdminApi();
  const businesses = useInfiniteQuery({
    queryKey: ["admin-businesses"],
    queryFn: ({ pageParam }) => api.businesses(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const access = new Map(accessOf(actor).map((each) => [each.businessId, each]));
  const items = businesses.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <main className={styles.home} aria-busy={businesses.isPending || undefined}>
      <h1 className={styles.title}>{t("home.title")}</h1>
      {actor.isSuperadmin && <p className={styles.note}>{t("home.superadmin")}</p>}
      {businesses.isPending ? (
        <>
          <p className="visually-hidden" role="status">
            {t("home.loading")}
          </p>
          <ul className={styles.list} aria-hidden="true">
            {Array.from({ length: SKELETONS }, (_, index) => (
              <li key={index} className={`${controls.card} ${styles.skeleton}`} />
            ))}
          </ul>
        </>
      ) : businesses.isError && items.length === 0 ? (
        <>
          <p className={controls.problem} role="alert">
            {t("home.failed")}
          </p>
          <button type="button" className={`${controls.secondary} ${styles.more}`} onClick={() => void businesses.refetch()}>
            {t("status.retry")}
          </button>
        </>
      ) : items.length === 0 ? (
        <p className={styles.note}>{t("home.empty")}</p>
      ) : (
        <>
          <ul className={styles.list}>
            {items.map((business) => {
              const said = accessText(access.get(business.id));
              return (
                <li key={business.id} className={`${controls.card} ${styles.business}`}>
                  <h2 className={styles.name}>{business.name}</h2>
                  <p className={styles.subdomain}>{business.subdomain}</p>
                  {said !== null && <p className={styles.access}>{said}</p>}
                </li>
              );
            })}
          </ul>
          {businesses.hasNextPage && (
            <button
              type="button"
              className={`${controls.secondary} ${styles.more}`}
              disabled={businesses.isFetchingNextPage}
              onClick={() => void businesses.fetchNextPage()}
            >
              {t("home.loadMore")}
            </button>
          )}
        </>
      )}
    </main>
  );
}
