import type {
  Branch,
  Business,
  BusinessUser,
  CreateBranchRequest,
  CreateBusinessRequest,
  InviteUserRequest,
  RoleTarget,
  SessionActor,
  UpdateBranchRequest,
  UpdateBusinessRequest,
} from "@miramenu/contracts";
import { vi } from "vitest";
import { httpError, id } from "./fake-admin";

/** Businesses, branches and people in memory, answering as the API does. */
export interface World {
  businesses: Business[];
  branches: Branch[];
  users: BusinessUser[];
  /** False: the mail provider fails, invitations go out unsent. */
  mailWorks: boolean;
}

export const branchOf = (n: number, businessId: string, name: string, slug: string, subdomain: string | null = null): Branch => ({
  id: id(n),
  businessId,
  name,
  slug,
  subdomain,
  url: subdomain === null ? `https://lafonda.example.test/${slug}` : `https://${subdomain}.example.test/`,
  createdAt: "2026-11-12T18:00:00.000Z",
});

export const userOf = (n: number, name: string, roles: BusinessUser["roles"], status: BusinessUser["status"] = "active"): BusinessUser => ({
  id: id(n),
  email: `${name.toLowerCase()}@lafonda.example`,
  name,
  status,
  roles,
});

let next = 500;
const fresh = () => id((next += 1));

/** The calls of businesses, branches, QR and team over a world, as the given person. */
export function worldApi(world: World, actor: () => SessionActor | null) {
  const visible = (businessId: string) => {
    const who = actor();
    if (who === null) throw httpError(401, "UNAUTHENTICATED");
    const owner = who.isSuperadmin || who.roles.some((r) => r.role === "business_admin" && r.businessId === businessId);
    const branchIds = who.roles.filter((r) => r.role === "branch_admin" && r.businessId === businessId).map((r) => r.branchId);
    if (!owner && branchIds.length === 0) throw httpError(404, "NOT_FOUND");
    return { owner, branchIds };
  };
  const administer = (businessId: string) => {
    if (!visible(businessId).owner) throw httpError(403, "FORBIDDEN");
  };
  const businessAt = (businessId: string) => {
    const business = world.businesses.find((each) => each.id === businessId);
    if (business === undefined) throw httpError(404, "NOT_FOUND");
    visible(businessId);
    return business;
  };
  const branchAt = (branchId: string) => {
    const branch = world.branches.find((each) => each.id === branchId);
    if (branch === undefined) throw httpError(404, "NOT_FOUND");
    const { owner, branchIds } = visible(branch.businessId);
    if (!owner && !branchIds.includes(branchId)) throw httpError(404, "NOT_FOUND");
    return branch;
  };
  const subdomainTaken = (subdomain: string, except?: string) =>
    world.businesses.some((each) => each.subdomain === subdomain && each.id !== except) ||
    world.branches.some((each) => each.subdomain === subdomain && each.id !== except);
  const rolesOf = (businessId: string, roles: RoleTarget[]) =>
    roles.map((role) => ({ businessId, branchId: role.branchId ?? null, role: role.role }));
  const member = (userId: string) => {
    const user = world.users.find((each) => each.id === userId);
    if (user === undefined) throw httpError(404, "NOT_FOUND");
    return user;
  };

  return {
    createBusiness: vi.fn(async (input: CreateBusinessRequest) => {
      if (actor()?.isSuperadmin !== true) throw httpError(403, "FORBIDDEN");
      if (subdomainTaken(input.subdomain)) throw httpError(409, "SUBDOMAIN_TAKEN");
      const business: Business = { id: fresh(), name: input.name, country: input.country, subdomain: input.subdomain, createdAt: "2026-11-13T18:00:00.000Z" };
      world.businesses.push(business);
      const admin = userOf(Number(fresh().slice(-6)), input.admin.name, [{ businessId: business.id, branchId: null, role: "business_admin" }], "invited");
      world.users.push({ ...admin, email: input.admin.email });
      return { business, admin: { id: admin.id, email: input.admin.email }, invitation: { sent: world.mailWorks } };
    }),
    business: vi.fn(async (businessId: string) => businessAt(businessId)),
    updateBusiness: vi.fn(async (businessId: string, update: UpdateBusinessRequest) => {
      const business = businessAt(businessId);
      administer(businessId);
      if (update.subdomain !== undefined && subdomainTaken(update.subdomain, businessId)) throw httpError(409, "SUBDOMAIN_TAKEN");
      Object.assign(business, update);
      return { ...business };
    }),
    branches: vi.fn(async (businessId: string) => {
      businessAt(businessId);
      const { owner, branchIds } = visible(businessId);
      const items = world.branches.filter((each) => each.businessId === businessId && (owner || branchIds.includes(each.id)));
      return { items, nextCursor: null };
    }),
    createBranch: vi.fn(async (businessId: string, input: CreateBranchRequest) => {
      administer(businessId);
      if (world.branches.some((each) => each.businessId === businessId && each.slug === input.slug)) throw httpError(409, "SLUG_TAKEN");
      if (input.subdomain !== undefined && subdomainTaken(input.subdomain)) throw httpError(409, "SUBDOMAIN_TAKEN");
      const branch = branchOf(Number(fresh().slice(-6)), businessId, input.name, input.slug, input.subdomain ?? null);
      world.branches.push(branch);
      return branch;
    }),
    branch: vi.fn(async (branchId: string) => branchAt(branchId)),
    updateBranch: vi.fn(async (branchId: string, update: UpdateBranchRequest) => {
      const branch = branchAt(branchId);
      administer(branch.businessId);
      if (update.slug !== undefined && world.branches.some((each) => each.businessId === branch.businessId && each.slug === update.slug && each.id !== branchId))
        throw httpError(409, "SLUG_TAKEN");
      if (typeof update.subdomain === "string" && subdomainTaken(update.subdomain, branchId)) throw httpError(409, "SUBDOMAIN_TAKEN");
      Object.assign(branch, update);
      return { ...branch };
    }),
    branchQr: vi.fn(async (branchId: string) => {
      branchAt(branchId);
      return { code: "a2b3c4d", shortUrl: `https://mirame.example.test/a2b3c4d` };
    }),
    team: vi.fn(async (businessId: string) => {
      administer(businessId);
      const items = world.users
        .filter((user) => user.roles.some((role) => role.businessId === businessId))
        .map((user) => ({ ...user, roles: user.roles.filter((role) => role.businessId === businessId) }));
      return { items, nextCursor: null };
    }),
    inviteUser: vi.fn(async (businessId: string, invitation: InviteUserRequest) => {
      administer(businessId);
      const known = world.users.find((user) => user.email === invitation.email.toLowerCase());
      const role = rolesOf(businessId, [invitation.role]);
      if (known !== undefined) {
        known.roles.push(...role);
        return { user: { ...known }, invitation: null };
      }
      const user = { ...userOf(Number(fresh().slice(-6)), invitation.name, role, "invited"), email: invitation.email.toLowerCase() };
      world.users.push(user);
      return { user, invitation: { sent: world.mailWorks } };
    }),
    setRoles: vi.fn(async (businessId: string, userId: string, roles: RoleTarget[]) => {
      administer(businessId);
      const user = member(userId);
      user.roles = [...user.roles.filter((role) => role.businessId !== businessId), ...rolesOf(businessId, roles)];
      return { ...user };
    }),
    removeRoles: vi.fn(async (businessId: string, userId: string) => {
      administer(businessId);
      const user = member(userId);
      user.roles = user.roles.filter((role) => role.businessId !== businessId);
    }),
    resendInvitation: vi.fn(async (businessId: string, userId: string) => {
      administer(businessId);
      if (member(userId).status === "active") throw httpError(409, "USER_ALREADY_ACTIVE");
      return { sent: world.mailWorks };
    }),
  };
}
