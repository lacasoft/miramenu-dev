import type { Actor } from './actor';

/** view: read the object. administer: change its settings, branches or people. */
export type AccessLevel = 'view' | 'administer';

/**
 * not_found: the object is outside the actor's scope, answered as 404 so its existence is
 * not revealed (ADR-0019). forbidden: inside the scope, but the role is not enough (403,
 * ADR-0032).
 */
export type AccessDecision = 'allowed' | 'not_found' | 'forbidden';

export interface BranchRef {
  id: string;
  businessId: string;
}

const isBusinessAdmin = (actor: Actor, businessId: string) =>
  actor.roles.some(
    (role) => role.role === 'business_admin' && role.businessId === businessId,
  );

export function decideBusinessAccess(
  actor: Actor,
  businessId: string,
  level: AccessLevel,
): AccessDecision {
  // The superadmin goes through the same check and is let through explicitly (ADR-0019).
  if (actor.isSuperadmin || isBusinessAdmin(actor, businessId))
    return 'allowed';
  const isBranchAdminHere = actor.roles.some(
    (role) => role.role === 'branch_admin' && role.businessId === businessId,
  );
  if (!isBranchAdminHere) return 'not_found';
  return level === 'view' ? 'allowed' : 'forbidden';
}

export function decideBranchAccess(
  actor: Actor,
  branch: BranchRef,
  level: AccessLevel,
): AccessDecision {
  if (actor.isSuperadmin || isBusinessAdmin(actor, branch.businessId))
    return 'allowed';
  const isBranchAdminOfIt = actor.roles.some(
    (role) => role.role === 'branch_admin' && role.branchId === branch.id,
  );
  // A branch admin of another branch, even in the same business, does not see this one.
  if (!isBranchAdminOfIt) return 'not_found';
  return level === 'view' ? 'allowed' : 'forbidden';
}

/** Branches of a business the actor may list: all of them, or only the ones it manages. */
export function visibleBranchIds(
  actor: Actor,
  businessId: string,
): 'all' | ReadonlySet<string> {
  if (actor.isSuperadmin || isBusinessAdmin(actor, businessId)) return 'all';
  return new Set(
    actor.roles
      .filter(
        (role) =>
          role.role === 'branch_admin' && role.businessId === businessId,
      )
      .map((role) => role.branchId)
      .filter((branchId): branchId is string => branchId !== null),
  );
}
