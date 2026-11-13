/** The admin's server data in the query cache, by what it is. */
export const keys = {
  businesses: ["admin-businesses"] as const,
  business: (businessId: string) => ["admin-business", businessId] as const,
  branches: (businessId: string) => ["admin-branches", businessId] as const,
  allBranches: (businessId: string) => ["admin-branches", businessId, "all"] as const,
  branch: (branchId: string) => ["admin-branch", branchId] as const,
  qr: (branchId: string) => ["admin-branch-qr", branchId] as const,
  team: (businessId: string) => ["admin-team", businessId] as const,
  menuDraft: (businessId: string) => ["admin-menu-draft", businessId] as const,
};
