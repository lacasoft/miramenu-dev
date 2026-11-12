import { largestSourceOf, type MenuVideo } from "@miramenu/diner-core";
import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { Icon } from "../ui/Icon";
import { MediaImage } from "../ui/MediaImage";
import { FeedControls, VideoProgress } from "./FeedControls";
import controlStyles from "./FeedControls.module.css";
import styles from "./FeedVideo.module.css";

interface FeedVideoProps {
  video: MenuVideo;
  /** The feed runs and nothing sits on top: the video plays; otherwise it waits. */
  playing: boolean;
  /** The feed moves on by itself (not held, not paused). */
  running: boolean;
  /** A one-dish feed loops its video instead of moving on. */
  loop: boolean;
  onToggle: () => void;
  onEnded: () => void;
  /** The browser refused to autoplay: the diner gets the play button. */
  onRefused: () => void;
}

/**
 * The active scene's video: muted autoplay inline, playing only while the feed runs, with
 * its progress, sound and pause. Sound only turns on when the diner asks; a video that
 * fails leaves its poster and says so (design-system §9, §14).
 */
export function FeedVideo({
  video,
  playing,
  running,
  loop,
  onToggle,
  onEnded,
  onRefused,
}: FeedVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const refused = useRef(onRefused);
  useEffect(() => {
    refused.current = onRefused;
  });

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    if (playing) element.play().catch(() => refused.current());
    else element.pause();
  }, [playing]);

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
        loop={loop}
        playsInline
        preload="auto"
        onEnded={onEnded}
        onTimeUpdate={(event) => {
          const { currentTime, duration } = event.currentTarget;
          setProgress(duration > 0 ? currentTime / duration : 0);
        }}
        onError={() => setFailed(true)}
      />
      <FeedControls
        progress={<VideoProgress fraction={progress} />}
        running={running}
        onToggle={onToggle}
      >
        <button
          type="button"
          className={`glass-smoke ${controlStyles.control}`}
          aria-label={muted ? t("video.soundOn") : t("video.soundOff")}
          onClick={() => setMuted((current) => !current)}
        >
          <Icon name={muted ? "soundOff" : "soundOn"} />
        </button>
      </FeedControls>
    </>
  );
}
