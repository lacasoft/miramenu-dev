import { hrefOf, saveProblemOf, type SaveProblem } from "@miramenu/admin-core";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAdminApi } from "../app/api-context";
import { callFailureOf } from "../app/failures";
import { keys } from "../app/keys";
import { BranchForm, type BranchValues } from "../branch/BranchForm";
import { t } from "../i18n";
import { AppLink } from "../ui/AppLink";
import controls from "../ui/controls.module.css";
import page from "../ui/page.module.css";

/** The branches this person reaches; the business's admin also creates them. */
export function BranchesSection({ businessId, editable }: { businessId: string; editable: boolean }) {
  const api = useAdminApi();
  const client = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [problem, setProblem] = useState<SaveProblem | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const branches = useInfiniteQuery({
    queryKey: keys.branches(businessId),
    queryFn: ({ pageParam }) => api.branches(businessId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const create = useMutation({
    mutationFn: ({ name, slug, subdomain }: BranchValues) =>
      api.createBranch(businessId, { name, slug, ...(subdomain === "" ? {} : { subdomain }) }),
    onSuccess: (branch) => {
      setCreated(branch.name);
      setCreating(false);
      void client.invalidateQueries({ queryKey: keys.branches(businessId) });
    },
    onError: (error) => setProblem(saveProblemOf(callFailureOf(error))),
  });
  const items = branches.data?.pages.flatMap((each) => each.items) ?? [];

  return (
    <section className={`${controls.card} ${page.section}`} aria-labelledby="business-branches">
      <div className={page.sectionHeader}>
        <h2 id="business-branches" className={page.sectionTitle}>
          {t("business.branches")}
        </h2>
        {editable && !creating && (
          <button
            type="button"
            className={controls.secondary}
            onClick={() => {
              setCreated(null);
              setProblem(null);
              setCreating(true);
            }}
          >
            {t("business.newBranch")}
          </button>
        )}
      </div>
      {created !== null && (
        <p className={controls.notice} role="status">
          {t("branch.created", { name: created })}
        </p>
      )}
      {creating && (
        <BranchForm
          submitLabel={t("branch.create")}
          pending={create.isPending}
          problem={problem}
          onSubmit={(values) => {
            setProblem(null);
            create.mutate(values);
          }}
          onCancel={() => setCreating(false)}
          onEdit={() => setProblem(null)}
        />
      )}
      {branches.isPending ? (
        <p className={page.hint} role="status">
          {t("branch.loading")}
        </p>
      ) : branches.isError && items.length === 0 ? (
        <>
          <p className={controls.problem} role="alert">
            {t("save.unavailable")}
          </p>
          <button type="button" className={controls.secondary} onClick={() => void branches.refetch()}>
            {t("status.retry")}
          </button>
        </>
      ) : items.length === 0 ? (
        <p className={page.hint}>{t("business.noBranches")}</p>
      ) : (
        <ul className={page.list}>
          {items.map((branch) => (
            <li key={branch.id} className={page.item}>
              <h3 className={page.itemTitle}>
                <AppLink className={page.itemLink} href={hrefOf({ screen: "branch", branchId: branch.id })}>
                  {branch.name}
                </AppLink>
              </h3>
              <p className={page.hint}>{branch.url}</p>
            </li>
          ))}
        </ul>
      )}
      {branches.hasNextPage && (
        <button
          type="button"
          className={controls.secondary}
          disabled={branches.isFetchingNextPage}
          onClick={() => void branches.fetchNextPage()}
        >
          {t("common.loadMore")}
        </button>
      )}
    </section>
  );
}
