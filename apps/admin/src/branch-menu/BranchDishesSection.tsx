import {
  branchSectionsOf,
  newBranchDishOf,
  type BranchSection,
} from "@miramenu/admin-core";
import type {
  BranchMenuDraft,
  BusinessMenuDraft,
  CreateBranchDishRequest,
  Media,
} from "@miramenu/contracts";
import { useState } from "react";
import { keys } from "../app/keys";
import { t } from "../i18n";
import { DishForm } from "../menu/DishForm";
import menu from "../menu/menu.module.css";
import { menuProblemText, useMenuChange } from "../menu/use-menu-change";
import controls from "../ui/controls.module.css";
import page from "../ui/page.module.css";
import { BaseDishItem } from "./BaseDishItem";
import { OwnDishItem } from "./OwnDishItem";

interface Said {
  text: string;
  /** What was changed is gone: the item that would say so went with it. */
  lost: boolean;
}

function CategoryOfBranch({
  branchId,
  section,
  sections,
  baseMedia,
  ownMedia,
  currency,
  editable,
  onSaid,
  onLost,
}: {
  branchId: string;
  section: BranchSection;
  sections: readonly BranchSection[];
  baseMedia: ReadonlyMap<string, Media>;
  ownMedia: ReadonlyMap<string, Media>;
  currency: string | null;
  editable: boolean;
  onSaid: (said: string) => void;
  onLost: (text: string) => void;
}) {
  const { category } = section;
  const [adding, setAdding] = useState(false);
  const create = useMenuChange(
    keys.branchMenuDraft(branchId),
    (api, dish: CreateBranchDishRequest) =>
      api.createBranchDish(branchId, dish),
    (created) => {
      setAdding(false);
      onSaid(t("menu.dishCreated", { name: created.name }));
    },
    { when: ["categoryGone"], say: onLost },
  );
  const empty = section.base.length === 0 && section.own.length === 0;

  return (
    <li className={menu.category}>
      <h3 className={page.itemTitle}>{category.name}</h3>
      {empty ? (
        <p className={page.hint}>{t("menu.noDishes")}</p>
      ) : (
        <ul className={page.list}>
          {section.base.map((adjusted) => (
            <BaseDishItem
              key={adjusted.dish.id}
              branchId={branchId}
              adjusted={adjusted}
              media={baseMedia}
              editable={editable}
              onSaid={onSaid}
              onLost={onLost}
            />
          ))}
          {section.own.map((dish) => (
            <OwnDishItem
              key={dish.id}
              branchId={branchId}
              dish={dish}
              sections={sections}
              media={ownMedia}
              editable={editable}
              onSaid={onSaid}
              onLost={onLost}
            />
          ))}
        </ul>
      )}
      {editable &&
        (currency === null ? (
          <p className={page.hint}>{t("menu.noCurrency")}</p>
        ) : adding ? (
          <DishForm
            initial={{
              name: "",
              description: "",
              price: "",
              categoryId: category.id,
            }}
            submitLabel={t("menu.createDish")}
            pending={create.change.isPending}
            problem={menuProblemText(create.problem)}
            onSubmit={(values) =>
              create.change.mutate(newBranchDishOf(values, currency))
            }
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            className={`${controls.secondary} ${menu.start}`}
            aria-label={t("branchMenu.newOwnIn", { category: category.name })}
            onClick={() => {
              create.clearProblem();
              setAdding(true);
            }}
          >
            {t("branchMenu.newOwn")}
          </button>
        ))}
    </li>
  );
}

/**
 * The branch's menu over its business's base, category by category: each base dish with
 * the branch's adjustment, then the dishes of the branch alone.
 */
export function BranchDishesSection({
  branchId,
  base,
  draft,
  currency,
  editable,
}: {
  branchId: string;
  /** The business's base draft, which the branch adjusts. */
  base: BusinessMenuDraft;
  draft: BranchMenuDraft;
  currency: string | null;
  editable: boolean;
}) {
  const [said, setSaid] = useState<Said | null>(null);
  const sections = branchSectionsOf(base, draft);
  const baseMedia = new Map(base.media.map((each) => [each.id, each]));
  const ownMedia = new Map(draft.media.map((each) => [each.id, each]));

  return (
    <section
      className={`${controls.card} ${page.section}`}
      aria-labelledby="branch-dishes"
    >
      <h2 id="branch-dishes" className={page.sectionTitle}>
        {t("branchMenu.categories")}
      </h2>
      {said !== null &&
        (said.lost ? (
          <p className={controls.problem} role="alert">
            {said.text}
          </p>
        ) : (
          <p className={controls.notice} role="status">
            {said.text}
          </p>
        ))}
      {sections.length === 0 ? (
        <p className={page.hint}>{t("branchMenu.noBase")}</p>
      ) : (
        <ul className={menu.categories}>
          {sections.map((section) => (
            <CategoryOfBranch
              key={section.category.id}
              branchId={branchId}
              section={section}
              sections={sections}
              baseMedia={baseMedia}
              ownMedia={ownMedia}
              currency={currency}
              editable={editable}
              onSaid={(text) => setSaid({ text, lost: false })}
              onLost={(text) => setSaid({ text, lost: true })}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
