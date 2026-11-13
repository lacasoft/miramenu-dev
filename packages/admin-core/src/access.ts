import type { SessionActor } from "@miramenu/contracts";

/** What a person reaches in one business, from their roles there. */
export interface BusinessAccess {
  businessId: string;
  /** Admin restaurante: the whole business, its branches and its team. */
  administers: boolean;
  /** Admin sucursal: these branches only. */
  branchIds: string[];
}

/**
 * What each business means to this person, for the navigation and the home screen. The
 * API still decides every permission (404 outside, 403 inside, ADR-0032): this only says
 * what to offer, never what to allow. The superadmin reaches every business without a
 * role in any.
 */
export function accessOf(actor: SessionActor): BusinessAccess[] {
  const byBusiness = new Map<string, BusinessAccess>();
  for (const { businessId, branchId, role } of actor.roles) {
    const access = byBusiness.get(businessId) ?? {
      businessId,
      administers: false,
      branchIds: [],
    };
    if (role === "business_admin") access.administers = true;
    else if (branchId !== null && !access.branchIds.includes(branchId))
      access.branchIds.push(branchId);
    byBusiness.set(businessId, access);
  }
  return [...byBusiness.values()];
}

/** Someone signed in with nothing to administer: an invited admin whose roles were removed. */
export const hasAccess = (actor: SessionActor): boolean =>
  actor.isSuperadmin || actor.roles.length > 0;

/** The sections of the app's navigation; each phase adds its own. */
export type Section = "home";

export const sectionsOf = (actor: SessionActor): Section[] =>
  hasAccess(actor) ? ["home"] : [];

/**
 * Whether to offer changing a business, its branches and its team: its admin restaurante
 * and the superadmin (the API's `administer`, ADR-0032). The API still decides.
 */
export const canAdminister = (actor: SessionActor, businessId: string): boolean =>
  actor.isSuperadmin ||
  actor.roles.some((role) => role.role === "business_admin" && role.businessId === businessId);

/**
 * Whether to offer changing a branch's menu: its business's admin, the superadmin and the
 * branch's own admin (the API's `operate`, ADR-0036). The API still decides.
 */
export const canOperateBranch = (actor: SessionActor, branch: { id: string; businessId: string }): boolean =>
  canAdminister(actor, branch.businessId) ||
  actor.roles.some((role) => role.role === "branch_admin" && role.branchId === branch.id);

/** Only the superadmin gives a business its place in Miramenu (ADR-0020). */
export const canCreateBusiness = (actor: SessionActor): boolean => actor.isSuperadmin;
