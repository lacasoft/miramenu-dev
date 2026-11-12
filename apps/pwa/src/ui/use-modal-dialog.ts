import { useEffect, useRef } from "react";

/**
 * Shows a native <dialog> as modal while it is mounted: the browser traps the focus,
 * makes the page behind inert and gives the focus back to the opener when it closes.
 * Escape asks the owner to close it, so the history step is undone the same way as
 * with the close button or the system's back.
 */
export function useModalDialog(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return undefined;
    const opener = document.activeElement;
    dialog.showModal();
    const onCancel = (event: Event) => {
      event.preventDefault();
      close.current();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      if (dialog.open) dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  return ref;
}
