import {
  adjustmentOf,
  adjustmentPriceProblemOf,
  adjustmentValuesOf,
  type AdjustedDish,
  type AdjustmentChange,
  type AdjustmentValues,
} from "@miramenu/admin-core";
import type { Media } from "@miramenu/contracts";
import { formatPrice } from "@miramenu/i18n";
import { useState, type FormEvent } from "react";
import { keys } from "../app/keys";
import { t } from "../i18n";
import { branchMedia } from "../menu/media-scope";
import { MediaSlot } from "../menu/MediaSlot";
import menu from "../menu/menu.module.css";
import { menuProblemText, useMenuChange } from "../menu/use-menu-change";
import controls from "../ui/controls.module.css";
import { Field } from "../ui/Field";
import page from "../ui/page.module.css";
import styles from "./BranchMenu.module.css";

type Change = NonNullable<AdjustmentChange>;

function priceText(text: string): string | null {
  const problem = adjustmentPriceProblemOf(text);
  if (problem === "format") return t("field.price.format");
  return problem === "tooHigh" ? t("field.price.tooHigh") : null;
}

function AdjustmentForm({
  adjusted,
  pending,
  problem,
  onSubmit,
  onCancel,
}: {
  adjusted: AdjustedDish;
  pending: boolean;
  problem: string | null;
  onSubmit: (values: AdjustmentValues) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState(() => adjustmentValuesOf(adjusted));
  const [tried, setTried] = useState(false);
  const { dish } = adjusted;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (pending || adjustmentPriceProblemOf(values.price) !== null) return;
    onSubmit(values);
  };
  return (
    <form className={page.form} onSubmit={submit} noValidate>
      <Field
        label={t("branchMenu.price")}
        hint={t("branchMenu.priceHint", {
          price: formatPrice(dish.priceCents, dish.currency),
        })}
        inputMode="decimal"
        value={values.price}
        error={tried ? priceText(values.price) : null}
        onChange={(event) =>
          setValues({ ...values, price: event.target.value })
        }
      />
      <label className={menu.check}>
        <input
          type="checkbox"
          checked={values.available}
          onChange={(event) =>
            setValues({ ...values, available: event.target.checked })
          }
        />
        <span>{t("branchMenu.available")}</span>
      </label>
      <label className={menu.check}>
        <input
          type="checkbox"
          checked={values.hidden}
          onChange={(event) =>
            setValues({ ...values, hidden: event.target.checked })
          }
        />
        <span>{t("branchMenu.hide")}</span>
      </label>
      {problem !== null && (
        <p className={controls.problem} role="alert">
          {problem}
        </p>
      )}
      <div className={page.actions}>
        <button type="submit" className={controls.primary} disabled={pending}>
          {t(pending ? "common.saving" : "common.save")}
        </button>
        <button type="button" className={controls.secondary} onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

/** What the branch changed of a base dish, in words; nothing when it serves it as it is. */
function Flags({ adjusted }: { adjusted: AdjustedDish }) {
  const { dish, override } = adjusted;
  const flags = [
    ...(override?.priceCents == null
      ? []
      : [{ text: t("branchMenu.basePrice", { price: formatPrice(dish.priceCents, dish.currency) }), warning: false }]),
    ...(adjusted.available ? [] : [{ text: t("branchMenu.soldOut"), warning: true }]),
    ...(adjusted.hidden ? [{ text: t("branchMenu.hidden"), warning: true }] : []),
  ];
  if (flags.length === 0) return null;
  return (
    <ul className={styles.flags}>
      {flags.map((flag) => (
        <li key={flag.text} className={flag.warning ? styles.warning : undefined}>
          {flag.text}
        </li>
      ))}
    </ul>
  );
}

/**
 * A dish of the base menu as this branch serves it: the branch adjusts its price and
 * availability or hides it (ADR-0036), and sees its photo and video, which only the
 * business changes.
 */
export function BaseDishItem({
  branchId,
  adjusted,
  media,
  editable,
  onSaid,
  onLost,
}: {
  branchId: string;
  adjusted: AdjustedDish;
  /** The base draft's media, by id. */
  media: ReadonlyMap<string, Media>;
  editable: boolean;
  onSaid: (said: string) => void;
  onLost: (text: string) => void;
}) {
  const { dish, override } = adjusted;
  const [editing, setEditing] = useState(false);
  const save = useMenuChange(
    keys.branchMenuDraft(branchId),
    async (api, change: Change) => {
      if (change.kind === "put") await api.putOverride(branchId, dish.id, change.override);
      else await api.removeOverride(branchId, dish.id);
    },
    (_, change) => {
      setEditing(false);
      onSaid(
        t(
          change.kind === "put" ? "branchMenu.adjusted" : "branchMenu.cleared",
          { name: dish.name },
        ),
      );
    },
    { when: ["gone"], say: onLost },
  );

  return (
    <li className={page.item}>
      <div className={menu.dishHeader}>
        <h4 className={menu.dishName}>{dish.name}</h4>
        <p className={menu.price}>
          {formatPrice(adjusted.priceCents, dish.currency)}
        </p>
      </div>
      <Flags adjusted={adjusted} />
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
          editable={false}
          attach={async () => undefined}
        />
        <MediaSlot
          scope={branchMedia(branchId)}
          slot="video"
          mediaId={dish.videoId}
          media={media}
          name={dish.name}
          editable={false}
          attach={async () => undefined}
        />
      </div>
      {editing ? (
        <AdjustmentForm
          adjusted={adjusted}
          pending={save.change.isPending}
          problem={menuProblemText(save.problem)}
          onSubmit={(values) => {
            const change = adjustmentOf(adjusted, values);
            if (change === null) setEditing(false);
            else save.change.mutate(change);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          {save.problem !== null && (
            <p className={controls.problem} role="alert">
              {menuProblemText(save.problem)}
            </p>
          )}
          {editable && (
            <div className={page.actions}>
              <button
                type="button"
                className={controls.secondary}
                aria-label={t("branchMenu.adjustOf", { name: dish.name })}
                disabled={save.change.isPending}
                onClick={() => {
                  save.clearProblem();
                  setEditing(true);
                }}
              >
                {t("branchMenu.adjust")}
              </button>
              {override !== null && (
                <button
                  type="button"
                  className={controls.secondary}
                  aria-label={t("branchMenu.clearOf", { name: dish.name })}
                  disabled={save.change.isPending}
                  onClick={() => save.change.mutate({ kind: "clear" })}
                >
                  {t("branchMenu.clear")}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </li>
  );
}
