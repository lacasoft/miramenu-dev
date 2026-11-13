import { t } from "../i18n";
import controls from "../ui/controls.module.css";

/**
 * Up and down in a list. At either end the button stays, marked unavailable, so the focus
 * of a just-moved item never falls off the page.
 */
export function MoveButtons({
  name,
  canUp,
  canDown,
  busy,
  onMove,
}: {
  name: string;
  canUp: boolean;
  canDown: boolean;
  busy: boolean;
  onMove: (offset: -1 | 1) => void;
}) {
  const button = (offset: -1 | 1, can: boolean) => (
    <button
      type="button"
      className={controls.secondary}
      aria-label={t(offset < 0 ? "menu.moveUp" : "menu.moveDown", { name })}
      aria-disabled={!can || busy || undefined}
      onClick={() => {
        if (can && !busy) onMove(offset);
      }}
    >
      {t(offset < 0 ? "menu.up" : "menu.down")}
    </button>
  );
  return (
    <>
      {button(-1, canUp)}
      {button(1, canDown)}
    </>
  );
}
