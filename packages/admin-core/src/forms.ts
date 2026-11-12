import {
  emailSchema,
  RESERVED_SUBDOMAINS,
  slugSchema,
  subdomainSchema,
} from "@miramenu/contracts";
import type { CallFailure } from "./failures.ts";

/** What is wrong with one field, as the form says it next to it. */
export type FieldProblem = "required" | "tooLong" | "format" | "reserved" | "taken";

const NAME_MAX = 120;

/** A business's, a branch's or a person's name: 1 to 120 characters once trimmed (the contract's rule). */
export function nameProblemOf(value: string): FieldProblem | null {
  const trimmed = value.trim();
  if (trimmed === "") return "required";
  return trimmed.length > NAME_MAX ? "tooLong" : null;
}

/** A subdomain the API will take: a DNS label of 3 to 63, none of the reserved ones. */
export function subdomainProblemOf(value: string): FieldProblem | null {
  if (value === "") return "required";
  if ((RESERVED_SUBDOMAINS as readonly string[]).includes(value)) return "reserved";
  return subdomainSchema.safeParse(value).success ? null : "format";
}

export function slugProblemOf(value: string): FieldProblem | null {
  if (value === "") return "required";
  return slugSchema.safeParse(value).success ? null : "format";
}

export function emailProblemOf(value: string): FieldProblem | null {
  if (value.trim() === "") return "required";
  return emailSchema.safeParse(value).success ? null : "format";
}

/** What the API's answer to a save means for the form. */
export type SaveProblem =
  | { field: "subdomain" | "slug"; reason: "taken" }
  | {
      field: "form";
      reason: "invalid" | "forbidden" | "notFound" | "alreadyActive" | "branchGone" | "unavailable";
    };

export function saveProblemOf(failure: CallFailure): SaveProblem {
  if (failure.kind === "http") {
    if (failure.code === "SUBDOMAIN_TAKEN") return { field: "subdomain", reason: "taken" };
    if (failure.code === "SLUG_TAKEN") return { field: "slug", reason: "taken" };
    if (failure.code === "USER_ALREADY_ACTIVE") return { field: "form", reason: "alreadyActive" };
    if (failure.code === "BRANCH_NOT_IN_BUSINESS") return { field: "form", reason: "branchGone" };
    if (failure.status === 400) return { field: "form", reason: "invalid" };
    if (failure.status === 403) return { field: "form", reason: "forbidden" };
    if (failure.status === 404) return { field: "form", reason: "notFound" };
  }
  return { field: "form", reason: "unavailable" };
}

/** Why a page could not load: outside the person's scope (404), inside but not theirs (403). */
export type LoadProblem = "notFound" | "forbidden" | "unavailable";

export function loadProblemOf(failure: CallFailure): LoadProblem {
  if (failure.kind === "http" && failure.status === 404) return "notFound";
  if (failure.kind === "http" && failure.status === 403) return "forbidden";
  return "unavailable";
}
