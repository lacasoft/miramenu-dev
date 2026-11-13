import { loadProblemOf } from "@miramenu/admin-core";
import type { UseQueryResult } from "@tanstack/react-query";
import { t } from "../i18n";
import { AppLink } from "../ui/AppLink";
import controls from "../ui/controls.module.css";
import { callFailureOf } from "./failures";
import { StatusScreen } from "./StatusScreen";

/**
 * A page's main data while it loads or when it could not: said, not only drawn (RNF-09).
 * 404 is outside the person's scope and 403 not theirs to see (ADR-0032); anything else
 * may work again, so it offers to retry.
 */
export function LoadState({ query, loading }: { query: UseQueryResult<unknown>; loading: string }) {
  if (query.isPending)
    return (
      <p role="status" aria-busy="true" className={controls.notice}>
        {loading}
      </p>
    );
  const problem = loadProblemOf(callFailureOf(query.error));
  if (problem === "unavailable")
    return (
      <StatusScreen
        kind="unavailable"
        inShell
        action={
          <button type="button" className={controls.primary} onClick={() => void query.refetch()}>
            {t("status.retry")}
          </button>
        }
      />
    );
  return (
    <StatusScreen
      kind={problem}
      inShell
      action={
        <AppLink className={controls.link} href="/">
          {t("notFound.home")}
        </AppLink>
      }
    />
  );
}
