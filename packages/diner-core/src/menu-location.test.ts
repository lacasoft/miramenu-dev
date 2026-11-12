import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HOME_LOCATION,
  isForwardStep,
  locationAfterBack,
  menuLocationSearch,
  parseMenuLocation,
  type MenuLocation,
} from "./menu-location.ts";

const DISH = "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a";
const CATEGORY = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

describe("parseMenuLocation", () => {
  it("opens on the two-column grid with nothing selected", () => {
    assert.deepEqual(parseMenuLocation(""), HOME_LOCATION);
    assert.deepEqual(parseMenuLocation("?"), HOME_LOCATION);
  });

  it("reads the view, the dish, the category and the detail", () => {
    assert.deepEqual(
      parseMenuLocation(
        `?view=feed&dish=${DISH}&category=${CATEGORY}&detail=1`,
      ),
      { view: "feed", dishId: DISH, categoryId: CATEGORY, detail: true, comments: false },
    );
  });

  it("ignores what it does not understand, value by value", () => {
    assert.deepEqual(
      parseMenuLocation(
        "?view=list&dish=../admin&category=%E0%A4%A&detail=yes&utm_source=qr",
      ),
      HOME_LOCATION,
    );
    assert.deepEqual(parseMenuLocation(`?view=grid3&dish=${DISH}`), {
      view: "grid3",
      dishId: DISH,
      categoryId: null,
      detail: false,
      comments: false,
    });
  });

  it("never opens a detail or comments without a dish", () => {
    assert.equal(parseMenuLocation("?view=feed&detail=1").detail, false);
    assert.equal(parseMenuLocation("?view=feed&comments=1").comments, false);
    assert.equal(parseMenuLocation(`?view=feed&dish=${DISH}&comments=1`).comments, true);
  });
});

describe("menuLocationSearch", () => {
  it("leaves the defaults out, so the home view has a clean URL", () => {
    assert.equal(menuLocationSearch(HOME_LOCATION), "");
  });

  it("round-trips every location it writes", () => {
    const locations: MenuLocation[] = [
      { view: "feed", dishId: DISH, categoryId: CATEGORY, detail: true, comments: false },
      { view: "grid3", dishId: null, categoryId: CATEGORY, detail: false, comments: false },
      { view: "grid2", dishId: DISH, categoryId: null, detail: false, comments: false },
      { view: "feed", dishId: DISH, categoryId: null, detail: true, comments: true },
    ];
    for (const location of locations) {
      assert.deepEqual(
        parseMenuLocation(menuLocationSearch(location)),
        location,
      );
    }
  });
});

describe("isForwardStep", () => {
  const grid: MenuLocation = { ...HOME_LOCATION, dishId: DISH };
  const feed: MenuLocation = { ...grid, view: "feed" };

  it("gives opening the feed or a detail its own step, so back undoes it", () => {
    assert.equal(isForwardStep(grid, feed), true);
    assert.equal(isForwardStep(feed, { ...feed, detail: true }), true);
    assert.equal(isForwardStep(grid, { ...grid, detail: true }), true);
    assert.equal(isForwardStep(feed, { ...feed, comments: true }), true);
  });

  it("replaces the step for a density, a filter or the active dish", () => {
    assert.equal(isForwardStep(grid, { ...grid, view: "grid3" }), false);
    assert.equal(isForwardStep(feed, { ...feed, view: "grid2" }), false);
    assert.equal(isForwardStep(grid, { ...grid, categoryId: CATEGORY }), false);
    assert.equal(
      isForwardStep(feed, {
        ...feed,
        dishId: "3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b",
      }),
      false,
    );
  });
});

describe("locationAfterBack", () => {
  const OTHER = "3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b";
  const grid: MenuLocation = { ...HOME_LOCATION, dishId: DISH };
  const feed: MenuLocation = { ...grid, view: "feed", dishId: OTHER };

  it("brings the feed's active dish back to the grid", () => {
    assert.deepEqual(locationAfterBack(feed, grid), { ...grid, dishId: OTHER });
    assert.deepEqual(locationAfterBack(feed, HOME_LOCATION), {
      ...HOME_LOCATION,
      dishId: OTHER,
    });
  });

  it("lands as it is anywhere else", () => {
    const detail: MenuLocation = { ...feed, detail: true };
    assert.deepEqual(locationAfterBack(detail, feed), feed);
    assert.deepEqual(locationAfterBack(grid, HOME_LOCATION), HOME_LOCATION);
  });
});
