import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { navigate } from "../platform/location";

/**
 * A link to one of the app's pages: a real anchor (it opens in a new tab with a modified
 * click, and reads as a link), that moves without reloading on a plain click.
 */
export function AppLink({ href, onClick, ...anchor }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const go = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  };
  return <a {...anchor} href={href} onClick={go} />;
}
