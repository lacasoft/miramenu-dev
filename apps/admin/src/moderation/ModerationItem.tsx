import {
  moderationProblemOf,
  type ModerationProblem,
} from "@miramenu/admin-core";
import type { ModerationItem as Item } from "@miramenu/contracts";
import { formatRelativeTime } from "@miramenu/i18n";
import { useMutation } from "@tanstack/react-query";
import { useAdminApi } from "../app/api-context";
import { callFailureOf } from "../app/failures";
import { t } from "../i18n";
import controls from "../ui/controls.module.css";
import page from "../ui/page.module.css";
import styles from "./Moderation.module.css";

type Decision = "approve" | "reject";

/**
 * One comment waiting for a moderator: what dish it is about, who wrote it and when, and
 * its text, shown as text. The decision goes with the version read (ADR-0040).
 */
export function ModerationItem({
  item,
  branchName,
  now,
  onDecided,
  onRefused,
}: {
  item: Item;
  /** In a business's queue, the branch the comment was left in. */
  branchName: string | null;
  /** When the queue was read: "hace 3 horas" from then. */
  now: number;
  onDecided: (said: string) => void;
  onRefused: (problem: ModerationProblem) => void;
}) {
  const api = useAdminApi();
  const author =
    item.author.name === "" ? t("moderation.someone") : item.author.name;
  const decide = useMutation({
    mutationFn: (decision: Decision) =>
      decision === "approve"
        ? api.approveComment(item.id, item.version)
        : api.rejectComment(item.id, item.version),
    onSuccess: (_, decision) =>
      onDecided(
        t(
          decision === "approve"
            ? "moderation.approved"
            : "moderation.rejected",
          { author },
        ),
      ),
    onError: (error) => onRefused(moderationProblemOf(callFailureOf(error))),
  });
  return (
    <li className={page.item}>
      <h3 className={page.itemTitle}>
        {item.dishName === null
          ? t("moderation.aboutGone")
          : t("moderation.about", { dish: item.dishName })}
      </h3>
      <p className={page.hint}>
        {t("moderation.byWhen", {
          author,
          when: formatRelativeTime(item.submittedAt, now),
        })}
        {branchName !== null &&
          ` · ${t("moderation.atBranch", { branch: branchName })}`}
      </p>
      {item.overdue && <p className={styles.late}>{t("moderation.late")}</p>}
      <blockquote className={styles.text}>{item.text}</blockquote>
      <div className={page.actions}>
        <button
          type="button"
          className={controls.primary}
          aria-label={t("moderation.approveOf", { author })}
          disabled={decide.isPending}
          onClick={() => decide.mutate("approve")}
        >
          {t("moderation.approve")}
        </button>
        <button
          type="button"
          className={controls.secondary}
          aria-label={t("moderation.rejectOf", { author })}
          disabled={decide.isPending}
          onClick={() => decide.mutate("reject")}
        >
          {t("moderation.reject")}
        </button>
      </div>
    </li>
  );
}
