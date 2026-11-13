import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { t } from "../i18n";
import {
  actor,
  business,
  fakeAdminApi,
  here,
  id,
  renderAdmin,
  settled,
} from "../test/fake-admin";
import {
  branchDishOf,
  emptyBranchMenu,
  type BranchMenuState,
} from "../test/fake-branch-menu";
import { readyMedia } from "../test/fake-media";
import {
  categoryOf,
  dishOf,
  emptyMenu,
  type MenuState,
} from "../test/fake-menu";
import { branchOf, type World } from "../test/fake-world";

afterEach(cleanup);

const LA_FONDA = id(10);
const CENTRO = id(11);
const NORTE = id(12);
const MENU = `/branches/${CENTRO}/menu`;
const TACOS = categoryOf(20, "Tacos", 0);
const BEBIDAS = categoryOf(21, "Bebidas", 1);
const PHOTO = readyMedia(40);
const PASTOR = {
  ...dishOf(30, TACOS.id, "Pastor", 9500, 0),
  imageId: PHOTO.id,
};
const SUADERO = dishOf(31, TACOS.id, "Suadero", 8000, 1);
const BASE_PROFILE = {
  name: "La Fonda",
  socialLinks: [
    { network: "instagram" as const, url: "https://instagram.com/lafonda" },
  ],
  logoId: null,
};
const baseMenu = (extra: Partial<MenuState> = {}) =>
  emptyMenu({
    draftVersion: 5,
    publishedVersion: 1,
    profile: { ...BASE_PROFILE },
    categories: [{ ...TACOS }, { ...BEBIDAS }],
    dishes: [{ ...PASTOR }, { ...SUADERO }],
    media: [{ ...PHOTO }],
    ...extra,
  });
const world = (
  base = baseMenu(),
  centro: BranchMenuState = emptyBranchMenu(),
): World => ({
  businesses: [business(10, "La Fonda")],
  branches: [
    branchOf(11, LA_FONDA, "Centro", "centro"),
    branchOf(12, LA_FONDA, "Norte", "norte"),
  ],
  users: [],
  mailWorks: true,
  menus: { [LA_FONDA]: base },
  branchMenus: { [CENTRO]: centro },
});
const owner = actor();
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const press = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
const item = (name: string) =>
  screen.getByRole("heading", { level: 4, name }).closest("li") as HTMLElement;

async function open(state = world(), who = actor()) {
  const fake = fakeAdminApi({ signedIn: who, world: state });
  renderAdmin(fake.api, MENU, fake.putFile);
  await screen.findByRole("heading", { level: 4, name: "Pastor" });
  return fake;
}

describe("a branch's menu over its base (ADR-0036)", () => {
  it("is reached from its branch, serving the base as it is until the branch adjusts it", async () => {
    const { api } = fakeAdminApi({ signedIn: owner, world: world() });
    renderAdmin(api, `/branches/${CENTRO}`);
    fireEvent.click(
      await screen.findByRole("link", { name: t("branch.editMenu") }),
    );
    expect(here()).toBe(MENU);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: t("branchMenu.title", { name: "Centro" }),
      }),
    ).toBeTruthy();
    expect(screen.getByText(t("branchPublish.never"))).toBeTruthy();
    expect(
      screen.getByText(
        t("branchMenu.usesBusinessProfile", { name: "La Fonda" }),
      ),
    ).toBeTruthy();
    expect(within(item("Pastor")).getByText("$95.00")).toBeTruthy();
    // The base's photo is seen, and only the business changes it.
    expect(
      within(item("Pastor")).getByAltText(
        t("media.of", { action: t("media.photo"), name: "Pastor" }),
      ),
    ).toBeTruthy();
    expect(
      screen.queryByLabelText(
        t("media.of", { action: t("media.replace.photo"), name: "Pastor" }),
      ),
    ).toBeNull();
  });

  it("adjusts a base dish's price and availability, and sends nothing that changes nothing", async () => {
    const { api } = await open();
    press(t("branchMenu.adjustOf", { name: "Suadero" }));
    press(t("common.save"));
    await settled();
    expect(api.putOverride).not.toHaveBeenCalled();
    expect(api.removeOverride).not.toHaveBeenCalled();

    press(t("branchMenu.adjustOf", { name: "Pastor" }));
    expect(
      screen.getByText(t("branchMenu.priceHint", { price: "$95.00" })),
    ).toBeTruthy();
    type(t("branchMenu.price"), "90,5");
    press(t("common.save"));
    expect(screen.getByText(t("field.price.format"))).toBeTruthy();
    type(t("branchMenu.price"), "90");
    fireEvent.click(screen.getByLabelText(t("branchMenu.available")));
    press(t("common.save"));
    expect(
      await screen.findByText(t("branchMenu.adjusted", { name: "Pastor" })),
    ).toBeTruthy();
    expect(api.putOverride).toHaveBeenCalledWith(CENTRO, PASTOR.id, {
      priceCents: 9000,
      available: false,
      hidden: false,
    });
    const pastor = within(item("Pastor"));
    expect(await pastor.findByText("$90.00")).toBeTruthy();
    expect(
      pastor.getByText(t("branchMenu.basePrice", { price: "$95.00" })),
    ).toBeTruthy();
    expect(pastor.getByText(t("branchMenu.soldOut"))).toBeTruthy();

    // The base price again, and available: no adjustment left to keep.
    press(t("branchMenu.adjustOf", { name: "Pastor" }));
    type(t("branchMenu.price"), "95");
    fireEvent.click(screen.getByLabelText(t("branchMenu.available")));
    press(t("common.save"));
    expect(
      await screen.findByText(t("branchMenu.cleared", { name: "Pastor" })),
    ).toBeTruthy();
    expect(api.removeOverride).toHaveBeenCalledWith(CENTRO, PASTOR.id);
    await waitFor(() =>
      expect(
        within(item("Pastor")).queryByText(t("branchMenu.soldOut")),
      ).toBeNull(),
    );
  });

  it("hides a base dish, and takes the adjustment away in one click", async () => {
    const { api } = await open();
    press(t("branchMenu.adjustOf", { name: "Suadero" }));
    fireEvent.click(screen.getByLabelText(t("branchMenu.hide")));
    press(t("common.save"));
    expect(
      await within(item("Suadero")).findByText(t("branchMenu.hidden")),
    ).toBeTruthy();
    expect(api.putOverride).toHaveBeenCalledWith(CENTRO, SUADERO.id, {
      priceCents: null,
      available: true,
      hidden: true,
    });
    press(t("branchMenu.clearOf", { name: "Suadero" }));
    expect(
      await screen.findByText(t("branchMenu.cleared", { name: "Suadero" })),
    ).toBeTruthy();
    expect(
      within(item("Suadero")).queryByText(t("branchMenu.hidden")),
    ).toBeNull();
  });

  it("adds a dish of its own, marks it sold out, edits it and removes it after confirming", async () => {
    const centro = emptyBranchMenu();
    const { api } = await open(world(baseMenu(), centro));
    press(t("branchMenu.newOwnIn", { category: "Bebidas" }));
    type(t("menu.dishName"), "Horchata");
    type(t("menu.price"), "35");
    press(t("menu.createDish"));
    expect(
      await screen.findByText(t("menu.dishCreated", { name: "Horchata" })),
    ).toBeTruthy();
    expect(api.createBranchDish).toHaveBeenCalledWith(CENTRO, {
      categoryId: BEBIDAS.id,
      name: "Horchata",
      description: "",
      priceCents: 3500,
      currency: "MXN",
      available: true,
    });
    await screen.findByRole("heading", { level: 4, name: "Horchata" });
    expect(within(item("Horchata")).getByText(t("branchMenu.own"))).toBeTruthy();
    const horchata = centro.dishes[0]!.id;

    press(t("branchMenu.markSoldOutOf", { name: "Horchata" }));
    expect(
      await screen.findByText(
        t("branchMenu.markedSoldOut", { name: "Horchata" }),
      ),
    ).toBeTruthy();
    expect(
      within(item("Horchata")).getByText(t("branchMenu.soldOut")),
    ).toBeTruthy();
    expect(api.updateBranchDish).toHaveBeenLastCalledWith(CENTRO, horchata, {
      available: false,
    });

    press(t("menu.editDish", { name: "Horchata" }));
    type(t("menu.price"), "38");
    press(t("common.save"));
    expect(
      await screen.findByText(t("menu.dishSaved", { name: "Horchata" })),
    ).toBeTruthy();
    expect(api.updateBranchDish).toHaveBeenLastCalledWith(CENTRO, horchata, {
      priceCents: 3800,
    });

    press(t("menu.removeDish", { name: "Horchata" }));
    expect(screen.getByText(t("branchMenu.removeOwnWarning"))).toBeTruthy();
    press(t("menu.confirmRemoveDish", { name: "Horchata" }));
    expect(
      await screen.findByText(t("menu.dishRemoved", { name: "Horchata" })),
    ).toBeTruthy();
    expect(api.removeBranchDish).toHaveBeenCalledWith(CENTRO, horchata);
  });

  it("uploads a photo of its own dish through the branch's media", async () => {
    const base = baseMenu();
    const { api } = await open(
      world(
        base,
        emptyBranchMenu({
          dishes: [branchDishOf(50, TACOS.id, "Gringa", 7000)],
        }),
      ),
    );
    fireEvent.change(
      screen.getByLabelText(
        t("media.of", { action: t("media.upload.photo"), name: "Gringa" }),
      ),
      {
        target: {
          files: [new File(["x"], "gringa.jpg", { type: "image/jpeg" })],
        },
      },
    );
    expect(await screen.findByText(t("media.processing.photo"))).toBeTruthy();
    expect(api.createBranchMedia).toHaveBeenCalledWith(CENTRO, {
      kind: "image",
      contentType: "image/jpeg",
      sizeBytes: 1,
    });
    expect(api.createMedia).not.toHaveBeenCalled();
    const media = base.media.find((each) => each.branchId === CENTRO)!;
    expect(api.completeBranchMedia).toHaveBeenCalledWith(CENTRO, media.id);
    expect(api.updateBranchDish).toHaveBeenCalledWith(CENTRO, id(50), {
      imageId: media.id,
    });
  });

  it("uses a profile of its own, started from the restaurant's, and goes back to it after confirming", async () => {
    const { api } = await open();
    press(t("branchMenu.ownProfile"));
    expect(
      (screen.getByLabelText(t("menu.profileName")) as HTMLInputElement).value,
    ).toBe("La Fonda");
    type(t("menu.profileName"), "La Fonda Centro");
    press(t("common.save"));
    expect(await screen.findByText(t("menu.profileSaved"))).toBeTruthy();
    expect(api.putBranchProfile).toHaveBeenCalledWith(CENTRO, {
      ...BASE_PROFILE,
      name: "La Fonda Centro",
    });
    expect(await screen.findByText("La Fonda Centro")).toBeTruthy();

    press(t("branchMenu.backToBusinessProfile"));
    expect(api.removeBranchProfile).not.toHaveBeenCalled();
    press(t("branchMenu.confirmBackToBusiness"));
    expect(
      await screen.findByText(t("branchMenu.profileRemoved")),
    ).toBeTruthy();
    expect(
      await screen.findByText(
        t("branchMenu.usesBusinessProfile", { name: "La Fonda" }),
      ),
    ).toBeTruthy();
  });

  it("lists only its own media with a problem, not its business's", async () => {
    const ownBroken = {
      ...readyMedia(60),
      branchId: CENTRO,
      status: "failed" as const,
      image: null,
      failureReason: "unsupported_format" as const,
    };
    const businessBroken = {
      ...readyMedia(61, "video"),
      status: "failed" as const,
      video: null,
      failureReason: "too_long" as const,
    };
    await open(
      world(baseMenu({ media: [{ ...PHOTO }, ownBroken, businessBroken] })),
    );
    const card = within(
      (
        await screen.findByRole("heading", { name: t("mediaProblems.title") })
      ).closest("section")!,
    );
    expect(card.getByText(t("media.failed.unsupported_format"))).toBeTruthy();
    expect(card.queryByText(t("media.failed.too_long"))).toBeNull();
  });
});

describe("publishing a branch", () => {
  it("waits for the base menu before sending anything", async () => {
    const { api } = await open(world(baseMenu({ publishedVersion: null })));
    press(t("publish.review"));
    expect(screen.getByText(t("branchPublish.baseMissing"))).toBeTruthy();
    press(t("branchPublish.confirm"));
    await settled();
    expect(api.publishBranchMenu).not.toHaveBeenCalled();
  });

  it("says an own dish in a category the base has not published, then publishes with a key", async () => {
    const centro = emptyBranchMenu({
      draftVersion: 4,
      dishes: [branchDishOf(50, BEBIDAS.id, "Horchata", 3500)],
      publishedCategories: [TACOS.id],
    });
    const { api } = await open(world(baseMenu(), centro));
    press(t("publish.review"));
    press(t("branchPublish.confirm"));
    expect(
      await screen.findByText(t("publish.problem.categoryNotPublished")),
    ).toBeTruthy();

    centro.publishedCategories = undefined;
    press(t("branchPublish.confirm"));
    expect(
      await screen.findByText(t("branchPublish.done", { version: 1 })),
    ).toBeTruthy();
    expect(
      await screen.findByText(t("branchPublish.version", { version: 1 })),
    ).toBeTruthy();
    const [first, second] = api.publishBranchMenu.mock.calls;
    expect(first?.slice(0, 2)).toEqual([CENTRO, { draftVersion: 4 }]);
    expect(second?.[2]).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    expect(second?.[2]).not.toBe(first?.[2]);
  });

  it("reads again a draft that changed meanwhile, and publishes the new one", async () => {
    const centro = emptyBranchMenu({ draftVersion: 4 });
    const { api } = await open(world(baseMenu(), centro));
    press(t("publish.review"));
    centro.draftVersion = 5;
    centro.dishes.push(branchDishOf(51, TACOS.id, "Campechano", 9000));
    press(t("branchPublish.confirm"));
    expect(
      await screen.findByText(t("publish.problem.draftChanged")),
    ).toBeTruthy();
    expect(
      await screen.findByRole("heading", { level: 4, name: "Campechano" }),
    ).toBeTruthy();
    press(t("branchPublish.confirm"));
    expect(
      await screen.findByText(t("branchPublish.done", { version: 1 })),
    ).toBeTruthy();
    expect(api.publishBranchMenu.mock.calls.map((call) => call[1])).toEqual([
      { draftVersion: 4 },
      { draftVersion: 5 },
    ]);
  });
});

describe("who changes a branch's menu", () => {
  it("lets a branch admin change its own branch, and finds no sibling's", async () => {
    const centroAdmin = actor([
      { businessId: LA_FONDA, branchId: CENTRO, role: "branch_admin" },
    ]);
    await open(world(), centroAdmin);
    expect(
      screen.getByRole("button", {
        name: t("branchMenu.adjustOf", { name: "Pastor" }),
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: t("publish.review") }),
    ).toBeTruthy();
    cleanup();

    const { api } = fakeAdminApi({ signedIn: centroAdmin, world: world() });
    renderAdmin(api, `/branches/${NORTE}/menu`);
    expect(await screen.findByText(t("notFound.title"))).toBeTruthy();
  });
});
