import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { moderationProblemOf, rereadsQueue } from "./moderation.ts";
import { hrefOf, routeOf, type AdminRoute } from "./routes.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const http = (status: number, code = "X") => ({ kind: "http", status, code });

describe("the moderation queues", () => {
  it("live under their business or their branch, with the id checked", () => {
    const routes: [string, AdminRoute][] = [
      [`/businesses/${id(10)}/comments`, { screen: "businessModeration", businessId: id(10) }],
      [`/branches/${id(11)}/comments`, { screen: "branchModeration", branchId: id(11) }],
    ];
    for (const [path, route] of routes) {
      assert.deepEqual(routeOf({ pathname: path, search: "" }), route, path);
      assert.equal(hrefOf(route), path);
    }
    assert.deepEqual(routeOf({ pathname: "/branches/x/comments", search: "" }), { screen: "notFound" });
  });

  it("says what a refused decision means, and when to read the queue again", () => {
    const cases: [ReturnType<typeof http> | { kind: string }, string, boolean][] = [
      [http(409, "COMMENT_CHANGED"), "changed", true],
      [http(404, "NOT_FOUND"), "gone", true],
      [http(403, "FORBIDDEN"), "forbidden", false],
      [http(503, "SERVICE_UNAVAILABLE"), "unavailable", false],
      [{ kind: "network" }, "unavailable", false],
    ];
    for (const [failure, problem, rereads] of cases) {
      const found = moderationProblemOf(failure);
      assert.equal(found, problem, JSON.stringify(failure));
      assert.equal(rereadsQueue(found), rereads, problem);
    }
  });
});
