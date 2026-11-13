import {
  emailProblemOf,
  nameProblemOf,
  roleChoiceProblemOf,
  roleTargetsOf,
  saveProblemOf,
  type RoleChoice,
  type SaveProblem,
} from "@miramenu/admin-core";
import type { Branch, InvitedUser } from "@miramenu/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useAdminApi } from "../app/api-context";
import { callFailureOf } from "../app/failures";
import { keys } from "../app/keys";
import { fieldText, saveText } from "../app/problems";
import { t } from "../i18n";
import controls from "../ui/controls.module.css";
import { Field } from "../ui/Field";
import page from "../ui/page.module.css";
import { RoleFields } from "./RoleFields";

function grantedText({ user, invitation }: InvitedUser): string {
  if (invitation === null) return t("team.granted", { email: user.email });
  return invitation.sent ? t("team.invited", { email: user.email }) : t("team.invitedNotSent", { email: user.email });
}

/**
 * Gives someone a role by email: one role per invitation (the API's shape). Someone new
 * gets an invitation by email; someone with an account just gets the role.
 */
export function InviteForm({ businessId, branches, onDone }: { businessId: string; branches: readonly Branch[]; onDone: (said: string) => void }) {
  const api = useAdminApi();
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [choice, setChoice] = useState<RoleChoice>({ kind: "business" });
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<SaveProblem | null>(null);
  const problems = { name: nameProblemOf(name), email: emailProblemOf(email), role: roleChoiceProblemOf(choice) };

  const invite = useMutation({
    mutationFn: async () => {
      const [first, ...rest] = roleTargetsOf(choice);
      if (first === undefined) throw new Error("no role chosen");
      const invited = await api.inviteUser(businessId, { name: name.trim(), email: email.trim(), role: first });
      // More than one branch: the rest go with the person's roles, all of them at once.
      return rest.length === 0 ? invited : { ...invited, user: await api.setRoles(businessId, invited.user.id, roleTargetsOf(choice)) };
    },
    onSuccess: (invited) => {
      void client.invalidateQueries({ queryKey: keys.team(businessId) });
      onDone(grantedText(invited));
    },
    onError: (error) => setProblem(saveProblemOf(callFailureOf(error))),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (invite.isPending || Object.values(problems).some((each) => each !== null)) return;
    setProblem(null);
    invite.mutate();
  };

  return (
    <form className={page.form} onSubmit={submit} noValidate>
      <Field label={t("team.inviteName")} value={name} error={fieldText("name", tried ? problems.name : null)} onChange={(event) => setName(event.target.value)} />
      <Field
        label={t("team.inviteEmail")}
        type="email"
        value={email}
        error={fieldText("email", tried ? problems.email : null)}
        onChange={(event) => setEmail(event.target.value)}
      />
      <RoleFields choice={choice} branches={branches} error={tried && problems.role !== null ? t("team.noBranch") : null} onChange={setChoice} />
      {saveText(problem) !== null && (
        <p className={controls.problem} role="alert">
          {saveText(problem)}
        </p>
      )}
      <div className={page.actions}>
        <button type="submit" className={controls.primary} disabled={invite.isPending}>
          {t(invite.isPending ? "common.saving" : "team.inviteSubmit")}
        </button>
        <button type="button" className={controls.secondary} onClick={() => onDone("")}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
