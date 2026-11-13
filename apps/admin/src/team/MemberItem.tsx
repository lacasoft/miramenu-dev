import {
  roleChoiceOf,
  roleChoiceProblemOf,
  roleTargetsOf,
  saveProblemOf,
  type RoleChoice,
  type SaveProblem,
} from "@miramenu/admin-core";
import type { Branch, BusinessUser } from "@miramenu/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAdminApi } from "../app/api-context";
import { callFailureOf } from "../app/failures";
import { keys } from "../app/keys";
import { saveText } from "../app/problems";
import { t } from "../i18n";
import controls from "../ui/controls.module.css";
import page from "../ui/page.module.css";
import { RoleFields } from "./RoleFields";

function roleText(choice: RoleChoice | null, branches: readonly Branch[]): string {
  if (choice === null) return t("team.role.none");
  if (choice.kind === "business") return t("team.role.business");
  const names = choice.branchIds.map((id) => branches.find((branch) => branch.id === id)?.name ?? t("team.unknownBranch"));
  return t("team.role.branches", { branches: names.join(", ") });
}

type Action = "idle" | "role" | "remove";

/**
 * One person of the team, with what can be done about them. Your own row has no actions:
 * taking away your own role would lock you out of this team.
 */
export function MemberItem({
  businessId,
  user,
  branches,
  isYou,
  onSaid,
}: {
  businessId: string;
  user: BusinessUser;
  branches: readonly Branch[];
  isYou: boolean;
  onSaid: (said: string) => void;
}) {
  const api = useAdminApi();
  const client = useQueryClient();
  const current = roleChoiceOf(user, businessId);
  const [action, setAction] = useState<Action>("idle");
  const [choice, setChoice] = useState<RoleChoice>(current ?? { kind: "business" });
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<SaveProblem | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: keys.team(businessId) });
  const failed = (error: unknown) => setProblem(saveProblemOf(callFailureOf(error)));

  const setRoles = useMutation({
    mutationFn: () => api.setRoles(businessId, user.id, roleTargetsOf(choice)),
    onSuccess: () => {
      setAction("idle");
      onSaid(t("team.roleSaved", { name: user.name }));
      void refresh();
    },
    onError: failed,
  });
  const remove = useMutation({
    mutationFn: () => api.removeRoles(businessId, user.id),
    onSuccess: () => {
      onSaid(t("team.removed", { name: user.name }));
      void refresh();
    },
    onError: failed,
  });
  const resend = useMutation({
    mutationFn: () => api.resendInvitation(businessId, user.id),
    onSuccess: ({ sent }) => onSaid(sent ? t("team.resent", { email: user.email }) : t("team.resentNotSent")),
    onError: failed,
  });
  const busy = setRoles.isPending || remove.isPending || resend.isPending;
  const start = (next: Action) => {
    setProblem(null);
    setTried(false);
    setChoice(current ?? { kind: "business" });
    setAction(next);
  };

  return (
    <li className={page.item}>
      <h3 className={page.itemTitle}>
        {user.name}
        {isYou && ` · ${t("team.you")}`}
      </h3>
      <p className={page.hint}>{user.email}</p>
      <p className={page.chip}>{t(user.status === "invited" ? "team.status.invited" : "team.status.active")}</p>
      <p>{roleText(current, branches)}</p>
      {action === "role" && (
        <RoleFields
          choice={choice}
          branches={branches}
          error={tried && roleChoiceProblemOf(choice) !== null ? t("team.noBranch") : null}
          onChange={setChoice}
        />
      )}
      {saveText(problem) !== null && (
        <p className={controls.problem} role="alert">
          {saveText(problem)}
        </p>
      )}
      {!isYou && (
        <div className={page.actions}>
          {action === "role" ? (
            <>
              <button
                type="button"
                className={controls.primary}
                disabled={busy}
                onClick={() => {
                  setTried(true);
                  if (roleChoiceProblemOf(choice) === null) setRoles.mutate();
                }}
              >
                {t(setRoles.isPending ? "common.saving" : "team.saveRole")}
              </button>
              <button type="button" className={controls.secondary} onClick={() => start("idle")}>
                {t("common.cancel")}
              </button>
            </>
          ) : action === "remove" ? (
            <>
              <button type="button" className={controls.primary} disabled={busy} onClick={() => remove.mutate()}>
                {t("team.confirmRemove", { name: user.name })}
              </button>
              <button type="button" className={controls.secondary} onClick={() => start("idle")}>
                {t("common.cancel")}
              </button>
            </>
          ) : (
            <>
              <button type="button" className={controls.secondary} disabled={busy} onClick={() => start("role")}>
                {t("team.changeRole")}
              </button>
              {user.status === "invited" && (
                <button type="button" className={controls.secondary} disabled={busy} onClick={() => resend.mutate()}>
                  {t("team.resend")}
                </button>
              )}
              <button type="button" className={controls.secondary} disabled={busy} onClick={() => start("remove")}>
                {t("team.remove")}
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}
