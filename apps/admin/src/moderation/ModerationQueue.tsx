import {
  loadProblemOf,
  rereadsQueue,
  type ModerationProblem,
} from "@miramenu/admin-core";
import type { AdminApi, ModerationQuery } from "@miramenu/api-client";
import type { ModerationPage } from "@miramenu/contracts";
import {
  useInfiniteQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { useState } from "react";
import { useAdminApi } from "../app/api-context";
import { callFailureOf } from "../app/failures";
import { t } from "../i18n";
import controls from "../ui/controls.module.css";
import page from "../ui/page.module.css";
import styles from "./Moderation.module.css";
import { ModerationItem } from "./ModerationItem";

const PROBLEM_TEXT = {
  changed: "moderation.problem.changed",
  gone: "moderation.problem.gone",
  forbidden: "moderation.problem.forbidden",
  unavailable: "moderation.problem.unavailable",
} as const;

interface Said {
  text: string;
  refused: boolean;
}

const overdueText = (count: number) =>
  count === 1
    ? t("moderation.overdue.one")
    : t("moderation.overdue.other", { count });

/**
 * A moderation queue (ADR-0040): the comments waiting, oldest first, a page at a time,
 * with how many are overdue and the choice to see only those. Every decision reads the
 * queue again: the decided comment leaves it, and one that changed shows as it is now.
 */
export function ModerationQueue({
  queueKey,
  load,
  branchNames,
}: {
  /** The queue's key; its pages and its summary live under it. */
  queueKey: QueryKey;
  load: (api: AdminApi, query: ModerationQuery) => Promise<ModerationPage>;
  /** In a business's queue, each branch's name by id. */
  branchNames?: ReadonlyMap<string, string>;
}) {
  const api = useAdminApi();
  const client = useQueryClient();
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [said, setSaid] = useState<Said | null>(null);
  const queue = useInfiniteQuery({
    queryKey: [...queueKey, overdueOnly ? "overdue" : "all"],
    queryFn: ({ pageParam }) =>
      load(api, { cursor: pageParam, overdue: overdueOnly }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const reread = () => client.invalidateQueries({ queryKey: queueKey });
  const decided = (text: string) => {
    setSaid({ text, refused: false });
    void reread();
  };
  const refused = (problem: ModerationProblem) => {
    setSaid({ text: t(PROBLEM_TEXT[problem]), refused: true });
    if (rereadsQueue(problem)) void reread();
  };

  if (queue.data === undefined) {
    if (queue.isPending)
      return (
        <p role="status" aria-busy="true" className={controls.notice}>
          {t("moderation.loading")}
        </p>
      );
    const problem = loadProblemOf(callFailureOf(queue.error));
    if (problem !== "unavailable")
      return (
        <p className={controls.problem} role="alert">
          {t(problem === "forbidden" ? "moderation.problem.forbidden" : "save.notFound")}
        </p>
      );
    return (
      <>
        <p className={controls.problem} role="alert">
          {t("moderation.failed")}
        </p>
        <button type="button" className={`${controls.secondary} ${styles.start}`} onClick={() => void queue.refetch()}>
          {t("status.retry")}
        </button>
      </>
    );
  }

  const items = queue.data.pages.flatMap((each) => each.items);
  const overdueCount = queue.data.pages[0]?.overdueCount ?? 0;
  const filter = (only: boolean, label: string) => (
    <button
      type="button"
      className={only === overdueOnly ? controls.primary : controls.secondary}
      aria-pressed={only === overdueOnly}
      onClick={() => {
        setSaid(null);
        setOverdueOnly(only);
      }}
    >
      {label}
    </button>
  );

  return (
    <section
      className={`${controls.card} ${page.section}`}
      aria-label={t("moderation.card")}
    >
      {overdueCount > 0 && (
        <p className={controls.problem}>{overdueText(overdueCount)}</p>
      )}
      <div
        className={page.actions}
        role="group"
        aria-label={t("moderation.filter")}
      >
        {filter(false, t("moderation.all"))}
        {filter(true, t("moderation.onlyOverdue"))}
      </div>
      {said !== null && (
        <p
          className={said.refused ? controls.problem : controls.notice}
          role={said.refused ? "alert" : "status"}
        >
          {said.text}
        </p>
      )}
      {items.length === 0 ? (
        <p className={page.hint}>
          {t(overdueOnly ? "moderation.emptyOverdue" : "moderation.empty")}
        </p>
      ) : (
        <ul className={page.list}>
          {items.map((item) => (
            <ModerationItem
              key={`${item.id}:${item.version}`}
              item={item}
              branchName={branchNames?.get(item.branchId) ?? null}
              now={queue.dataUpdatedAt}
              onDecided={decided}
              onRefused={refused}
            />
          ))}
        </ul>
      )}
      {queue.hasNextPage && (
        <button
          type="button"
          className={`${controls.secondary} ${styles.start}`}
          disabled={queue.isFetchingNextPage}
          onClick={() => void queue.fetchNextPage()}
        >
          {t("common.loadMore")}
        </button>
      )}
    </section>
  );
}
