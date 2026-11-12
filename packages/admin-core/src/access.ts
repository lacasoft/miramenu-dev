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
