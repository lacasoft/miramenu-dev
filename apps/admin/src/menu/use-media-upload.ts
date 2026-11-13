import {
  afterUploadFailure,
  mediaFileProblemOf,
  mediaRequestOf,
  NEW_UPLOAD,
  uploadStepOf,
  type MediaFileProblem,
  type UploadProblem,
  type UploadProgress,
  type UploadStep,
} from "@miramenu/admin-core";
import type { MediaKind } from "@miramenu/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useAdminApi } from "../app/api-context";
import { callFailureOf } from "../app/failures";
import { keys } from "../app/keys";
import { usePutFile } from "../app/uploader-context";

export type UploadStatus =
  | { kind: "idle" }
  /** `sent`: how much of the file went out, from 0 to 1, while it uploads. */
  | { kind: "running"; step: UploadStep; sent: number }
  /** The file was not sent: its type, size or emptiness. */
  | { kind: "refused"; problem: MediaFileProblem }
  /** A step failed; trying again goes on from it. */
  | { kind: "failed"; problem: UploadProblem };

interface Job {
  file: File;
  progress: UploadProgress;
}

function createdOf(progress: UploadProgress) {
  if (progress.created === null) throw new Error("the medium was not created");
  return progress.created;
}

/**
 * One file to a slot (ADR-0038): create the medium, PUT the file straight to storage,
 * confirm it and attach it. Each step that worked is kept, so trying again after a
 * failure goes on from where it stopped instead of uploading everything again.
 */
export function useMediaUpload({
  businessId,
  kind,
  attach,
}: {
  businessId: string;
  kind: MediaKind;
  /** Names the medium in its dish or profile. */
  attach: (mediaId: string) => Promise<unknown>;
}) {
  const api = useAdminApi();
  const putFile = usePutFile();
  const client = useQueryClient();
  const [status, setStatus] = useState<UploadStatus>({ kind: "idle" });
  const job = useRef<Job | null>(null);
  const running = useRef(false);

  const perform = async (
    step: UploadStep,
    { file, progress }: Job,
  ): Promise<UploadProgress> => {
    switch (step) {
      case "create": {
        const created = await api.createMedia(
          businessId,
          mediaRequestOf(kind, file),
        );
        return {
          created: { mediaId: created.media.id, upload: created.upload },
          uploaded: false,
          completed: false,
        };
      }
      case "upload":
        await putFile(createdOf(progress).upload, file, (sent) =>
          setStatus({ kind: "running", step, sent }),
        );
        return { ...progress, uploaded: true };
      case "complete":
        await api.completeMedia(businessId, createdOf(progress).mediaId);
        return { ...progress, completed: true };
      case "attach":
        await attach(createdOf(progress).mediaId);
        return progress;
    }
  };

  /** Goes step by step until the medium is attached or a step fails. */
  const run = async () => {
    const current = job.current;
    if (current === null || running.current) return;
    running.current = true;
    try {
      for (;;) {
        const step = uploadStepOf(current.progress, Date.now());
        setStatus({ kind: "running", step, sent: 0 });
        try {
          current.progress = await perform(step, current);
        } catch (error) {
          const after = afterUploadFailure(
            step,
            callFailureOf(error),
            current.progress,
          );
          current.progress = after.progress;
          setStatus({ kind: "failed", problem: after.problem });
          return;
        }
        if (step === "attach") {
          job.current = null;
          setStatus({ kind: "idle" });
          return;
        }
      }
    } finally {
      running.current = false;
      // The draft now names the medium, still processing; the problems may have changed.
      void client.invalidateQueries({ queryKey: keys.menuDraft(businessId) });
      void client.invalidateQueries({
        queryKey: keys.mediaProblems(businessId),
      });
    }
  };

  const start = (file: File) => {
    if (running.current) return;
    const problem = mediaFileProblemOf(kind, file);
    if (problem !== null) {
      job.current = null;
      setStatus({ kind: "refused", problem });
      return;
    }
    job.current = { file, progress: NEW_UPLOAD };
    void run();
  };

  return { status, start, retry: () => void run() };
}
