import type {
  BranchMenuDraft,
  PublishBranchMenuRequest,
} from "@miramenu/contracts";
import { useState } from "react";
import { keys } from "../app/keys";
import { t } from "../i18n";
import menu from "../menu/menu.module.css";
import { publishProblemText, usePublication } from "../menu/use-publication";
import controls from "../ui/controls.module.css";
import page from "../ui/page.module.css";

/**
 * Publishing the branch's adjustments and own dishes over its business's last published
 * base menu (ADR-0036). Before the business publishes one, there is nothing to publish over.
 */
export function BranchPublishSection({
  branchId,
  draft,
  basePublished,
  editable,
}: {
  branchId: string;
  draft: BranchMenuDraft;
  /** Whether the business has published its base menu yet. */
  basePublished: boolean;
  editable: boolean;
}) {
  const [reviewing, setReviewing] = useState(false);
  const publication = usePublication({
    draftKey: keys.branchMenuDraft(branchId),
    publish: (api, request: PublishBranchMenuRequest, key) =>
      api.publishBranchMenu(branchId, request, key),
    onPublished: () => setReviewing(false),
  });

  return (
    <section
      className={`${controls.card} ${page.section}`}
      aria-labelledby="branch-publish"
    >
      <h2 id="branch-publish" className={page.sectionTitle}>
        {t("publish.title")}
      </h2>
      <p>
        {draft.publishedVersion === null
          ? t("branchPublish.never")
          : t("branchPublish.version", { version: draft.publishedVersion })}
      </p>
      {publication.done !== null && (
        <p className={controls.notice} role="status">
          {t("branchPublish.done", { version: publication.done.version })}
        </p>
      )}
      {editable && !reviewing && (
        <>
          <p className={page.hint}>{t("branchPublish.description")}</p>
          <button
            type="button"
            className={`${controls.primary} ${menu.start}`}
            onClick={() => {
              publication.reset();
              setReviewing(true);
            }}
          >
            {t("publish.review")}
          </button>
        </>
      )}
      {editable && reviewing && (
        <div className={page.form}>
          <p className={page.hint}>{t("branchPublish.description")}</p>
          {!basePublished && (
            <p className={controls.problem}>{t("branchPublish.baseMissing")}</p>
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
              onClick={() => {
                // Said already in the review: there is no base menu to publish over.
                if (basePublished)
                  publication.submit({ draftVersion: draft.draftVersion });
              }}
            >
              {t(
                publication.pending
                  ? "publish.submitting"
                  : "branchPublish.confirm",
              )}
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
