import { conflictKeyOf, publicationOf } from "@miramenu/admin-core";
import type {
  Branch,
  BusinessMenuDraft,
  Publication,
  PublicationConflict,
  PublishBusinessMenuRequest,
} from "@miramenu/contracts";
import { formatPrice } from "@miramenu/i18n";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAdminApi } from "../app/api-context";
import { keys } from "../app/keys";
import { allBranchesOf } from "../team/team-data";
import { t } from "../i18n";
import controls from "../ui/controls.module.css";
import page from "../ui/page.module.css";
import styles from "./menu.module.css";
import { publishProblemText, usePublication } from "./use-publication";

function doneText({ version, menus }: Publication): string {
  if (menus.length === 0) return t("publish.done.none", { version });
  if (menus.length === 1) return t("publish.done.one", { version });
  return t("publish.done.other", { version, count: menus.length });
}

function conflictText(
  conflict: PublicationConflict,
  draft: BusinessMenuDraft,
  branches: readonly Branch[],
): string {
  const branch =
    branches.find((each) => each.id === conflict.branchId)?.name ??
    t("publish.unknownBranch");
  if (conflict.reason === "dish_removed")
    return t("publish.conflict.removed", { branch, dish: conflict.dishName });
  const dish = draft.dishes.find((each) => each.id === conflict.dishId);
  const price =
    dish === undefined ? "—" : formatPrice(dish.priceCents, dish.currency);
  return t("publish.conflict.price", {
    branch,
    dish: conflict.dishName,
    price,
  });
}

/** The branch adjustments this draft would overwrite, each one to confirm. */
function ConflictList({
  draft,
  businessId,
  confirmed,
  missing,
  onToggle,
}: {
  draft: BusinessMenuDraft;
  businessId: string;
  confirmed: ReadonlySet<string>;
  missing: boolean;
  onToggle: (key: string) => void;
}) {
  const api = useAdminApi();
  // The branches only name them: without them a conflict still says what it overwrites.
  const branches = useQuery({
    queryKey: keys.allBranches(businessId),
    queryFn: () => allBranchesOf(api, businessId),
  });
  const count = draft.conflicts.length;
  return (
    <fieldset
      className={styles.confirmations}
      aria-describedby={missing ? "publish-missing" : undefined}
    >
      <legend>
        {count === 1
          ? t("publish.conflicts.one")
          : t("publish.conflicts.other", { count })}
      </legend>
      {draft.conflicts.map((conflict) => {
        const key = conflictKeyOf(conflict);
        return (
          <label key={key} className={styles.check}>
            <input
              type="checkbox"
              checked={confirmed.has(key)}
              onChange={() => onToggle(key)}
            />
            <span>{conflictText(conflict, draft, branches.data ?? [])}</span>
          </label>
        );
      })}
      {missing && (
        <p id="publish-missing" className={controls.problem} role="alert">
          {t("publish.confirmAll")}
        </p>
      )}
    </fieldset>
  );
}

/**
 * Publishing the base menu to every branch (ADR-0036): the admin reviews what it would
 * overwrite and confirms each conflict. The idempotency key stays with its request until
 * it goes out, so a retry after a lost answer never publishes twice.
 */
export function PublishSection({
  businessId,
  draft,
  editable,
}: {
  businessId: string;
  draft: BusinessMenuDraft;
  editable: boolean;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [confirmed, setConfirmed] = useState<ReadonlySet<string>>(new Set());
  const [tried, setTried] = useState(false);
  const publication = usePublication({
    draftKey: keys.menuDraft(businessId),
    publish: (api, request: PublishBusinessMenuRequest, key) => api.publishBusinessMenu(businessId, request, key),
    onPublished: () => {
      setReviewing(false);
      setConfirmed(new Set());
    },
  });
  const { request, missing } = publicationOf(draft, confirmed);

  const submit = () => {
    setTried(true);
    if (publication.pending) return;
    publication.reset();
    // Said already in the review: the menu needs its profile's name.
    if (draft.profile === null) return;
    if (missing > 0) return;
    publication.submit(request);
  };
  const toggle = (key: string) =>
    setConfirmed((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <section
      className={`${controls.card} ${page.section}`}
      aria-labelledby="menu-publish"
    >
      <h2 id="menu-publish" className={page.sectionTitle}>
        {t("publish.title")}
      </h2>
      <p>
        {draft.publishedVersion === null
          ? t("publish.never")
          : t("publish.version", { version: draft.publishedVersion })}
      </p>
      {publication.done !== null && (
        <p className={controls.notice} role="status">
          {doneText(publication.done)}
        </p>
      )}
      {editable && !reviewing && (
        <>
          <p className={page.hint}>{t("publish.description")}</p>
          <button
            type="button"
            className={`${controls.primary} ${styles.start}`}
            onClick={() => {
              publication.reset();
              setTried(false);
              setReviewing(true);
            }}
          >
            {t("publish.review")}
          </button>
        </>
      )}
      {editable && reviewing && (
        <div className={page.form}>
          <p className={page.hint}>{t("publish.description")}</p>
          {draft.profile === null && (
            <p className={controls.problem}>{t("publish.noProfile")}</p>
          )}
          {draft.conflicts.length > 0 && (
            <ConflictList
              draft={draft}
              businessId={businessId}
              confirmed={confirmed}
              missing={tried && missing > 0}
              onToggle={toggle}
            />
          )}
          {publication.problem !== null && (
            <p className={controls.problem} role="alert">
              {publishProblemText(publication.problem)}
            </p>
          )}
          <div className={page.actions}>
            <button
              type="button"
              className={controls.primary}
              disabled={publication.pending}
              onClick={submit}
            >
              {t(publication.pending ? "publish.submitting" : "publish.submit")}
            </button>
            <button
              type="button"
              className={controls.secondary}
              onClick={() => setReviewing(false)}
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
