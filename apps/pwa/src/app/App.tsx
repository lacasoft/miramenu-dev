import type { FeedTimings, SiteAddress } from "@miramenu/diner-core";
import { useEffect } from "react";
import { t } from "../i18n";
import { MenuScreen } from "../menu/MenuScreen";
import { MenuSkeleton } from "../menu/MenuSkeleton";
import { useBranchMenu } from "../menu/use-branch-menu";
import { StatusScreen } from "./StatusScreen";

/** The diner's PWA for the restaurant the page's address names; null when it names none. */
export function App({
  address,
  feedTimings,
}: {
  address: SiteAddress | null;
  feedTimings: FeedTimings;
}) {
  if (address === null) return <StatusScreen kind="notFound" />;
  return <BranchMenu address={address} feedTimings={feedTimings} />;
}

function BranchMenu({
  address,
  feedTimings,
}: {
  address: SiteAddress;
  feedTimings: FeedTimings;
}) {
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
      return <MenuScreen menu={state.menu} feedTimings={feedTimings} />;
  }
}
