import { menuProblemOf, type MenuProblem } from "@miramenu/admin-core";
import type { AdminApi } from "@miramenu/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAdminApi } from "../app/api-context";
import { callFailureOf } from "../app/failures";
import { keys } from "../app/keys";
import { t } from "../i18n";

const PROBLEM_TEXT = {
  limit: "menu.problem.limit",
  categoryInUse: "menu.problem.categoryInUse",
  categoryGone: "menu.problem.categoryGone",
  gone: "menu.problem.gone",
  forbidden: "menu.problem.forbidden",
  invalid: "menu.problem.invalid",
  unavailable: "menu.problem.unavailable",
} as const;

export const menuProblemText = (problem: MenuProblem | null): string | null =>
  problem === null ? null : t(PROBLEM_TEXT[problem]);

/**
 * One change to the base menu's draft. Whatever the API answers, the draft is read again:
 * each change bumps its version and may add or clear conflicts with the branches, and a
 * change refused because something was gone shows the menu as it now is. `onLost` hears
 * that: the item goes away with its own message, so its list must say it.
 */
export function useMenuChange<Values, Result>(
  businessId: string,
  run: (api: AdminApi, values: Values) => Promise<Result>,
  onDone: (result: Result, values: Values) => void,
  onLost?: { when: readonly MenuProblem[]; say: (text: string) => void },
) {
  const api = useAdminApi();
  const client = useQueryClient();
  const [problem, setProblem] = useState<MenuProblem | null>(null);
  const change = useMutation({
    mutationFn: (values: Values) => run(api, values),
    onMutate: () => setProblem(null),
    onSuccess: onDone,
    onError: (error) => {
      const found = menuProblemOf(callFailureOf(error));
      setProblem(found);
      if (onLost?.when.includes(found)) onLost.say(t(PROBLEM_TEXT[found]));
    },
    onSettled: () =>
      client.invalidateQueries({ queryKey: keys.menuDraft(businessId) }),
  });
  return { change, problem, clearProblem: () => setProblem(null) };
}
