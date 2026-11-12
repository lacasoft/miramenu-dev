import {
  isForwardStep,
  locationAfterBack,
  menuLocationSearch,
  parseMenuLocation,
  type MenuLocation,
} from "@miramenu/diner-core";
import { useCallback, useEffect, useRef, useState } from "react";

/** Marks the history entries the menu itself pushed, so closing one goes back to it. */
const STEP_MARK = "miramenuStep";

const isOwnStep = (state: unknown): boolean =>
  typeof state === "object" && state !== null && STEP_MARK in state;

/**
 * The diner's place in the menu, kept in the URL (menu-location). Opening the feed or a
 * detail is a step of its own, so the system's back undoes it; any other move replaces
 * the current step. The page's path, with the branch's slug, is never touched.
 */
export function useMenuLocation() {
  const [location, setLocation] = useState(() =>
    parseMenuLocation(window.location.search),
  );
  const current = useRef(location);

  useEffect(() => {
    const onPop = () => {
      const arriving = parseMenuLocation(window.location.search);
      const landed = locationAfterBack(current.current, arriving);
      if (landed !== arriving) {
        window.history.replaceState(
          window.history.state,
          "",
          `${window.location.pathname}${menuLocationSearch(landed)}`,
        );
      }
      current.current = landed;
      setLocation(landed);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = useCallback((next: MenuLocation) => {
    const href = `${window.location.pathname}${menuLocationSearch(next)}`;
    if (isForwardStep(current.current, next)) {
      window.history.pushState({ [STEP_MARK]: true }, "", href);
    } else {
      window.history.replaceState(window.history.state, "", href);
    }
    current.current = next;
    setLocation(next);
  }, []);

  /**
   * Leaves a layer on top (the detail or the comments): back to the step before it, or in
   * place if a shared link opened it.
   */
  const closeLayer = useCallback(
    (layer: "detail" | "comments") => {
      if (isOwnStep(window.history.state)) window.history.back();
      else go({ ...current.current, [layer]: false });
    },
    [go],
  );

  return { location, go, closeLayer };
}
