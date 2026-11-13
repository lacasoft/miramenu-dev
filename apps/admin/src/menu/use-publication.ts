import {
  attemptOf,
  keepsAttempt,
  publishProblemOf,
  rereadsDraft,
  type PublicationAttempt,
  type PublishProblem,
} from "@miramenu/admin-core";
import type { AdminApi } from "@miramenu/api-client";
import type { Publication } from "@miramenu/contracts";
import {
  useMutation,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { useState } from "react";
import { useAdminApi } from "../app/api-context";
import { callFailureOf } from "../app/failures";
import { t } from "../i18n";

const PROBLEM_TEXT = {
  draftChanged: "publish.problem.draftChanged",
  conflictsChanged: "publish.problem.conflictsChanged",
  profileRequired: "publish.problem.profileRequired",
  keyReused: "publish.problem.keyReused",
  baseNotPublished: "publish.problem.baseNotPublished",
  categoryNotPublished: "publish.problem.categoryNotPublished",
  forbidden: "publish.problem.forbidden",
  notFound: "publish.problem.notFound",
  invalid: "publish.problem.invalid",
  unavailable: "publish.problem.unavailable",
} as const;

export const publishProblemText = (problem: PublishProblem): string =>
  t(PROBLEM_TEXT[problem]);

/** A key the API accepts (16 to 128 of letters, digits, `_` and `-`): a random UUID. */
const freshKey = () => crypto.randomUUID();

/**
 * Publishing a draft, of the base menu or of a branch (ADR-0036). The idempotency key
 * stays with its request until the answer says it was refused, so a retry after a lost
 * answer gives back the first publication instead of a second one.
 */
export function usePublication<Request>({
  draftKey,
  publish,
  onPublished,
}: {
  /** The draft read again after publishing, or when the answer says it changed. */
  draftKey: QueryKey;
  publish: (
    api: AdminApi,
    request: Request,
    key: string,
  ) => Promise<Publication>;
  onPublished?: () => void;
}) {
  const api = useAdminApi();
  const client = useQueryClient();
  const [attempt, setAttempt] = useState<PublicationAttempt<Request> | null>(
    null,
  );
  const [problem, setProblem] = useState<PublishProblem | null>(null);
  const [done, setDone] = useState<Publication | null>(null);
  const rereadDraft = () => client.invalidateQueries({ queryKey: draftKey });

  const mutation = useMutation({
    mutationFn: ({ request, key }: PublicationAttempt<Request>) =>
      publish(api, request, key),
    onSuccess: (publication) => {
      setDone(publication);
      setAttempt(null);
      onPublished?.();
      void rereadDraft();
    },
    onError: (error) => {
      const found = publishProblemOf(callFailureOf(error));
      setProblem(found);
      if (!keepsAttempt(found)) setAttempt(null);
      if (rereadsDraft(found)) void rereadDraft();
    },
  });

  const submit = (request: Request) => {
    if (mutation.isPending) return;
    setProblem(null);
    const next = attemptOf(attempt, request, freshKey);
    setAttempt(next);
    mutation.mutate(next);
  };

  return {
    submit,
    pending: mutation.isPending,
    problem,
    done,
    /** Before a new review: what was said of the last one goes away. */
    reset: () => {
      setProblem(null);
      setDone(null);
    },
  };
}
