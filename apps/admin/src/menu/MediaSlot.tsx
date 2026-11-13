import {
  acceptOf,
  mediaStateOf,
  sourceFor,
  type MediaState,
} from "@miramenu/admin-core";
import type { Media, MediaKind } from "@miramenu/contracts";
import { useId } from "react";
import { t } from "../i18n";
import controls from "../ui/controls.module.css";
import page from "../ui/page.module.css";
import styles from "./MediaSlot.module.css";
import { useMediaUpload, type UploadStatus } from "./use-media-upload";
import { menuProblemText, useMenuChange } from "./use-menu-change";

/** What a slot holds: a dish's photo or video, or the restaurant's logo. */
export type SlotKind = "photo" | "video" | "logo";

const mediaKindOf = (slot: SlotKind): MediaKind =>
  slot === "video" ? "video" : "image";

/** The thumbnail's width on screen; its file is the narrowest source twice as wide. */
const THUMB_WIDTH = 96;

function StateLine({
  state,
  slot,
  name,
}: {
  state: MediaState;
  slot: SlotKind;
  name: string;
}) {
  switch (state.kind) {
    case "none":
      return <p className={page.hint}>{t(`media.none.${slot}`)}</p>;
    case "missing":
      return <p className={styles.trouble}>{t("media.missing")}</p>;
    case "processing":
      return state.stalled ? (
        <p className={styles.trouble}>{t("media.stalled")}</p>
      ) : (
        <p className={page.hint}>{t(`media.processing.${slot}`)}</p>
      );
    case "failed":
      return (
        <p className={styles.trouble}>
          {t(`media.failed.${state.reason ?? "unknown"}`)}
        </p>
      );
    case "ready":
      return state.preview === null ? (
        <p className={page.hint}>{t("media.ready")}</p>
      ) : (
        <img
          className={styles.thumb}
          src={sourceFor(state.preview, THUMB_WIDTH * 2).url}
          width={state.preview.width}
          height={state.preview.height}
          alt={t("media.of", { action: t(`media.${slot}`), name })}
        />
      );
  }
}

function UploadLine({
  status,
  kind,
  onRetry,
}: {
  status: UploadStatus;
  kind: MediaKind;
  onRetry: () => void;
}) {
  switch (status.kind) {
    case "idle":
      return null;
    case "running":
      return status.step === "upload" ? (
        <div className={styles.progress} role="status">
          <span>
            {t("media.step.upload", { percent: Math.round(status.sent * 100) })}
          </span>
          <progress max={1} value={status.sent} />
        </div>
      ) : (
        <p className={page.hint} role="status">
          {t(`media.step.${status.step}`)}
        </p>
      );
    case "refused":
      return (
        <p className={controls.problem} role="alert">
          {status.problem === "empty"
            ? t("media.file.empty")
            : t(`media.file.${status.problem}.${kind}`)}
        </p>
      );
    case "failed":
      return (
        <>
          <p className={controls.problem} role="alert">
            {t(`media.problem.${status.problem}`)}
          </p>
          <button
            type="button"
            className={`${controls.secondary} ${styles.start}`}
            onClick={onRetry}
          >
            {t("media.retry")}
          </button>
        </>
      );
  }
}

/**
 * A photo, a video or a logo: what diners will see of it, and, for whoever edits the
 * menu, uploading one, replacing it or taking it away. The file goes straight to storage
 * (ADR-0038); the draft says when it is ready.
 */
export function MediaSlot({
  businessId,
  slot,
  mediaId,
  media,
  name,
  editable,
  attach,
}: {
  businessId: string;
  slot: SlotKind;
  mediaId: string | null;
  /** The media the draft uses, by id. */
  media: ReadonlyMap<string, Media>;
  /** Whose slot it is (the dish or the restaurant), for the names of its controls. */
  name: string;
  editable: boolean;
  /** Names a medium in this slot, or none. */
  attach: (mediaId: string | null) => Promise<unknown>;
}) {
  const kind = mediaKindOf(slot);
  const inputId = useId();
  const upload = useMediaUpload({ businessId, kind, attach });
  const remove = useMenuChange<void, unknown>(
    businessId,
    () => attach(null),
    () => undefined,
  );
  const busy = upload.status.kind === "running" || remove.change.isPending;
  const action = t(
    mediaId === null ? `media.upload.${slot}` : `media.replace.${slot}`,
  );

  return (
    <div className={styles.slot}>
      <p className={styles.label}>{t(`media.${slot}`)}</p>
      <StateLine state={mediaStateOf(mediaId, media)} slot={slot} name={name} />
      <UploadLine status={upload.status} kind={kind} onRetry={upload.retry} />
      {remove.problem !== null && (
        <p className={controls.problem} role="alert">
          {menuProblemText(remove.problem)}
        </p>
      )}
      {editable && (
        <div className={page.actions}>
          <input
            id={inputId}
            className={styles.file}
            type="file"
            accept={acceptOf(kind)}
            disabled={busy}
            aria-label={t("media.of", { action, name })}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file !== undefined) upload.start(file);
            }}
          />
          <label
            htmlFor={inputId}
            className={`${controls.secondary} ${styles.pick}`}
          >
            {action}
          </label>
          {mediaId !== null && (
            <button
              type="button"
              className={controls.secondary}
              aria-label={t("media.of", {
                action: t(`media.remove.${slot}`),
                name,
              })}
              disabled={busy}
              onClick={() => remove.change.mutate()}
            >
              {t(`media.remove.${slot}`)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
