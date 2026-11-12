import type { ReactNode } from "react";
import { t } from "../i18n";
import { Icon } from "../ui/Icon";
import styles from "./FeedControls.module.css";

/**
 * The active scene's controls: its progress and the pause that stops the feed moving on
 * (WCAG 2.2.2: content that moves by itself can be paused), plus whatever the media adds.
 */
export function FeedControls({
  progress,
  running,
  onToggle,
  children,
}: {
  progress: ReactNode;
  /** The feed moves on by itself: the button pauses it; otherwise it plays. */
  running: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  return (
    <div className={styles.controls}>
      <div className={styles.track} aria-hidden="true">
        {progress}
      </div>
      {children}
      <button
        type="button"
        className={`glass-smoke ${styles.control}`}
        aria-label={running ? t("video.pause") : t("video.play")}
        onClick={onToggle}
      >
        <Icon name={running ? "pause" : "play"} />
      </button>
    </div>
  );
}

/** A still's progress: a bar that fills in the still's time, frozen while the feed waits. */
export function StillProgress({ ms, moving }: { ms: number; moving: boolean }) {
  return (
    <div
      className={styles.stillProgress}
      style={{
        animationDuration: `${ms}ms`,
        animationPlayState: moving ? "running" : "paused",
      }}
    />
  );
}

/** A video's progress, from its playing position. */
export function VideoProgress({ fraction }: { fraction: number }) {
  return (
    <div
      className={styles.progress}
      style={{ transform: `scaleX(${fraction})` }}
    />
  );
}
