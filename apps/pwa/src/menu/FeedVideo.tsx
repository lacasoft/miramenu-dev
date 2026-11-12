import { largestSourceOf, type MenuVideo } from "@miramenu/diner-core";
import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { usePageHidden } from "../platform/use-page-hidden";
import { Icon } from "../ui/Icon";
import { MediaImage } from "../ui/MediaImage";
import styles from "./FeedVideo.module.css";

/**
 * The active scene's video: muted autoplay inline, paused while something sits on top or
 * the page is hidden, with its progress, pause and sound. Sound only turns on when the
 * diner asks; a video that fails leaves its poster and says so (design-system §9, §14).
 */
export function FeedVideo({
  video,
  suspended,
}: {
  video: MenuVideo;
  suspended: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const pageHidden = usePageHidden();
  const [heldByDiner, setHeldByDiner] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const shouldPlay = !suspended && !pageHidden && !heldByDiner && !failed;

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    if (shouldPlay) {
      // A browser that refuses autoplay leaves the play control to the diner.
      element.play().catch(() => setHeldByDiner(true));
    } else {
      element.pause();
    }
  }, [shouldPlay]);

  if (failed) {
    return (
      <>
        <MediaImage
          image={video.poster}
          sizes="(min-width: 30rem) 30rem, 100vw"
          eager
          className={styles.media}
        />
        <p role="status" className={`glass-smoke ${styles.failed}`}>
          {t("video.failed")}
        </p>
      </>
    );
  }

  return (
    <>
      <video
        ref={ref}
        className={styles.media}
        src={video.url}
        poster={largestSourceOf(video.poster)}
        width={video.width}
        height={video.height}
        muted={muted}
        playsInline
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setHeldByDiner(true)}
        onTimeUpdate={(event) => {
          const { currentTime, duration } = event.currentTarget;
          setProgress(duration > 0 ? currentTime / duration : 0);
        }}
        onError={() => setFailed(true)}
      />
      <div className={styles.controls}>
        <div className={styles.track} aria-hidden="true">
          <div
            className={styles.progress}
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>
        <button
          type="button"
          className={`glass-smoke ${styles.control}`}
          aria-label={muted ? t("video.soundOn") : t("video.soundOff")}
          onClick={() => setMuted((current) => !current)}
        >
          <Icon name={muted ? "soundOff" : "soundOn"} />
        </button>
        <button
          type="button"
          className={`glass-smoke ${styles.control}`}
          aria-label={playing ? t("video.pause") : t("video.play")}
          onClick={() => setHeldByDiner(playing)}
        >
          <Icon name={playing ? "pause" : "play"} />
        </button>
      </div>
    </>
  );
}
