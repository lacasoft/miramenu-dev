import type { PublishedMenu } from "@miramenu/contracts";
import {
  activeDishOf,
  effectiveCategoryId,
  type FeedTimings,
  visibleDishes,
  type MenuLocation,
} from "@miramenu/diner-core";
import { useMemo, useState } from "react";
import { StatusScreen } from "../app/StatusScreen";
import { CommentsSheet } from "./CommentsSheet";
import { DishDetail } from "./DishDetail";
import { FeedView } from "./FeedView";
import { GridView } from "./GridView";
import { MenuHeader } from "./MenuHeader";
import { ProfileSheet } from "./ProfileSheet";
import { t } from "../i18n";
import styles from "./MenuScreen.module.css";
import { useFeedMeasurement } from "./use-feed-measurement";
import { LikesContext, useLikes } from "./use-likes";
import { useMenuLocation } from "./use-menu-location";

/**
 * A branch's published menu in its three densities, with the detail and the profile on
 * top. Where the diner is lives in the URL; this only derives what to show from it.
 */
export function MenuScreen({
  menu,
  feedTimings,
}: {
  menu: PublishedMenu;
  feedTimings: FeedTimings;
}) {
  const { location, go, closeLayer } = useMenuLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const categoryId = effectiveCategoryId(menu, location.categoryId);
  const dishes = useMemo(
    () => visibleDishes(menu, categoryId),
    [menu, categoryId],
  );
  const active = activeDishOf(dishes, location.dishId);
  const likes = useLikes(menu.branchId);
  const covered = location.detail || location.comments || profileOpen;
  const sceneChanging = useFeedMeasurement({
    branchId: menu.branchId,
    sceneDishId: location.view === "feed" ? (active?.dish.id ?? null) : null,
    covered,
  });

  if (active === undefined) return <StatusScreen kind="empty" />;

  const move = (change: Partial<MenuLocation>) =>
    go({ ...location, categoryId, dishId: active.dish.id, ...change });

  return (
    <LikesContext value={likes}>
      <MenuHeader
        profile={menu.profile}
        categories={menu.categories}
        categoryId={categoryId}
        view={location.view}
        onViewChange={(view) => move({ view, detail: false, comments: false })}
        onCategoryChange={(id) =>
          move({ categoryId: id, dishId: location.dishId, detail: false, comments: false })
        }
        onOpenProfile={() => setProfileOpen(true)}
      />
      {location.view === "feed" ? (
        <FeedView
          dishes={dishes}
          activeId={active.dish.id}
          suspended={covered}
          timings={feedTimings}
          onActiveChange={(dishId, change) => {
            sceneChanging(dishId, change);
            move({ dishId });
          }}
          onOpenDetail={(dishId) => move({ dishId, detail: true })}
          onOpenComments={(dishId) => move({ dishId, comments: true })}
        />
      ) : (
        <GridView
          dishes={dishes}
          columns={location.view === "grid2" ? 2 : 3}
          active={active}
          onOpenDish={(dishId) => move({ dishId, view: "feed" })}
          onOpenDetail={() => move({ detail: true })}
        />
      )}
      {location.detail && (
        <DishDetail
          entry={active}
          onClose={() => closeLayer("detail")}
          onOpenComments={() => move({ comments: true })}
        />
      )}
      {location.comments && (
        <CommentsSheet
          entry={active}
          branchId={menu.branchId}
          onClose={() => closeLayer("comments")}
        />
      )}
      {profileOpen && (
        <ProfileSheet
          profile={menu.profile}
          onClose={() => setProfileOpen(false)}
        />
      )}
      <p role="status" className={styles.notice} data-shown={likes.failed || undefined}>
        {likes.failed ? t("like.failed") : ""}
      </p>
    </LikesContext>
  );
}
