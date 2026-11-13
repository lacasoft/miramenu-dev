import { formatRelativeTime } from "@miramenu/i18n";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useAdminApi } from "../app/api-context";
import { keys } from "../app/keys";
import { t } from "../i18n";
import controls from "../ui/controls.module.css";
import page from "../ui/page.module.css";
import slot from "./MediaSlot.module.css";

/**
 * The business's photos and videos that failed or are stalled (design: Cae el worker,
 * "se avisa al admin"), newest first. Nothing to say, nothing shown: each slot of the menu
 * already tells the state of what it uses. Read again whenever a medium of the draft
 * changes state: the worker fails one long after its upload ended.
 */
export function MediaProblemsSection({
  businessId,
  states,
}: {
  businessId: string;
  /** The states of the draft's media (`mediaStatesOf`): a medium that fails is read again. */
  states: string;
}) {
  const api = useAdminApi();
  const problems = useInfiniteQuery({
    queryKey: keys.mediaProblemsAt(businessId, states),
    queryFn: ({ pageParam }) => api.mediaProblems(businessId, pageParam),
    initialPageParam: undefined as string | undefined,
    // The list stays while the next one is read, instead of blinking away.
    placeholderData: (previous) => previous,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = problems.data?.pages.flatMap((each) => each.items) ?? [];
  if (items.length === 0) return null;
  // When the list was read: "hace 3 horas" stays the same between renders.
  const now = problems.dataUpdatedAt;

  return (
    <section
      className={`${controls.card} ${page.section}`}
      aria-labelledby="menu-media-problems"
    >
      <h2 id="menu-media-problems" className={page.sectionTitle}>
        {t("mediaProblems.title")}
      </h2>
      <p className={page.hint}>{t("mediaProblems.description")}</p>
      <ul className={page.list}>
        {items.map((media) => (
          <li key={media.id} className={page.item}>
            <p className={page.itemTitle}>
              {t("mediaProblems.item", {
                kind: t(media.kind === "video" ? "media.video" : "media.photo"),
                when: formatRelativeTime(media.createdAt, now),
              })}
            </p>
            <p className={slot.trouble}>
              {media.status === "failed"
                ? t(`media.failed.${media.failureReason ?? "unknown"}`)
                : t("mediaProblems.stalled")}
            </p>
          </li>
        ))}
      </ul>
      {problems.hasNextPage && (
        <button
          type="button"
          className={controls.secondary}
          disabled={problems.isFetchingNextPage}
          onClick={() => void problems.fetchNextPage()}
        >
          {t("common.loadMore")}
        </button>
      )}
    </section>
  );
}
