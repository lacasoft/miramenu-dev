import type { MenuCategory, MenuProfile } from "@miramenu/contracts";
import type { MenuView } from "@miramenu/diner-core";
import { t } from "../i18n";
import { Icon, type IconName } from "../ui/Icon";
import { MediaImage } from "../ui/MediaImage";
import styles from "./MenuHeader.module.css";
import { useHideOnScroll } from "./use-hide-on-scroll";

const VIEWS: readonly {
  view: MenuView;
  icon: IconName;
  label: "menu.density.feed" | "menu.density.grid2" | "menu.density.grid3";
}[] = [
  { view: "feed", icon: "densityFeed", label: "menu.density.feed" },
  { view: "grid2", icon: "densityTwoColumns", label: "menu.density.grid2" },
  { view: "grid3", icon: "densityThreeColumns", label: "menu.density.grid3" },
];

interface MenuHeaderProps {
  profile: MenuProfile;
  categories: readonly MenuCategory[];
  categoryId: string | null;
  view: MenuView;
  onViewChange: (view: MenuView) => void;
  onCategoryChange: (categoryId: string | null) => void;
  onOpenProfile: () => void;
}

/**
 * The restaurant's capsule on smoked glass: its name (which opens the profile) and the
 * density selector, drawn as shapes, never numbers. In the grids the category chips
 * follow, and the whole header steps aside while the diner scrolls down.
 */
export function MenuHeader({
  profile,
  categories,
  categoryId,
  view,
  onViewChange,
  onCategoryChange,
  onOpenProfile,
}: MenuHeaderProps) {
  const inFeed = view === "feed";
  const hidden = useHideOnScroll(!inFeed);

  return (
    <header
      className={styles.header}
      data-hidden={hidden || undefined}
      data-overlay={inFeed || undefined}
    >
      <div className={`glass-smoke ${styles.capsule}`}>
        <h1 className={styles.title}>
          <button
            type="button"
            className={styles.profile}
            aria-haspopup="dialog"
            onClick={onOpenProfile}
          >
            {profile.logo && (
              <MediaImage
                image={profile.logo}
                sizes="32px"
                eager
                className={styles.logo}
              />
            )}
            <span className={styles.name}>{profile.name}</span>
          </button>
        </h1>
        <div
          role="group"
          aria-label={t("menu.density")}
          className={styles.views}
        >
          {VIEWS.map((option) => (
            <button
              key={option.view}
              type="button"
              className={styles.view}
              aria-pressed={view === option.view}
              aria-label={t(option.label)}
              onClick={() => onViewChange(option.view)}
            >
              <Icon name={option.icon} />
            </button>
          ))}
        </div>
      </div>
      {!inFeed && categories.length > 1 && (
        <div
          role="group"
          aria-label={t("menu.categories")}
          className={styles.chips}
        >
          <button
            type="button"
            className={`glass-smoke ${styles.chip}`}
            aria-pressed={categoryId === null}
            onClick={() => onCategoryChange(null)}
          >
            {t("menu.allCategories")}
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={`glass-smoke ${styles.chip}`}
              aria-pressed={categoryId === category.id}
              onClick={() => onCategoryChange(category.id)}
            >
              {category.name}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}
