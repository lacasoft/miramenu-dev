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
import { DishDetail } from "./DishDetail";
import { FeedView } from "./FeedView";
import { GridView } from "./GridView";
import { MenuHeader } from "./MenuHeader";
import { ProfileSheet } from "./ProfileSheet";
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
  const { location, go, closeDetail } = useMenuLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const categoryId = effectiveCategoryId(menu, location.categoryId);
  const dishes = useMemo(
    () => visibleDishes(menu, categoryId),
    [menu, categoryId],
  );
  const active = activeDishOf(dishes, location.dishId);

  if (active === undefined) return <StatusScreen kind="empty" />;

  const move = (change: Partial<MenuLocation>) =>
    go({ ...location, categoryId, dishId: active.dish.id, ...change });

  return (
    <>
      <MenuHeader
        profile={menu.profile}
        categories={menu.categories}
        categoryId={categoryId}
        view={location.view}
        onViewChange={(view) => move({ view, detail: false })}
        onCategoryChange={(id) =>
          move({ categoryId: id, dishId: location.dishId, detail: false })
        }
        onOpenProfile={() => setProfileOpen(true)}
      />
      {location.view === "feed" ? (
        <FeedView
          dishes={dishes}
          activeId={active.dish.id}
          suspended={location.detail || profileOpen}
          timings={feedTimings}
          onActiveChange={(dishId) => move({ dishId })}
          onOpenDetail={(dishId) => move({ dishId, detail: true })}
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
      {location.detail && <DishDetail entry={active} onClose={closeDetail} />}
      {profileOpen && (
        <ProfileSheet
          profile={menu.profile}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </>
  );
}
