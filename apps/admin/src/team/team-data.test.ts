import type { AdminApi } from "@miramenu/api-client";
import { describe, expect, it, vi } from "vitest";
import { business, id } from "../test/fake-admin";
import { branchOf } from "../test/fake-world";
import { allBranchesOf } from "./team-data";

describe("allBranchesOf", () => {
  it("follows the cursor until the last page, so the role form offers every branch", async () => {
    const LA_FONDA = business(10, "La Fonda").id;
    const branches = vi
      .fn()
      .mockResolvedValueOnce({ items: [branchOf(11, LA_FONDA, "Centro", "centro")], nextCursor: "p2" })
      .mockResolvedValueOnce({ items: [branchOf(12, LA_FONDA, "Norte", "norte")], nextCursor: null });
    const all = await allBranchesOf({ branches } as unknown as AdminApi, LA_FONDA);
    expect(all.map((branch) => branch.id)).toEqual([id(11), id(12)]);
    expect(branches.mock.calls).toEqual([[LA_FONDA, undefined], [LA_FONDA, "p2"]]);
  });
});
