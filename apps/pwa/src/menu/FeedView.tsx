import {
  dishMedia,
  feedTimer,
  nextPlayback,
  nextSceneIndex,
  type FeedEvent,
  type FeedPlayback,
  type FeedTimings,
  type SceneKind,
  type VisibleDish,
} from "@miramenu/diner-core";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { t } from "../i18n";
import { usePageHidden } from "../platform/use-page-hidden";
import { Icon } from "../ui/Icon";
import { MediaImage } from "../ui/MediaImage";
import { FeedControls, StillProgress } from "./FeedControls";
import { FeedVideo } from "./FeedVideo";
import styles from "./FeedView.module.css";
import { CommentCount } from "./CommentCount";
import { LikeButton } from "./LikeButton";
import { priceLabel } from "./price";
import type { SceneChange } from "./use-feed-measurement";

/** A card is the active one once 70% of it is on screen (the demo's valid-view share). */
const ACTIVE_SHARE = 0.7;
/**
 * The copy of the first scene sends the feed back to the start only once it is fully on
 * screen: jumping while a smooth scroll is still on its way leaves the feed off its snap.
 */
const LANDED_SHARE = 0.98;

interface FeedViewProps {
  dishes: readonly VisibleDish[];
  activeId: string;
  /** Something sits on top (detail, profile): the feed waits. */
  suspended: boolean;
  timings: FeedTimings;
  /** A new scene is the active one: after the feed's own advance (auto) or the diner's move. */
  onActiveChange: (dishId: string, change: SceneChange) => void;
  onOpenDetail: (dishId: string) => void;
  onOpenComments: (dishId: string) => void;
}

const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * One dish per scene, swiped vertically with native scroll snapping. It moves on by
 * itself: a video when it ends, a still after its time; touching it holds it, and the
 * diner's pause stops it. Past the last scene a copy of the first one follows, and
 * landing there jumps back to the start, so the feed never runs out (design.md).
 */
export function FeedView({
  dishes,
  activeId,
  suspended,
  timings,
  onActiveChange,
  onOpenDetail,
  onOpenComments,
}: FeedViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialId = useRef(activeId);
  // The scene the feed's own advance is heading to, so its arrival is told apart.
  const advancingTo = useRef<string | null>(null);
  const pageHidden = usePageHidden();
  const activeIndex = dishes.findIndex(({ dish }) => dish.id === activeId);
  const active = dishes[activeIndex];
  const scene: SceneKind =
    active && dishMedia(active.dish).kind === "video" ? "video" : "still";
  const live = !suspended && !pageHidden;

  const [playback, setPlayback] = useState<FeedPlayback>("running");
  // Each new scene, or a still that starts its time over, is a new round of its timer.
  const [round, setRound] = useState(0);
  const [enteredId, setEnteredId] = useState(activeId);
  const [wasLive, setWasLive] = useState(live);
  if (activeId !== enteredId) {
    setEnteredId(activeId);
    setPlayback(nextPlayback(playback, "entered").playback);
    setRound((current) => current + 1);
  }
  if (live !== wasLive) {
    setWasLive(live);
    if (live) setRound((current) => current + 1);
  }

  const sceneElement = (dishId: string) =>
    containerRef.current?.querySelector<HTMLElement>(
      `[data-dish-id="${dishId}"]:not([data-clone])`,
    );

  const scrollTo = (element: Element | null | undefined, smooth = true) =>
    element?.scrollIntoView?.({
      block: "start",
      behavior: smooth && !reducedMotion() ? "smooth" : "auto",
    });

  const goTo = (index: number, change: SceneChange = "manual") => {
    const looping = dishes.length > 1 && index === dishes.length;
    // The copy of the first scene lands on the first one.
    const target = dishes[looping ? 0 : index];
    advancingTo.current = change === "auto" && target ? target.dish.id : null;
    if (looping) scrollTo(containerRef.current?.querySelector("[data-clone]"));
    else if (target) scrollTo(sceneElement(target.dish.id));
  };

  const advance = () => {
    if (dishes.length <= 1) {
      setRound((current) => current + 1);
      return;
    }
    const next = nextSceneIndex(activeIndex, dishes.length);
    goTo(next === 0 ? dishes.length : next, "auto");
  };

  const dispatch = (event: FeedEvent) => {
    const step = nextPlayback(playback, event);
    if (step.playback === "running" && playback !== "running")
      setRound((current) => current + 1);
    setPlayback(step.playback);
    if (step.advance) advance();
  };
  const onTimer = useEffectEvent((event: FeedEvent) => dispatch(event));
  const onActive = useEffectEvent((dishId: string) => {
    if (dishId === activeId) return;
    const change = advancingTo.current === dishId ? "auto" : "manual";
    advancingTo.current = null;
    onActiveChange(dishId, change);
  });
  const onClone = useEffectEvent(() => {
    const first = dishes[0];
    if (first) scrollTo(sceneElement(first.dish.id), false);
  });

  useLayoutEffect(() => {
    containerRef.current
      ?.querySelector(`[data-dish-id="${initialId.current}"]:not([data-clone])`)
      ?.scrollIntoView?.({ block: "start" });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target.hasAttribute("data-clone")) {
            if (entry.intersectionRatio >= LANDED_SHARE) onClone();
          } else if (entry.isIntersecting && entry.intersectionRatio >= ACTIVE_SHARE) {
            const dishId = entry.target.getAttribute("data-dish-id");
            if (dishId) onActive(dishId);
          }
        }
      },
      { root: container, threshold: [ACTIVE_SHARE, 1] },
    );
    container
      .querySelectorAll("[data-dish-id]")
      .forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [dishes]);

  useEffect(() => {
    if (!live) return undefined;
    const timer = feedTimer(playback, scene, timings);
    if (timer === null) return undefined;
    const handle = window.setTimeout(() => onTimer(timer.event), timer.ms);
    return () => window.clearTimeout(handle);
  }, [live, playback, scene, timings, round, activeId]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "ArrowDown" || event.key === "PageDown") {
      event.preventDefault();
      goTo(activeIndex + 1);
    } else if (event.key === "ArrowUp" || event.key === "PageUp") {
      event.preventDefault();
      goTo(activeIndex - 1);
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    // A touch on the scene holds the feed; its own buttons and links do their thing.
    if (event.target instanceof Element && event.target.closest("button, a"))
      return;
    dispatch("touched");
  };

  const running = playback === "running";
  const loopFirst = dishes.length > 1 ? dishes[0] : undefined;

  return (
    <main className={styles.frame}>
      <div
        ref={containerRef}
        className={styles.feed}
        role="region"
        aria-label={t("menu.dishes")}
        // Keyboard users move between scenes with the arrows from here.
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        {dishes.map((entry, index) => (
          <FeedScene
            key={entry.dish.id}
            entry={entry}
            near={
              Math.abs(index - activeIndex) <= 1 ||
              (index === 0 && activeIndex === dishes.length - 1)
            }
            onOpenDetail={onOpenDetail}
            onOpenComments={onOpenComments}
            {...(index === activeIndex
              ? {
                  live: {
                    playing: running && live,
                    running,
                    round,
                    loop: dishes.length === 1,
                    stillMs: timings.stillMs,
                    onPointerDown,
                    onToggle: () =>
                      dispatch(running ? "pausePressed" : "playPressed"),
                    onFinished: () => dispatch("finished"),
                    onRefused: () => dispatch("pausePressed"),
                  },
                }
              : {})}
          />
        ))}
        {loopFirst && (
          <FeedScene
            key="loop"
            entry={loopFirst}
            near={activeIndex === dishes.length - 1}
            clone
            onOpenDetail={onOpenDetail}
            onOpenComments={onOpenComments}
          />
        )}
      </div>
      <div className={styles.arrows}>
        <button
          type="button"
          className={`glass-smoke ${styles.arrow}`}
          aria-label={t("menu.previous")}
          disabled={activeIndex <= 0}
          onClick={() => goTo(activeIndex - 1)}
        >
          <Icon name="chevronUp" />
        </button>
        <button
          type="button"
          className={`glass-smoke ${styles.arrow}`}
          aria-label={t("menu.next")}
          disabled={dishes.length <= 1}
          onClick={() => goTo(activeIndex + 1)}
        >
          <Icon name="chevronDown" />
        </button>
      </div>
    </main>
  );
}

/** What the active scene needs to play: the others only show their still. */
interface LiveScene {
  playing: boolean;
  running: boolean;
  round: number;
  loop: boolean;
  stillMs: number;
  onPointerDown: (event: PointerEvent) => void;
  onToggle: () => void;
  onFinished: () => void;
  onRefused: () => void;
}

interface FeedSceneProps {
  entry: VisibleDish;
  /** Next to the active scene: its still loads now, so a swipe never shows a blank. */
  near: boolean;
  /** The copy of the first scene after the last one, hidden from assistive technology. */
  clone?: boolean;
  live?: LiveScene;
  onOpenDetail: (dishId: string) => void;
  onOpenComments: (dishId: string) => void;
}

function FeedScene({
  entry: { dish },
  near,
  clone = false,
  live,
  onOpenDetail,
  onOpenComments,
}: FeedSceneProps) {
  const media = dishMedia(dish);
  const still =
    media.kind === "video"
      ? media.poster
      : media.kind === "image"
        ? media.image
        : null;
  const withControls = live !== undefined;
  return (
    <article
      className={styles.scene}
      data-dish-id={dish.id}
      data-clone={clone || undefined}
      aria-label={clone ? undefined : dish.name}
      aria-hidden={clone || undefined}
      inert={clone || undefined}
      onPointerDown={live?.onPointerDown}
    >
      {media.kind === "video" && live ? (
        <FeedVideo
          video={media.video}
          playing={live.playing}
          running={live.running}
          loop={live.loop}
          onToggle={live.onToggle}
          onEnded={live.onFinished}
          onRefused={live.onRefused}
        />
      ) : (
        <MediaImage
          image={still}
          sizes="(min-width: 30rem) 30rem, 100vw"
          eager={near}
          className={styles.media}
        />
      )}
      <div className={`scrim-top ${styles.scrimTop}`} />
      <div className={`scrim-bottom ${styles.scrimBottom}`} />
      {live && media.kind !== "video" && (
        <FeedControls
          progress={
            <StillProgress
              key={live.round}
              ms={live.stillMs}
              moving={live.playing}
            />
          }
          running={live.running}
          onToggle={live.onToggle}
        />
      )}
      <div
        className={styles.info}
        data-with-controls={withControls || undefined}
      >
        <div className={styles.rail}>
          <LikeButton dishId={dish.id} dishName={dish.name} label="below" />
          <CommentCount
            dishId={dish.id}
            dishName={dish.name}
            variant="rail"
            onOpen={() => onOpenComments(dish.id)}
          />
        </div>
        <h2 className={styles.name}>{dish.name}</h2>
        {dish.description && (
          <p className={styles.description}>{dish.description}</p>
        )}
        <div className={styles.priceRow}>
          <p className={styles.price}>{priceLabel(dish)}</p>
          <button
            type="button"
            className={`glass-smoke ${styles.detail}`}
            aria-label={t("dish.seeDetailOf", { name: dish.name })}
            onClick={() => onOpenDetail(dish.id)}
          >
            {t("dish.seeDetail")}
            <Icon name="chevronRight" size={20} />
          </button>
        </div>
      </div>
    </article>
  );
}
