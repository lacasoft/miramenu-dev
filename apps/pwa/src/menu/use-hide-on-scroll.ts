import { useEffect, useState } from "react";

/** Scrolling this far down hides the header; any scroll up brings it back. */
const HIDE_AFTER_PX = 64;

/**
 * The profile header goes away while the diner scrolls down the grid and comes back on
 * the way up (design.md: "que se oculte al hacer scroll hacia abajo y reaparezca al
 * subir"). Off, it stays visible.
 */
export function useHideOnScroll(enabled: boolean): boolean {
  const [hidden, setHidden] = useState(false);
  const [wasEnabled, setWasEnabled] = useState(enabled);
  // Coming back to the grid always shows the header again.
  if (enabled !== wasEnabled) {
    setWasEnabled(enabled);
    setHidden(false);
  }

  useEffect(() => {
    if (!enabled) return undefined;
    let last = window.scrollY;
    const onScroll = () => {
      const now = window.scrollY;
      if (now > last && now > HIDE_AFTER_PX) setHidden(true);
      else if (now < last) setHidden(false);
      last = now;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [enabled]);

  return enabled && hidden;
}
