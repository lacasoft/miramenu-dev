import type { BusinessUser, RoleTarget } from "@miramenu/contracts";

/** What a person is in one business, as the team's form chooses it. */
export type RoleChoice =
  | { kind: "business" }
  /** Admin of these branches; none chosen yet is a problem, not a role. */
  | { kind: "branches"; branchIds: string[] };

/** The person's roles in this business as a choice; null when they hold none here. */
export function roleChoiceOf(user: BusinessUser, businessId: string): RoleChoice | null {
  const here = user.roles.filter((role) => role.businessId === businessId);
  if (here.some((role) => role.role === "business_admin")) return { kind: "business" };
  const branchIds = [
    ...new Set(
      here.flatMap((role) =>
        role.role === "branch_admin" && role.branchId !== null ? [role.branchId] : [],
      ),
    ),
  ];
  return branchIds.length === 0 ? null : { kind: "branches", branchIds };
}

/** The roles the API takes for a choice (PUT …/roles). */
export function roleTargetsOf(choice: RoleChoice): RoleTarget[] {
  return choice.kind === "business"
    ? [{ role: "business_admin" }]
    : choice.branchIds.map((branchId) => ({ role: "branch_admin", branchId }));
}

/** An admin sucursal needs at least one branch. */
export const roleChoiceProblemOf = (choice: RoleChoice): "noBranch" | null =>
  choice.kind === "branches" && choice.branchIds.length === 0 ? "noBranch" : null;
