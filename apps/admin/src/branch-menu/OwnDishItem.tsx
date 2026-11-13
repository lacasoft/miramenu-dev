import {
  dishesInSection,
  dishUpdateOf,
  priceTextOf,
  type BranchSection,
  type DishValues,
} from "@miramenu/admin-core";
import type {
  BranchDish,
  Media,
  UpdateBranchDishRequest,
} from "@miramenu/contracts";
import { formatPrice } from "@miramenu/i18n";
import { useState } from "react";
import { useAdminApi } from "../app/api-context";
import { keys } from "../app/keys";
import { t } from "../i18n";
import { DishForm } from "../menu/DishForm";
import { branchMedia } from "../menu/media-scope";
import { MediaSlot } from "../menu/MediaSlot";
import menu from "../menu/menu.module.css";
import { menuProblemText, useMenuChange } from "../menu/use-menu-change";
import controls from "../ui/controls.module.css";
import page from "../ui/page.module.css";
import styles from "./BranchMenu.module.css";

type Action = "idle" | "edit" | "remove";

const valuesOf = (dish: BranchDish): DishValues => ({
  name: dish.name,
  description: dish.description,
  price: priceTextOf(dish.priceCents),
  categoryId: dish.categoryId,
});

/**
 * A dish of this branch alone: it edits it, marks it sold out or available, gives it a
 * photo and a video, and takes it away.
 */
export function OwnDishItem({
  branchId,
  dish,
  sections,
  media,
  editable,
  onSaid,
  onLost,
}: {
  branchId: string;
  dish: BranchDish;
  /** The branch's menu, for the categories a dish may move to. */
  sections: readonly BranchSection[];
  /** The branch draft's media, by id. */
  media: ReadonlyMap<string, Media>;
  editable: boolean;
  onSaid: (said: string) => void;
  onLost: (text: string) => void;
}) {
  const api = useAdminApi();
  const draftKey = keys.branchMenuDraft(branchId);
  const [action, setAction] = useState<Action>("idle");
  const lost = { when: ["gone"] as const, say: onLost };
  const update = useMenuChange(
    draftKey,
    (client, change: UpdateBranchDishRequest) =>
      client.updateBranchDish(branchId, dish.id, change),
    (saved, change) => {
      setAction("idle");
      if (change.available === undefined)
        onSaid(t("menu.dishSaved", { name: saved.name }));
      else
        onSaid(
          t(
            saved.available
              ? "branchMenu.markedAvailable"
              : "branchMenu.markedSoldOut",
            { name: saved.name },
          ),
        );
    },
    lost,
  );
  const remove = useMenuChange<void, void>(
    draftKey,
    (client) => client.removeBranchDish(branchId, dish.id),
    () => onSaid(t("menu.dishRemoved", { name: dish.name })),
    lost,
  );
  const busy = update.change.isPending || remove.change.isPending;
  const start = (next: Action) => {
    update.clearProblem();
    remove.clearProblem();
    setAction(next);
  };
  const save = (values: DishValues) => {
    const there = sections.find(
      (section) => section.category.id === values.categoryId,
    );
    const change = dishUpdateOf(
      dish,
      values,
      there === undefined ? [] : dishesInSection(there),
    );
    if (change === null) return setAction("idle");
    update.change.mutate(change);
  };
  const problem =
    action === "edit"
      ? null
      : menuProblemText(update.problem ?? remove.problem);

  return (
    <li className={page.item}>
      <div className={menu.dishHeader}>
        <h4 className={menu.dishName}>{dish.name}</h4>
        <p className={menu.price}>
          {formatPrice(dish.priceCents, dish.currency)}
        </p>
      </div>
      <ul className={styles.flags}>
        <li>{t("branchMenu.own")}</li>
        {!dish.available && (
          <li className={styles.warning}>{t("branchMenu.soldOut")}</li>
        )}
      </ul>
      {dish.description !== "" && (
        <p className={page.hint}>{dish.description}</p>
      )}
      <div className={menu.slots}>
        <MediaSlot
          scope={branchMedia(branchId)}
          slot="photo"
          mediaId={dish.imageId}
          media={media}
          name={dish.name}
          editable={editable}
          attach={(imageId) =>
            api.updateBranchDish(branchId, dish.id, { imageId })
          }
        />
        <MediaSlot
          scope={branchMedia(branchId)}
          slot="video"
          mediaId={dish.videoId}
          media={media}
          name={dish.name}
          editable={editable}
          attach={(videoId) =>
            api.updateBranchDish(branchId, dish.id, { videoId })
          }
        />
      </div>
      {action === "edit" && (
        <DishForm
          initial={valuesOf(dish)}
          categories={sections.map((section) => section.category)}
          submitLabel={t("common.save")}
          pending={update.change.isPending}
          problem={menuProblemText(update.problem)}
          onSubmit={save}
          onCancel={() => start("idle")}
        />
      )}
      {action === "remove" && (
        <p className={page.hint}>{t("branchMenu.removeOwnWarning")}</p>
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
              <button
                type="button"
                className={controls.secondary}
                aria-label={t(
                  dish.available
                    ? "branchMenu.markSoldOutOf"
                    : "branchMenu.markAvailableOf",
                  { name: dish.name },
                )}
                disabled={busy}
                onClick={() =>
                  update.change.mutate({ available: !dish.available })
                }
              >
                {t(
                  dish.available
                    ? "branchMenu.markSoldOut"
                    : "branchMenu.markAvailable",
                )}
              </button>
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
