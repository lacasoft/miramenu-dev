import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { t } from "../i18n";
import {
  actor,
  business,
  fakeAdminApi,
  here,
  httpError,
  id,
  renderAdmin,
  settled,
} from "../test/fake-admin";
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
const MENU = `/businesses/${LA_FONDA}/menu`;
const TACOS = categoryOf(20, "Tacos", 0);
const BEBIDAS = categoryOf(21, "Bebidas", 1);
const PASTOR = dishOf(30, TACOS.id, "Pastor", 9500, 0);
const SUADERO = dishOf(31, TACOS.id, "Suadero", 8000, 1);
const world = (menu?: MenuState): World => ({
  businesses: [business(10, "La Fonda")],
  branches: [branchOf(11, LA_FONDA, "Centro", "centro")],
  users: [],
  mailWorks: true,
  menus: menu === undefined ? {} : { [LA_FONDA]: menu },
});
const tacos = () =>
  emptyMenu({
    draftVersion: 3,
    profile: { name: "La Fonda", socialLinks: [], logoId: null },
    categories: [{ ...TACOS }, { ...BEBIDAS }],
    dishes: [{ ...PASTOR }, { ...SUADERO }],
  });
const owner = actor();
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const press = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
const headings = (level: number) =>
  screen.getAllByRole("heading", { level }).map((each) => each.textContent);
const categoryBlock = (name: string) =>
  screen.getByRole("heading", { level: 3, name }).closest("li") as HTMLElement;

describe("the base menu's draft", () => {
  it("is reached from its business, and an empty one says where to start", async () => {
    const { api } = fakeAdminApi({ signedIn: owner, world: world() });
    renderAdmin(api, `/businesses/${LA_FONDA}`);
    fireEvent.click(
      await screen.findByRole("link", { name: t("business.openMenu") }),
    );
    expect(here()).toBe(MENU);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: t("menu.title", { name: "La Fonda" }),
      }),
    ).toBeTruthy();
    expect(screen.getByText(t("menu.draftNote"))).toBeTruthy();
    expect(screen.getByText(t("publish.never"))).toBeTruthy();
    expect(screen.getByText(t("menu.profileMissing"))).toBeTruthy();
    expect(screen.getByText(t("menu.noCategories"))).toBeTruthy();
  });

  it("creates the profile with the business's name suggested, its links checked before sending", async () => {
    const { api } = fakeAdminApi({ signedIn: owner, world: world() });
    renderAdmin(api, MENU);
    fireEvent.click(
      await screen.findByRole("button", { name: t("menu.createProfile") }),
    );
    expect(
      (screen.getByLabelText(t("menu.profileName")) as HTMLInputElement).value,
    ).toBe("La Fonda");

    press(t("menu.addSocialLink"));
    expect(
      screen.getByRole("group", { name: t("menu.socialLink", { number: 1 }) }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText(t("menu.network")), {
      target: { value: "tiktok" },
    });
    type(t("menu.url"), "tiktok.com/@lafonda");
    press(t("common.save"));
    expect(screen.getByText(t("field.url.format"))).toBeTruthy();
    await settled();
    expect(api.putProfile).not.toHaveBeenCalled();

    type(t("menu.url"), " https://tiktok.com/@lafonda ");
    press(t("common.save"));
    expect(await screen.findByText(t("menu.profileSaved"))).toBeTruthy();
    expect(api.putProfile).toHaveBeenCalledWith(LA_FONDA, {
      name: "La Fonda",
      socialLinks: [{ network: "tiktok", url: "https://tiktok.com/@lafonda" }],
      logoId: null,
    });
    expect(
      await screen.findByText(
        `${t("network.tiktok")}: https://tiktok.com/@lafonda`,
      ),
    ).toBeTruthy();
  });

  it("keeps the logo when the profile changes, so saving never detaches it", async () => {
    const menu = emptyMenu({
      profile: {
        name: "La Fonda",
        socialLinks: [
          { network: "instagram", url: "https://instagram.com/lafonda" },
        ],
        logoId: id(40),
      },
      media: [readyMedia(40)],
    });
    const { api } = fakeAdminApi({ signedIn: owner, world: world(menu) });
    renderAdmin(api, MENU);
    fireEvent.click(
      await screen.findByRole("button", { name: t("menu.editProfile") }),
    );
    press(t("menu.removeSocialLink", { number: 1 }));
    type(t("menu.profileName"), "La Fonda de Rosa");
    press(t("common.save"));
    expect(await screen.findByText(t("menu.profileSaved"))).toBeTruthy();
    expect(api.putProfile).toHaveBeenCalledWith(LA_FONDA, {
      name: "La Fonda de Rosa",
      socialLinks: [],
      logoId: id(40),
    });
  });

  it("creates a category and a dish in it, the price checked before sending and shown in pesos", async () => {
    const { api, world: state } = fakeAdminApi({
      signedIn: owner,
      world: world(),
    });
    renderAdmin(api, MENU);
    fireEvent.click(
      await screen.findByRole("button", { name: t("menu.newCategory") }),
    );
    press(t("menu.createCategory"));
    expect(screen.getByText(t("field.required"))).toBeTruthy();
    type(t("menu.categoryName"), " Tacos ");
    press(t("menu.createCategory"));
    expect(
      await screen.findByText(t("menu.categoryCreated", { name: "Tacos" })),
    ).toBeTruthy();
    expect(api.createCategory).toHaveBeenCalledWith(LA_FONDA, {
      name: "Tacos",
    });

    fireEvent.click(
      await screen.findByRole("button", {
        name: t("menu.newDishIn", { category: "Tacos" }),
      }),
    );
    type(t("menu.dishName"), "Pastor");
    type(t("menu.price"), "85,5");
    press(t("menu.createDish"));
    expect(screen.getByText(t("field.price.format"))).toBeTruthy();
    type(t("menu.price"), "100000.01");
    press(t("menu.createDish"));
    expect(screen.getByText(t("field.price.tooHigh"))).toBeTruthy();
    await settled();
    expect(api.createDish).not.toHaveBeenCalled();

    type(t("menu.price"), "85.50");
    type(t("menu.description"), "  Con piña  ");
    press(t("menu.createDish"));
    expect(
      await screen.findByText(t("menu.dishCreated", { name: "Pastor" })),
    ).toBeTruthy();
    expect(api.createDish).toHaveBeenCalledWith(LA_FONDA, {
      categoryId: state.menus?.[LA_FONDA]?.categories[0]?.id,
      name: "Pastor",
      description: "Con piña",
      priceCents: 8550,
      currency: "MXN",
    });
    const block = within(categoryBlock("Tacos"));
    expect(
      await block.findByRole("heading", { level: 4, name: "Pastor" }),
    ).toBeTruthy();
    expect(block.getByText("$85.50")).toBeTruthy();
    expect(block.getByText("Con piña")).toBeTruthy();
  });

  it("sends only what changed, nothing when nothing did, and a dish that changes category goes last there", async () => {
    const { api } = fakeAdminApi({ signedIn: owner, world: world(tacos()) });
    renderAdmin(api, MENU);
    fireEvent.click(
      await screen.findByRole("button", {
        name: t("menu.editDish", { name: "Pastor" }),
      }),
    );
    expect(
      (screen.getByLabelText(t("menu.price")) as HTMLInputElement).value,
    ).toBe("95.00");
    press(t("common.save"));
    await settled();
    expect(api.updateDish).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(t("menu.price"))).toBeNull();

    press(t("menu.editDish", { name: "Pastor" }));
    type(t("menu.price"), "99");
    press(t("common.save"));
    expect(
      await screen.findByText(t("menu.dishSaved", { name: "Pastor" })),
    ).toBeTruthy();
    expect(api.updateDish).toHaveBeenLastCalledWith(LA_FONDA, PASTOR.id, {
      priceCents: 9900,
    });
    expect(await screen.findByText("$99.00")).toBeTruthy();

    press(t("menu.editDish", { name: "Suadero" }));
    fireEvent.change(screen.getByLabelText(t("menu.category")), {
      target: { value: BEBIDAS.id },
    });
    press(t("common.save"));
    expect(
      await screen.findByText(t("menu.dishSaved", { name: "Suadero" })),
    ).toBeTruthy();
    expect(api.updateDish).toHaveBeenLastCalledWith(LA_FONDA, SUADERO.id, {
      categoryId: BEBIDAS.id,
      position: 0,
    });
    expect(
      await within(categoryBlock("Bebidas")).findByRole("heading", {
        level: 4,
        name: "Suadero",
      }),
    ).toBeTruthy();
  });

  it("moves categories and dishes a place up or down", async () => {
    const menu = tacos();
    const { api } = fakeAdminApi({ signedIn: owner, world: world(menu) });
    renderAdmin(api, MENU);
    fireEvent.click(
      await screen.findByRole("button", {
        name: t("menu.moveDown", { name: "Tacos" }),
      }),
    );
    expect(
      await screen.findByText(t("menu.moved", { name: "Tacos" })),
    ).toBeTruthy();
    expect(api.updateCategory.mock.calls).toEqual([
      [LA_FONDA, TACOS.id, { position: 1 }],
      [LA_FONDA, BEBIDAS.id, { position: 0 }],
    ]);
    expect(headings(3)).toEqual(["Bebidas", "Tacos"]);
    expect(
      screen
        .getByRole("button", { name: t("menu.moveUp", { name: "Bebidas" }) })
        .getAttribute("aria-disabled"),
    ).toBe("true");

    press(t("menu.moveDown", { name: "Pastor" }));
    expect(
      await screen.findByText(t("menu.moved", { name: "Pastor" })),
    ).toBeTruthy();
    expect(api.updateDish.mock.calls).toEqual([
      [LA_FONDA, PASTOR.id, { position: 1 }],
      [LA_FONDA, SUADERO.id, { position: 0 }],
    ]);
    expect(headings(4)).toEqual(["Suadero", "Pastor"]);

  });

  it("puts a category tied with another where it was asked", async () => {
    // Both at 0: the API orders them by name, Bebidas first.
    const menu = tacos();
    for (const category of menu.categories) category.position = 0;
    const { api } = fakeAdminApi({ signedIn: owner, world: world(menu) });
    renderAdmin(api, MENU);
    fireEvent.click(await screen.findByRole("button", { name: t("menu.moveUp", { name: "Tacos" }) }));
    expect(await screen.findByText(t("menu.moved", { name: "Tacos" }))).toBeTruthy();
    expect(api.updateCategory.mock.calls).toEqual([[LA_FONDA, BEBIDAS.id, { position: 1 }]]);
    expect(headings(3)).toEqual(["Tacos", "Bebidas"]);
  });

  it("removes a category only once it is empty, and a dish only after confirming", async () => {
    const { api } = fakeAdminApi({ signedIn: owner, world: world(tacos()) });
    renderAdmin(api, MENU);
    fireEvent.click(
      await screen.findByRole("button", {
        name: t("menu.removeCategoryOf", { name: "Tacos" }),
      }),
    );
    press(t("menu.confirmRemoveCategory", { name: "Tacos" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      t("menu.problem.categoryInUse"),
    );

    press(t("menu.removeDish", { name: "Suadero" }));
    expect(screen.getByText(t("menu.removeDishWarning"))).toBeTruthy();
    await settled();
    expect(api.removeDish).not.toHaveBeenCalled();
    press(t("menu.confirmRemoveDish", { name: "Suadero" }));
    expect(
      await screen.findByText(t("menu.dishRemoved", { name: "Suadero" })),
    ).toBeTruthy();
    expect(api.removeDish).toHaveBeenCalledWith(LA_FONDA, SUADERO.id);

    press(t("menu.removeCategoryOf", { name: "Bebidas" }));
    press(t("menu.confirmRemoveCategory", { name: "Bebidas" }));
    expect(
      await screen.findByText(t("menu.categoryRemoved", { name: "Bebidas" })),
    ).toBeTruthy();
    expect(api.removeCategory).toHaveBeenLastCalledWith(LA_FONDA, BEBIDAS.id);
    expect(headings(3)).toEqual(["Tacos"]);
  });

  it("says the menu's limit, and shows the menu as it is when what was changed is gone", async () => {
    const menu = tacos();
    const { api } = fakeAdminApi({ signedIn: owner, world: world(menu) });
    api.createCategory.mockRejectedValueOnce(
      httpError(409, "MENU_LIMIT_REACHED"),
    );
    renderAdmin(api, MENU);
    fireEvent.click(
      await screen.findByRole("button", { name: t("menu.newCategory") }),
    );
    type(t("menu.categoryName"), "Postres");
    press(t("menu.createCategory"));
    expect((await screen.findByRole("alert")).textContent).toBe(
      t("menu.problem.limit"),
    );
    press(t("common.cancel"));

    press(t("menu.editDish", { name: "Pastor" }));
    menu.dishes = menu.dishes.filter((dish) => dish.id !== PASTOR.id);
    type(t("menu.price"), "99");
    press(t("common.save"));
    // The dish goes from the list, and the list says why.
    await waitFor(() => expect(headings(4)).toEqual(["Suadero"]));
    expect(screen.getByRole("alert").textContent).toBe(t("menu.problem.gone"));
  });

  it("lets a branch admin read the base menu without anything to change", async () => {
    const branchAdmin = actor([
      { businessId: LA_FONDA, branchId: id(11), role: "branch_admin" },
    ]);
    const { api } = fakeAdminApi({
      signedIn: branchAdmin,
      world: world(tacos()),
    });
    renderAdmin(api, `/businesses/${LA_FONDA}`);
    fireEvent.click(
      await screen.findByRole("link", { name: t("business.viewMenu") }),
    );

    expect(await screen.findByText(t("menu.readOnly"))).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 4, name: "Pastor" }),
    ).toBeTruthy();
    expect(screen.getByText("$95.00")).toBeTruthy();
    for (const name of [
      t("menu.newCategory"),
      t("menu.editProfile"),
      t("publish.review"),
      t("menu.editDish", { name: "Pastor" }),
      t("menu.newDishIn", { category: "Tacos" }),
    ])
      expect(screen.queryByRole("button", { name })).toBeNull();
  });

  it("is not found outside the person's businesses", async () => {
    const elsewhere = actor([
      { businessId: id(99), branchId: null, role: "business_admin" },
    ]);
    const { api } = fakeAdminApi({
      signedIn: elsewhere,
      world: world(tacos()),
    });
    renderAdmin(api, MENU);
    expect(await screen.findByText(t("notFound.title"))).toBeTruthy();
    expect(screen.queryByText("Pastor")).toBeNull();
  });
});
