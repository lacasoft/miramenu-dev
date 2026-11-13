import {
  dishUpdateOf,
  moveOf,
  priceTextOf,
  type DishValues,
  type MenuSection,
  type PositionChange,
} from "@miramenu/admin-core";
import type { Dish, UpdateDishRequest } from "@miramenu/contracts";
import { formatPrice } from "@miramenu/i18n";
import { useState } from "react";
import { t } from "../i18n";
import controls from "../ui/controls.module.css";
import page from "../ui/page.module.css";
import { DishForm } from "./DishForm";
import styles from "./menu.module.css";
import { MoveButtons } from "./MoveButtons";
import { menuProblemText, useMenuChange } from "./use-menu-change";

type Action = "idle" | "edit" | "remove";

const valuesOf = (dish: Dish): DishValues => ({
  name: dish.name,
  description: dish.description,
  price: priceTextOf(dish.priceCents),
  categoryId: dish.categoryId,
});

/** One dish of the base menu: what diners see of it and, for its admin, what to change. */
export function DishItem({
  businessId,
  dish,
  siblings,
  sections,
  editable,
  onSaid,
  onLost,
}: {
  businessId: string;
  dish: Dish;
  /** The dishes of its category, in order. */
  siblings: readonly Dish[];
  sections: readonly MenuSection[];
  editable: boolean;
  onSaid: (said: string) => void;
  /** Says, in its list, that the dish is gone: this item goes away with it. */
  onLost: (text: string) => void;
}) {
  const [action, setAction] = useState<Action>("idle");
  const lost = { when: ["gone"] as const, say: onLost };
  const edit = useMenuChange(
    businessId,
    (api, update: UpdateDishRequest) =>
      api.updateDish(businessId, dish.id, update),
    (saved) => {
      setAction("idle");
      onSaid(t("menu.dishSaved", { name: saved.name }));
    },
    lost,
  );
  const move = useMenuChange(
    businessId,
    async (api, changes: PositionChange[]) => {
      for (const { id, position } of changes)
        await api.updateDish(businessId, id, { position });
    },
    () => onSaid(t("menu.moved", { name: dish.name })),
    lost,
  );
  const remove = useMenuChange<void, void>(
    businessId,
    (api) => api.removeDish(businessId, dish.id),
    () => onSaid(t("menu.dishRemoved", { name: dish.name })),
    lost,
  );
  const busy =
    edit.change.isPending || move.change.isPending || remove.change.isPending;
  const index = siblings.findIndex((each) => each.id === dish.id);
  const problem = menuProblemText(move.problem ?? remove.problem);
  const start = (next: Action) => {
    edit.clearProblem();
    move.clearProblem();
    remove.clearProblem();
    setAction(next);
  };

  const save = (values: DishValues) => {
    const dishesThere =
      sections.find((section) => section.category.id === values.categoryId)
        ?.dishes ?? [];
    const update = dishUpdateOf(dish, values, dishesThere);
    if (update === null) return setAction("idle");
    edit.change.mutate(update);
  };

  return (
    <li className={page.item}>
      <div className={styles.dishHeader}>
        <h4 className={styles.dishName}>{dish.name}</h4>
        <p className={styles.price}>
          {formatPrice(dish.priceCents, dish.currency)}
        </p>
      </div>
      {dish.description !== "" && (
        <p className={page.hint}>{dish.description}</p>
      )}
      {action === "edit" && (
        <DishForm
          initial={valuesOf(dish)}
          categories={sections.map((section) => section.category)}
          submitLabel={t("common.save")}
          pending={edit.change.isPending}
          problem={menuProblemText(edit.problem)}
          onSubmit={save}
          onCancel={() => start("idle")}
        />
      )}
      {action === "remove" && (
        <p className={page.hint}>{t("menu.removeDishWarning")}</p>
      )}
      {problem !== null && (
        <p className={controls.problem} role="alert">
          {problem}
        </p>
      )}
      {editable && action !== "edit" && (
        <div className={page.actions}>
          {action === "remove" ? (
            <>
              <button
                type="button"
                className={controls.primary}
                disabled={busy}
                onClick={() => remove.change.mutate()}
              >
                {t("menu.confirmRemoveDish", { name: dish.name })}
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
                aria-label={t("menu.editDish", { name: dish.name })}
                disabled={busy}
                onClick={() => start("edit")}
              >
                {t("common.edit")}
              </button>
              <MoveButtons
                name={dish.name}
                canUp={index > 0}
                canDown={index < siblings.length - 1}
                busy={busy}
                onMove={(offset) =>
                  move.change.mutate(moveOf(siblings, dish.id, offset))
                }
              />
              <button
                type="button"
                className={controls.secondary}
                aria-label={t("menu.removeDish", { name: dish.name })}
                disabled={busy}
                onClick={() => start("remove")}
              >
                {t("common.remove")}
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}
