import type { FeedEntry, FeedExit } from "@miramenu/contracts";
import {
  closeEntry,
  openEntry,
  setExposure,
  type OpenEntry,
} from "@miramenu/diner-core";
import { useEffect, useEffectEvent, useRef } from "react";
import { useEntryOutbox } from "../app/entry-outbox-context";
import { usePageHidden } from "../platform/use-page-hidden";

/** How often what is pending goes out while the page is visible. */
export const FLUSH_EVERY_MS = 10_000;

/** Why the feed's active scene changed: its own advance, or the diner. */
export type SceneChange = "auto" | "manual";

interface FeedMeasurementInput {
  branchId: string;
  /** The dish of the feed's active scene; null outside the feed. */
  sceneDishId: string | null;
  /** A layer covers the feed (detail, comments, profile): the scene is not in view. */
  covered: boolean;
}

const pageIsHidden = () => document.visibilityState === "hidden";

/**
 * One entry per scene of the feed (ADR-0041): it opens when a scene becomes the active
 * one and closes when another one does (`auto` after the feed's own advance, `manual`
 * otherwise, leaving the feed included) or when the page hides (`abandoned`, ADR-0011).
 * It counts as exposure only the time in view. Closed entries go to the outbox, which
 * sends them on opening, every FLUSH_EVERY_MS while visible, and by beacon on hiding.
 *
 * Returns what the feed calls just before reporting a new active scene, saying why.
 */
export function useFeedMeasurement({
  branchId,
  sceneDishId,
  covered,
}: FeedMeasurementInput): (dishId: string, change: SceneChange) => void {
  const outbox = useEntryOutbox();
  const pageHidden = usePageHidden();
  const open = useRef<OpenEntry | null>(null);
  const arriving = useRef<{ dishId: string; change: SceneChange } | null>(null);
  // Set by the hide listener before React learns of it, so no entry opens while away.
  const away = useRef(pageIsHidden());
  const exposed = !covered && !pageHidden;

  const close = (exit: FeedExit): FeedEntry | null => {
    const entry = open.current;
    if (entry === null) return null;
    open.current = null;
    return closeEntry(entry, branchId, exit, Date.now());
  };

  const enter = (dishId: string) => {
    open.current = openEntry(
      crypto.randomUUID(),
      dishId,
      Date.now(),
      !covered && !away.current,
    );
  };

  const onScene = useEffectEvent((dishId: string | null) => {
    if (open.current !== null && open.current.dishId === dishId) return;
    const exit =
      dishId !== null && arriving.current?.dishId === dishId
        ? arriving.current.change
        : "manual";
    arriving.current = null;
    const closed = close(exit);
    if (closed !== null) void outbox.record(closed);
    if (dishId !== null && !away.current) enter(dishId);
  });

  const onVisibility = useEffectEvent((hidden: boolean) => {
    if (hidden === away.current) return;
    away.current = hidden;
    if (hidden) {
      void outbox.leave(close("abandoned"));
      return;
    }
    if (sceneDishId !== null && open.current === null) enter(sceneDishId);
    void outbox.flush();
  });

  const onExposure = useEffectEvent((inView: boolean) => {
    if (open.current !== null)
      open.current = setExposure(open.current, inView, Date.now());
  });

  useEffect(() => onScene(sceneDishId), [sceneDishId]);

  useEffect(() => onExposure(exposed), [exposed]);

  useEffect(() => {
    const onChange = () => onVisibility(pageIsHidden());
    const onPageHide = () => onVisibility(true);
    // pageshow: a page coming back from the back-forward cache.
    document.addEventListener("visibilitychange", onChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onChange);
    return () => {
      document.removeEventListener("visibilitychange", onChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onChange);
    };
  }, []);

  useEffect(() => {
    // What earlier visits left behind goes out as the menu opens.
    void outbox.flush();
    const timer = window.setInterval(() => {
      if (!pageIsHidden()) void outbox.flush();
    }, FLUSH_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [outbox]);

  return (dishId, change) => {
    arriving.current = { dishId, change };
  };
}
