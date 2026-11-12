import { dishMedia, type VisibleDish } from "@miramenu/diner-core";
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { t } from "../i18n";
import { Icon } from "../ui/Icon";
import { MediaImage } from "../ui/MediaImage";
import { FeedVideo } from "./FeedVideo";
import styles from "./FeedView.module.css";
import { priceLabel } from "./price";

/** A card is the active one once 70% of it is on screen (the demo's valid-view share). */
const ACTIVE_SHARE = 0.7;

interface FeedViewProps {
  dishes: readonly VisibleDish[];
  activeId: string;
  /** Something sits on top (detail, profile): the video waits. */
  suspended: boolean;
  onActiveChange: (dishId: string) => void;
  onOpenDetail: (dishId: string) => void;
}

const cardOf = (container: HTMLElement | null, dishId: string | undefined) =>
  dishId === undefined
    ? null
    : container?.querySelector<HTMLElement>(`[data-dish-id="${dishId}"]`);

/**
 * One dish per scene, swiped vertically with native scroll snapping. Only the active
 * scene plays its video; the others show their stills (design-system §9).
 */
export function FeedView({
  dishes,
  activeId,
  suspended,
  onActiveChange,
  onOpenDetail,
}: FeedViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialId = useRef(activeId);
  const onActive = useRef(onActiveChange);
  useEffect(() => {
    onActive.current = onActiveChange;
  });
  const activeIndex = dishes.findIndex(({ dish }) => dish.id === activeId);

  useLayoutEffect(() => {
    cardOf(containerRef.current, initialId.current)?.scrollIntoView?.({
      block: "start",
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        const dishId = visible?.target.getAttribute("data-dish-id");
        if (dishId) onActive.current(dishId);
      },
      { root: container, threshold: ACTIVE_SHARE },
    );
    container
      .querySelectorAll("[data-dish-id]")
      .forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [dishes]);

  const goTo = (index: number) => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    cardOf(containerRef.current, dishes[index]?.dish.id)?.scrollIntoView?.({
      block: "start",
      behavior: reduced ? "auto" : "smooth",
    });
  };

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
            active={index === activeIndex}
            near={Math.abs(index - activeIndex) <= 1}
            suspended={suspended}
            onOpenDetail={onOpenDetail}
          />
        ))}
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
          disabled={activeIndex >= dishes.length - 1}
          onClick={() => goTo(activeIndex + 1)}
        >
          <Icon name="chevronDown" />
        </button>
      </div>
    </main>
  );
}

interface FeedSceneProps {
  entry: VisibleDish;
  active: boolean;
  /** Next to the active scene: its still loads now, so a swipe never shows a blank. */
  near: boolean;
  suspended: boolean;
  onOpenDetail: (dishId: string) => void;
}

function FeedScene({
  entry: { dish },
  active,
  near,
  suspended,
  onOpenDetail,
}: FeedSceneProps) {
  const media = dishMedia(dish);
  const sizes = "(min-width: 30rem) 30rem, 100vw";
  return (
    <article
      className={styles.scene}
      data-dish-id={dish.id}
      aria-label={dish.name}
    >
      {media.kind === "video" && active ? (
        <FeedVideo video={media.video} suspended={suspended} />
      ) : (
        <MediaImage
          image={
            media.kind === "video"
              ? media.poster
              : media.kind === "image"
                ? media.image
                : null
          }
          sizes={sizes}
          eager={near}
          className={styles.media}
        />
      )}
      <div className={`scrim-top ${styles.scrimTop}`} />
      <div className={`scrim-bottom ${styles.scrimBottom}`} />
      <div
        className={styles.info}
        data-with-controls={(media.kind === "video" && active) || undefined}
      >
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
