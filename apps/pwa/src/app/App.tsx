import type { SiteAddress } from "@miramenu/diner-core";
import { useEffect } from "react";
import { t } from "../i18n";
import { MenuList } from "../menu/MenuList";
import { MenuSkeleton } from "../menu/MenuSkeleton";
import { useBranchMenu } from "../menu/use-branch-menu";
import { StatusScreen } from "./StatusScreen";

/** The diner's PWA for the restaurant the page's address names; null when it names none. */
export function App({ address }: { address: SiteAddress | null }) {
  if (address === null) return <StatusScreen kind="notFound" />;
  return <BranchMenu address={address} />;
}

function BranchMenu({ address }: { address: SiteAddress }) {
  const state = useBranchMenu(address);
  const restaurant = state.status === "ready" ? state.menu.profile.name : null;

  useEffect(() => {
    document.title = restaurant ?? t("app.title");
  }, [restaurant]);

  switch (state.status) {
    case "loading":
      return <MenuSkeleton />;
    case "not-found":
      return <StatusScreen kind="notFound" />;
    case "not-published":
      return <StatusScreen kind="notPublished" />;
    case "unavailable":
      return <StatusScreen kind="unavailable" onRetry={state.retry} />;
    case "ready":
      return <MenuList menu={state.menu} />;
  }
}
