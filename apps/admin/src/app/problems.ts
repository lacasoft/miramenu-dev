import type { FieldProblem, SaveProblem } from "@miramenu/admin-core";
import { t } from "../i18n";

/** What a field's problem says, by the kind of field. */
export function fieldText(
  field: "name" | "subdomain" | "slug" | "email",
  problem: FieldProblem | null,
): string | null {
  switch (problem) {
    case null:
      return null;
    case "required":
      return t("field.required");
    case "tooLong":
      return t("field.tooLong");
    case "reserved":
      return t("field.subdomain.reserved");
    case "taken":
      return field === "slug" ? t("field.slug.taken") : t("field.subdomain.taken");
    case "format":
      if (field === "slug") return t("field.slug.format");
      if (field === "email") return t("field.email.format");
      return t("field.subdomain.format");
  }
}

const SAVE_TEXT = {
  invalid: "save.invalid",
  forbidden: "save.forbidden",
  notFound: "save.notFound",
  alreadyActive: "save.alreadyActive",
  branchGone: "save.branchGone",
  unavailable: "save.unavailable",
} as const;

/** What a failed save says for the whole form; a taken address is said on its field. */
export const saveText = (problem: SaveProblem | null): string | null =>
  problem === null || problem.field !== "form" ? null : t(SAVE_TEXT[problem.reason]);

/** The field a taken address belongs to, if that is what the save ran into. */
export const takenOn = (problem: SaveProblem | null, field: "subdomain" | "slug"): FieldProblem | null =>
  problem !== null && problem.field === field ? "taken" : null;
