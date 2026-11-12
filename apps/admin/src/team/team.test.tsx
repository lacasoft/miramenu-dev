import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { t } from "../i18n";
import { actor, business, fakeAdminApi, httpError, id, renderAdmin } from "../test/fake-admin";
import { branchOf, userOf, type World } from "../test/fake-world";

afterEach(cleanup);

const LA_FONDA = id(10);
const CENTRO = id(11);
const NORTE = id(12);
const ANA = id(1);
const world = (extra: Partial<World> = {}): World => ({
  businesses: [business(10, "La Fonda")],
  branches: [branchOf(11, LA_FONDA, "Centro", "centro"), branchOf(12, LA_FONDA, "Norte", "norte")],
  users: [
    { ...userOf(1, "Ana", [{ businessId: LA_FONDA, branchId: null, role: "business_admin" }]), id: ANA },
    userOf(2, "Rosa", [{ businessId: LA_FONDA, branchId: CENTRO, role: "branch_admin" }], "invited"),
    userOf(3, "Beto", [{ businessId: LA_FONDA, branchId: null, role: "business_admin" }]),
  ],
  mailWorks: true,
  ...extra,
});
const TEAM = `/businesses/${LA_FONDA}/team`;
const row = async (name: string) =>
  (await screen.findByRole("heading", { level: 3, name: new RegExp(`^${name}`) })).closest("li") as HTMLElement;
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("the team", () => {
  it("lists each person with their role and status, and no actions on yourself", async () => {
    const { api } = fakeAdminApi({ signedIn: actor(), world: world() });
    renderAdmin(api, TEAM);

    expect(await screen.findByRole("heading", { level: 1, name: t("team.title", { name: "La Fonda" }) })).toBeTruthy();
    const rosa = await row("Rosa");
    expect(within(rosa).getByText(t("team.role.branches", { branches: "Centro" }))).toBeTruthy();
    expect(within(rosa).getByText(t("team.status.invited"))).toBeTruthy();
    expect(within(rosa).getByRole("button", { name: t("team.resend") })).toBeTruthy();
    const beto = await row("Beto");
    expect(within(beto).getByText(t("team.role.business"))).toBeTruthy();
    expect(within(beto).queryByRole("button", { name: t("team.resend") })).toBeNull();
    const ana = await row("Ana");
    expect(within(ana).getByRole("heading").textContent).toContain(t("team.you"));
    expect(within(ana).queryAllByRole("button")).toHaveLength(0);
  });

  it("invites an admin restaurante, saying the email went out", async () => {
    const { api } = fakeAdminApi({ signedIn: actor(), world: world() });
    renderAdmin(api, TEAM);
    fireEvent.click(await screen.findByRole("button", { name: t("team.invite") }));
    type(t("team.inviteName"), "Eva");
    type(t("team.inviteEmail"), "eva@lafonda.example");
    fireEvent.click(screen.getByRole("button", { name: t("team.inviteSubmit") }));

    expect(await screen.findByText(t("team.invited", { email: "eva@lafonda.example" }))).toBeTruthy();
    expect(api.inviteUser).toHaveBeenCalledWith(LA_FONDA, { name: "Eva", email: "eva@lafonda.example", role: { role: "business_admin" } });
    expect(within(await row("Eva")).getByText(t("team.status.invited"))).toBeTruthy();
  });

  it("invites a branch admin of two branches at once, and says when the email failed", async () => {
    const { api } = fakeAdminApi({ signedIn: actor(), world: world({ mailWorks: false }) });
    renderAdmin(api, TEAM);
    fireEvent.click(await screen.findByRole("button", { name: t("team.invite") }));
    type(t("team.inviteName"), "Eva");
    type(t("team.inviteEmail"), "eva@lafonda.example");
    fireEvent.click(screen.getByRole("radio", { name: t("team.roleBranches") }));
    fireEvent.click(screen.getByRole("button", { name: t("team.inviteSubmit") }));
    expect(screen.getByText(t("team.noBranch"))).toBeTruthy();
    expect(api.inviteUser).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("checkbox", { name: "Centro" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Norte" }));
    fireEvent.click(screen.getByRole("button", { name: t("team.inviteSubmit") }));

    expect(await screen.findByText(t("team.invitedNotSent", { email: "eva@lafonda.example" }))).toBeTruthy();
    expect(api.inviteUser).toHaveBeenCalledWith(LA_FONDA, expect.objectContaining({ role: { role: "branch_admin", branchId: CENTRO } }));
    expect(api.setRoles).toHaveBeenCalledWith(LA_FONDA, expect.any(String), [
      { role: "branch_admin", branchId: CENTRO },
      { role: "branch_admin", branchId: NORTE },
    ]);
    expect(within(await row("Eva")).getByText(t("team.role.branches", { branches: "Centro, Norte" }))).toBeTruthy();
  });

  it("changes a role, and takes access away only after confirming", async () => {
    const { api } = fakeAdminApi({ signedIn: actor(), world: world() });
    renderAdmin(api, TEAM);
    const rosa = await row("Rosa");
    fireEvent.click(within(rosa).getByRole("button", { name: t("team.changeRole") }));
    fireEvent.click(within(rosa).getByRole("radio", { name: t("team.roleBusiness") }));
    fireEvent.click(within(rosa).getByRole("button", { name: t("team.saveRole") }));
    expect(await screen.findByText(t("team.roleSaved", { name: "Rosa" }))).toBeTruthy();
    expect(api.setRoles).toHaveBeenCalledWith(LA_FONDA, id(2), [{ role: "business_admin" }]);
    expect(within(await row("Rosa")).getByText(t("team.role.business"))).toBeTruthy();

    const beto = await row("Beto");
    fireEvent.click(within(beto).getByRole("button", { name: t("team.remove") }));
    expect(api.removeRoles).not.toHaveBeenCalled();
    fireEvent.click(within(beto).getByRole("button", { name: t("team.confirmRemove", { name: "Beto" }) }));
    expect(await screen.findByText(t("team.removed", { name: "Beto" }))).toBeTruthy();
    expect(api.removeRoles).toHaveBeenCalledWith(LA_FONDA, id(3));
    await waitUntilGone("Beto");
  });

  it("resends a pending invitation, and says when the person no longer needs it", async () => {
    const { api } = fakeAdminApi({ signedIn: actor(), world: world() });
    renderAdmin(api, TEAM);
    fireEvent.click(within(await row("Rosa")).getByRole("button", { name: t("team.resend") }));
    expect(await screen.findByText(t("team.resent", { email: "rosa@lafonda.example" }))).toBeTruthy();

    api.resendInvitation.mockRejectedValueOnce(httpError(409, "USER_ALREADY_ACTIVE"));
    fireEvent.click(within(await row("Rosa")).getByRole("button", { name: t("team.resend") }));
    expect((await within(await row("Rosa")).findByRole("alert")).textContent).toBe(t("save.alreadyActive"));
  });

  it("is not a branch admin's to see", async () => {
    const branchAdmin = actor([{ businessId: LA_FONDA, branchId: CENTRO, role: "branch_admin" }]);
    const { api } = fakeAdminApi({ signedIn: branchAdmin, world: world() });
    renderAdmin(api, TEAM);
    expect(await screen.findByRole("heading", { name: t("status.forbidden.title") })).toBeTruthy();
  });
});

/** Waits until a member's row is gone from the list. */
const waitUntilGone = (name: string) =>
  waitFor(() => expect(screen.queryByRole("heading", { level: 3, name: new RegExp(`^${name}`) })).toBeNull());
