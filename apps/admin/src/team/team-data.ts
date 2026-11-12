import type { AdminApi } from "@miramenu/api-client";
import type { Branch } from "@miramenu/contracts";

/** Every branch of the business, page after page: the role form offers all of them. */
export async function allBranchesOf(api: AdminApi, businessId: string): Promise<Branch[]> {
  const branches: Branch[] = [];
  let cursor: string | undefined;
  do {
    const page = await api.branches(businessId, cursor);
    branches.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return branches;
}
