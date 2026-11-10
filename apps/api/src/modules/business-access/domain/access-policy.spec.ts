import type { Actor, ActorRole } from './actor';
import {
  decideBranchAccess,
  decideBusinessAccess,
  visibleBranchIds,
} from './access-policy';

const BUSINESS_A = 'a0000000-0000-4000-8000-000000000001';
const BUSINESS_B = 'b0000000-0000-4000-8000-000000000001';
const BRANCH_A1 = {
  id: 'a1000000-0000-4000-8000-000000000001',
  businessId: BUSINESS_A,
};
const BRANCH_A2 = {
  id: 'a2000000-0000-4000-8000-000000000001',
  businessId: BUSINESS_A,
};

const actor = (roles: ActorRole[], isSuperadmin = false): Actor => ({
  userId: 'u0000000-0000-4000-8000-000000000001',
  email: 'actor@example.test',
  name: 'Actor',
  isSuperadmin,
  roles,
});

const superadmin = actor([], true);
const businessAdminOfA = actor([
  { businessId: BUSINESS_A, branchId: null, role: 'business_admin' },
]);
const branchAdminOfA1 = actor([
  { businessId: BUSINESS_A, branchId: BRANCH_A1.id, role: 'branch_admin' },
]);
const businessAdminOfB = actor([
  { businessId: BUSINESS_B, branchId: null, role: 'business_admin' },
]);

describe('decideBusinessAccess', () => {
  it('lets the superadmin and the business admin view and administer', () => {
    for (const who of [superadmin, businessAdminOfA]) {
      expect(decideBusinessAccess(who, BUSINESS_A, 'view')).toBe('allowed');
      expect(decideBusinessAccess(who, BUSINESS_A, 'administer')).toBe(
        'allowed',
      );
    }
  });

  it('lets a branch admin view its business but forbids operating or administering it', () => {
    expect(decideBusinessAccess(branchAdminOfA1, BUSINESS_A, 'view')).toBe(
      'allowed',
    );
    expect(decideBusinessAccess(branchAdminOfA1, BUSINESS_A, 'operate')).toBe(
      'forbidden',
    );
    expect(
      decideBusinessAccess(branchAdminOfA1, BUSINESS_A, 'administer'),
    ).toBe('forbidden');
  });

  it('hides another business entirely, as if it did not exist', () => {
    expect(decideBusinessAccess(businessAdminOfB, BUSINESS_A, 'view')).toBe(
      'not_found',
    );
    expect(
      decideBusinessAccess(businessAdminOfB, BUSINESS_A, 'administer'),
    ).toBe('not_found');
    expect(decideBusinessAccess(actor([]), BUSINESS_A, 'view')).toBe(
      'not_found',
    );
  });
});

describe('decideBranchAccess', () => {
  it('lets the superadmin and the business admin administer every branch of the business', () => {
    for (const who of [superadmin, businessAdminOfA]) {
      expect(decideBranchAccess(who, BRANCH_A2, 'administer')).toBe('allowed');
    }
  });

  it('lets a branch admin view and operate its own branch but not change its settings', () => {
    expect(decideBranchAccess(branchAdminOfA1, BRANCH_A1, 'view')).toBe(
      'allowed',
    );
    expect(decideBranchAccess(branchAdminOfA1, BRANCH_A1, 'operate')).toBe(
      'allowed',
    );
    expect(decideBranchAccess(branchAdminOfA1, BRANCH_A1, 'administer')).toBe(
      'forbidden',
    );
  });

  it('lets the superadmin and the business admin operate every branch of the business', () => {
    for (const who of [superadmin, businessAdminOfA]) {
      expect(decideBranchAccess(who, BRANCH_A2, 'operate')).toBe('allowed');
    }
    expect(decideBranchAccess(businessAdminOfB, BRANCH_A2, 'operate')).toBe(
      'not_found',
    );
  });

  it('hides another branch from a branch admin, even in the same business', () => {
    expect(decideBranchAccess(branchAdminOfA1, BRANCH_A2, 'view')).toBe(
      'not_found',
    );
    expect(decideBranchAccess(branchAdminOfA1, BRANCH_A2, 'operate')).toBe(
      'not_found',
    );
  });

  it('hides the branches of another business', () => {
    expect(decideBranchAccess(businessAdminOfB, BRANCH_A1, 'view')).toBe(
      'not_found',
    );
  });

  it('does not let a branch role leak to a branch with the same id in another business', () => {
    const forged = { id: BRANCH_A1.id, businessId: BUSINESS_B };
    for (const level of ['view', 'operate', 'administer'] as const) {
      expect(decideBranchAccess(branchAdminOfA1, forged, level)).toBe(
        'not_found',
      );
    }
    expect(decideBranchAccess(businessAdminOfA, forged, 'view')).toBe(
      'not_found',
    );
  });
});

describe('visibleBranchIds', () => {
  it('shows every branch to the business admin and the superadmin', () => {
    expect(visibleBranchIds(businessAdminOfA, BUSINESS_A)).toBe('all');
    expect(visibleBranchIds(superadmin, BUSINESS_A)).toBe('all');
  });

  it('shows a branch admin only the branches it manages', () => {
    expect(visibleBranchIds(branchAdminOfA1, BUSINESS_A)).toEqual(
      new Set([BRANCH_A1.id]),
    );
    expect(visibleBranchIds(branchAdminOfA1, BUSINESS_B)).toEqual(new Set());
  });
});
