import {
  moveOf,
  newDishOf,
  type DishValues,
  type MenuSection,
  type PositionChange,
} from "@miramenu/admin-core";
import type { Category, CreateDishRequest, Media } from "@miramenu/contracts";
import { useState } from "react";
import { keys } from "../app/keys";
import { t } from "../i18n";
import controls from "../ui/controls.module.css";
import page from "../ui/page.module.css";
import { CategoryNameForm } from "./CategoryNameForm";
import { DishForm } from "./DishForm";
import { DishItem } from "./DishItem";
import styles from "./menu.module.css";
import { MoveButtons } from "./MoveButtons";
import { menuProblemText, useMenuChange } from "./use-menu-change";

type Action = "idle" | "rename" | "remove" | "newDish";

/** One category with its dishes; its admin renames, moves or removes it and adds dishes. */
export function CategoryBlock({
  businessId,
  section,
  sections,
  currency,
  media,
  editable,
  onSaid,
  onLost,
}: {
  businessId: string;
  section: MenuSection;
  sections: readonly MenuSection[];
  /** The currency of the business's prices; null when its country has none yet. */
  currency: string | null;
  /** The media the draft uses, by id. */
  media: ReadonlyMap<string, Media>;
  editable: boolean;
  onSaid: (said: string) => void;
  /** Says, in its list, that the category is gone: this block goes away with it. */
  onLost: (text: string) => void;
}) {
  const { category, dishes } = section;
  const categories = sections.map((each) => each.category);
  const index = categories.findIndex((each) => each.id === category.id);
  const [action, setAction] = useState<Action>("idle");
  const done = (said: string) => {
    setAction("idle");
    onSaid(said);
  };
  const lost = { when: ["gone"] as const, say: onLost };
  const rename = useMenuChange(
    keys.menuDraft(businessId),
    (api, name: string) =>
      api.updateCategory(businessId, category.id, { name }),
    (saved: Category) => done(t("menu.categorySaved", { name: saved.name })),
    lost,
  );
  const move = useMenuChange(
    keys.menuDraft(businessId),
    async (api, changes: PositionChange[]) => {
      for (const { id, position } of changes)
        await api.updateCategory(businessId, id, { position });
    },
    () => onSaid(t("menu.moved", { name: category.name })),
    lost,
  );
  const remove = useMenuChange<void, void>(
    keys.menuDraft(businessId),
    (api) => api.removeCategory(businessId, category.id),
    () => done(t("menu.categoryRemoved", { name: category.name })),
    lost,
  );
  const addDish = useMenuChange(
    keys.menuDraft(businessId),
    (api, dish: CreateDishRequest) => api.createDish(businessId, dish),
    (created) => done(t("menu.dishCreated", { name: created.name })),
    // Its own category gone: the block goes with it.
    { when: ["categoryGone"], say: onLost },
  );
  const busy =
    rename.change.isPending || move.change.isPending || remove.change.isPending;
  const problem = menuProblemText(move.problem ?? remove.problem);
  const start = (next: Action) => {
    for (const each of [rename, move, remove, addDish]) each.clearProblem();
    setAction(next);
  };
  const newDish: DishValues = {
    name: "",
    description: "",
    price: "",
    categoryId: category.id,
  };

  return (
    <li className={styles.category}>
      <h3 className={page.itemTitle}>{category.name}</h3>
      {action === "rename" && (
        <CategoryNameForm
          initial={category.name}
          submitLabel={t("common.save")}
          pending={rename.change.isPending}
          problem={menuProblemText(rename.problem)}
          onSubmit={(name) => rename.change.mutate(name)}
          onCancel={() => start("idle")}
        />
      )}
      {problem !== null && (
        <p className={controls.problem} role="alert">
          {problem}
        </p>
      )}
      {editable && action !== "rename" && (
        <div className={page.actions}>
          {action === "remove" ? (
            <>
              <button
                type="button"
                className={controls.primary}
                disabled={busy}
                onClick={() => remove.change.mutate()}
              >
                {t("menu.confirmRemoveCategory", { name: category.name })}
              </button>
              <button
                type="button"
                className={controls.secondary}
                onClick={() => start("idle")}
              >
                {t("common.cancel")}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={controls.secondary}
                aria-label={t("menu.renameCategoryOf", { name: category.name })}
                disabled={busy}
                onClick={() => start("rename")}
              >
                {t("menu.renameCategory")}
              </button>
              <MoveButtons
                name={category.name}
                canUp={index > 0}
                canDown={index < categories.length - 1}
                busy={busy}
                onMove={(offset) =>
                  move.change.mutate(moveOf(categories, category.id, offset))
                }
              />
              <button
                type="button"
                className={controls.secondary}
                aria-label={t("menu.removeCategoryOf", { name: category.name })}
                disabled={busy}
                onClick={() => start("remove")}
              >
                {t("menu.removeCategory")}
              </button>
            </>
          )}
        </div>
      )}
      {dishes.length === 0 ? (
        <p className={page.hint}>{t("menu.noDishes")}</p>
      ) : (
        <ul className={page.list}>
          {dishes.map((dish) => (
            <DishItem
              key={dish.id}
              businessId={businessId}
              dish={dish}
              siblings={dishes}
              sections={sections}
              media={media}
              editable={editable}
              onSaid={onSaid}
              onLost={onLost}
            />
          ))}
        </ul>
      )}
      {editable &&
        (action === "newDish" && currency !== null ? (
          <DishForm
            initial={newDish}
            submitLabel={t("menu.createDish")}
            pending={addDish.change.isPending}
            problem={menuProblemText(addDish.problem)}
            onSubmit={(values) =>
              addDish.change.mutate(newDishOf(values, currency))
            }
            onCancel={() => start("idle")}
          />
        ) : currency === null ? (
          <p className={page.hint}>{t("menu.noCurrency")}</p>
        ) : (
          <button
            type="button"
            className={`${controls.secondary} ${styles.start}`}
            aria-label={t("menu.newDishIn", { category: category.name })}
            onClick={() => start("newDish")}
          >
            {t("menu.newDish")}
          </button>
        ))}
    </li>
  );
}
