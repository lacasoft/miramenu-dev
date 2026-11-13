import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { t } from "../i18n";
import { actor, business, fakeAdminApi, here, id, renderAdmin } from "../test/fake-admin";
import { branchOf, type World } from "../test/fake-world";

afterEach(cleanup);

const LA_FONDA = id(10);
const world = (extra: Partial<World> = {}): World => ({
  businesses: [business(10, "La Fonda")],
  branches: [branchOf(11, LA_FONDA, "Centro", "centro"), branchOf(12, LA_FONDA, "Norte", "norte")],
  users: [],
  mailWorks: true,
  ...extra,
});
const superadmin = actor([], true);
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

describe("creating a business", () => {
  it("lets the superadmin give a restaurant its place and first admin, then open it", async () => {
    const { api } = fakeAdminApi({ signedIn: superadmin, world: world() });
    renderAdmin(api, "/");
    fireEvent.click(await screen.findByRole("link", { name: t("home.newBusiness") }));
    expect(here()).toBe("/businesses/new");

    press(t("newBusiness.submit"));
    // Name, subdomain, the admin's name and email.
    expect(screen.getAllByText(t("field.required"))).toHaveLength(4);
    type(t("newBusiness.subdomain"), "Admin");
    expect((screen.getByLabelText(t("newBusiness.subdomain")) as HTMLInputElement).value).toBe("admin");
    expect(screen.getByText(t("field.subdomain.reserved"))).toBeTruthy();

    type(t("newBusiness.name"), "  Tacos Beto ");
    type(t("newBusiness.subdomain"), "tacosbeto");
    type(t("newBusiness.adminName"), "Beto");
    type(t("newBusiness.adminEmail"), "beto@tacos.example");
    press(t("newBusiness.submit"));

    expect(await screen.findByText(t("newBusiness.created", { name: "Tacos Beto" }))).toBeTruthy();
    expect(api.createBusiness).toHaveBeenCalledWith({
      name: "Tacos Beto",
      country: "MX",
      subdomain: "tacosbeto",
      admin: { name: "Beto", email: "beto@tacos.example" },
    });
    fireEvent.click(screen.getByRole("link", { name: t("newBusiness.open", { name: "Tacos Beto" }) }));
    expect(await screen.findByRole("heading", { level: 1, name: "Tacos Beto" })).toBeTruthy();
  });

  it("says a taken subdomain on its field, and an invitation that could not go out", async () => {
    const { api } = fakeAdminApi({ signedIn: superadmin, world: world({ mailWorks: false }) });
    renderAdmin(api, "/businesses/new");
    await screen.findByLabelText(t("newBusiness.name"));
    type(t("newBusiness.name"), "Otra Fonda");
    type(t("newBusiness.subdomain"), "lafonda");
    type(t("newBusiness.adminName"), "Eva");
    type(t("newBusiness.adminEmail"), "eva@otra.example");
    press(t("newBusiness.submit"));
    expect(await screen.findByText(t("field.subdomain.taken"))).toBeTruthy();

    type(t("newBusiness.subdomain"), "otrafonda");
    expect(screen.queryByText(t("field.subdomain.taken"))).toBeNull();
    press(t("newBusiness.submit"));
    expect(await screen.findByText(t("newBusiness.createdNotSent", { name: "Otra Fonda" }))).toBeTruthy();
  });

  it("is the superadmin's alone", async () => {
    const { api } = fakeAdminApi({ signedIn: actor(), world: world() });
    renderAdmin(api, "/businesses/new");
    expect(await screen.findByRole("heading", { name: t("status.forbidden.title") })).toBeTruthy();
    // Nor is it offered on their home.
    fireEvent.click(screen.getByRole("link", { name: t("notFound.home") }));
    expect(await screen.findByRole("link", { name: "La Fonda" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: t("home.newBusiness") })).toBeNull();
  });
});

describe("a business", () => {
  it("opens from its card on the home", async () => {
    const { api } = fakeAdminApi({ signedIn: actor(), world: world() });
    renderAdmin(api, "/");
    fireEvent.click(await screen.findByRole("link", { name: "La Fonda" }));
    expect(here()).toBe(`/businesses/${LA_FONDA}`);
    expect(await screen.findByRole("heading", { level: 1, name: "La Fonda" })).toBeTruthy();
  });

  it("lets its admin change its data, sending only what changed", async () => {
    const taken = world({ businesses: [business(10, "La Fonda"), business(20, "Tacos Beto")] });
    const { api } = fakeAdminApi({ signedIn: actor(), world: taken });
    renderAdmin(api, `/businesses/${LA_FONDA}`);
    fireEvent.click(await screen.findByRole("button", { name: t("business.edit") }));
    expect(screen.getByText(t("business.aliasNote"))).toBeTruthy();

    type(t("business.subdomain"), "tacosbeto");
    press(t("common.save"));
    expect(await screen.findByText(t("field.subdomain.taken"))).toBeTruthy();
    type(t("business.subdomain"), "fonda");
    press(t("common.save"));

    expect(await screen.findByText(t("business.saved"))).toBeTruthy();
    expect(api.updateBusiness).toHaveBeenLastCalledWith(LA_FONDA, { subdomain: "fonda" });
    expect(screen.getByText("fonda")).toBeTruthy();
  });

  it("shows a branch admin the business and only their branches, with nothing to change", async () => {
    const branchAdmin = actor([{ businessId: LA_FONDA, branchId: id(11), role: "branch_admin" }]);
    const { api } = fakeAdminApi({ signedIn: branchAdmin, world: world() });
    renderAdmin(api, `/businesses/${LA_FONDA}`);

    expect(await screen.findByRole("link", { name: "Centro" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Norte" })).toBeNull();
    expect(screen.queryByRole("button", { name: t("business.edit") })).toBeNull();
    expect(screen.queryByRole("button", { name: t("business.newBranch") })).toBeNull();
    expect(screen.queryByRole("link", { name: t("business.openTeam") })).toBeNull();
  });

  it("creates a branch, saying a taken address on its field", async () => {
    const { api } = fakeAdminApi({ signedIn: actor(), world: world() });
    renderAdmin(api, `/businesses/${LA_FONDA}`);
    fireEvent.click(await screen.findByRole("button", { name: t("business.newBranch") }));

    type(t("branch.name"), "Sur");
    type(t("branch.slug"), "Centro");
    press(t("branch.create"));
    expect(await screen.findByText(t("field.slug.taken"))).toBeTruthy();
    type(t("branch.slug"), "sur");
    press(t("branch.create"));

    expect(await screen.findByText(t("branch.created", { name: "Sur" }))).toBeTruthy();
    expect(api.createBranch).toHaveBeenLastCalledWith(LA_FONDA, { name: "Sur", slug: "sur" });
    const sur = await screen.findByRole("link", { name: "Sur" });
    fireEvent.click(sur);
    expect(await screen.findByRole("heading", { level: 1, name: "Sur" })).toBeTruthy();
  });

  it("is not found outside the person's scope", async () => {
    const { api } = fakeAdminApi({ signedIn: actor(), world: world() });
    renderAdmin(api, `/businesses/${id(99)}`);
    expect(await screen.findByRole("heading", { name: t("notFound.title") })).toBeTruthy();
    expect(within(screen.getByRole("main")).getByRole("link", { name: t("notFound.home") })).toBeTruthy();
  });
});
