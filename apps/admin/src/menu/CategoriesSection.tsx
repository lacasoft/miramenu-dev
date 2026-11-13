import { menuSectionsOf } from "@miramenu/admin-core";
import type { BusinessMenuDraft, Category } from "@miramenu/contracts";
import { useState } from "react";
import { keys } from "../app/keys";
import { t } from "../i18n";
import controls from "../ui/controls.module.css";
import page from "../ui/page.module.css";
import { CategoryBlock } from "./CategoryBlock";
import { CategoryNameForm } from "./CategoryNameForm";
import styles from "./menu.module.css";
import { menuProblemText, useMenuChange } from "./use-menu-change";

/** The base menu's categories in order, each with its dishes. */
export function CategoriesSection({
  businessId,
  draft,
  currency,
  editable,
}: {
  businessId: string;
  draft: BusinessMenuDraft;
  currency: string | null;
  editable: boolean;
}) {
  const [creating, setCreating] = useState(false);
  /** The last thing the list said: what worked, or what was gone when it was changed. */
  const [said, setSaid] = useState<{ text: string; lost: boolean } | null>(null);
  const notice = (text: string) => setSaid({ text, lost: false });
  const lost = (text: string) => setSaid({ text, lost: true });
  const create = useMenuChange(
    keys.menuDraft(businessId),
    (api, name: string) => api.createCategory(businessId, { name }),
    (category: Category) => {
      setCreating(false);
      notice(t("menu.categoryCreated", { name: category.name }));
    },
  );
  const sections = menuSectionsOf(draft);
  const media = new Map(draft.media.map((each) => [each.id, each]));

  return (
    <section
      className={`${controls.card} ${page.section}`}
      aria-labelledby="menu-categories"
    >
      <div className={page.sectionHeader}>
        <h2 id="menu-categories" className={page.sectionTitle}>
          {t("menu.categories")}
        </h2>
        {editable && !creating && (
          <button
            type="button"
            className={controls.secondary}
            onClick={() => {
              setSaid(null);
              create.clearProblem();
              setCreating(true);
            }}
          >
            {t("menu.newCategory")}
          </button>
        )}
      </div>
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
      {creating && (
        <CategoryNameForm
          submitLabel={t("menu.createCategory")}
          pending={create.change.isPending}
          problem={menuProblemText(create.problem)}
          onSubmit={(name) => create.change.mutate(name)}
          onCancel={() => setCreating(false)}
        />
      )}
      {sections.length === 0 ? (
        <p className={page.hint}>{t("menu.noCategories")}</p>
      ) : (
        <ul className={styles.categories}>
          {sections.map((section) => (
            <CategoryBlock
              key={section.category.id}
              businessId={businessId}
              section={section}
              sections={sections}
              currency={currency}
              media={media}
              editable={editable}
              onSaid={notice}
              onLost={lost}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
