import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { t } from "../i18n";
import { actor, business, fakeAdminApi, here, httpError, id, renderAdmin } from "../test/fake-admin";

afterEach(cleanup);

const signInWith = (email: string, password = "una frase larga") => {
  fireEvent.change(screen.getByLabelText(t("signIn.email")), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(t("signIn.password")), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: t("signIn.submit") }));
};
const greeting = () => screen.findByText(t("shell.greeting", { name: "Ana" }));

describe("signing in", () => {
  it("sends someone without a session to sign in, then to the home with their businesses", async () => {
    const { api } = fakeAdminApi();
    renderAdmin(api, "/");

    expect(await screen.findByRole("heading", { name: t("signIn.title") })).toBeTruthy();
    expect(here()).toBe("/login");
    signInWith("  ana@lafonda.example ");

    expect(await greeting()).toBeTruthy();
    expect(api.signIn).toHaveBeenCalledWith({ email: "ana@lafonda.example", password: "una frase larga" });
    expect(here()).toBe("/");
    expect(await screen.findByRole("heading", { name: "La Fonda" })).toBeTruthy();
    expect(screen.getByText(t("home.administers"))).toBeTruthy();
  });

  it("goes back to where the admin was going, and never to another site", async () => {
    const { api } = fakeAdminApi();
    renderAdmin(api, "/somewhere?tab=2");
    await screen.findByRole("heading", { name: t("signIn.title") });
    expect(here()).toBe("/login?next=%2Fsomewhere%3Ftab%3D2");
    signInWith("ana@lafonda.example");
    expect(await screen.findByRole("heading", { name: t("notFound.title") })).toBeTruthy();
    expect(here()).toBe("/somewhere?tab=2");

    cleanup();
    const other = fakeAdminApi();
    renderAdmin(other.api, "/login?next=https%3A%2F%2Fevil.example%2F");
    await screen.findByRole("heading", { name: t("signIn.title") });
    signInWith("ana@lafonda.example");
    expect(await greeting()).toBeTruthy();
    expect(here()).toBe("/");
  });

  it("goes straight on from signing in when there is a session already", async () => {
    const { api } = fakeAdminApi({ signedIn: actor() });
    renderAdmin(api, "/login?next=%2Fsomewhere");
    expect(await screen.findByRole("heading", { name: t("notFound.title") })).toBeTruthy();
    expect(here()).toBe("/somewhere");
  });

  it("says a wrong email or password without telling which", async () => {
    const { api } = fakeAdminApi();
    renderAdmin(api, "/login");
    signInWith("nadie@lafonda.example");
    expect((await screen.findByRole("alert")).textContent).toBe(t("signIn.invalidCredentials"));
  });

  it("waits what the API says after too many tries, then lets the admin try again", async () => {
    const { api } = fakeAdminApi();
    api.signIn.mockRejectedValueOnce(httpError(429, "TOO_MANY_REQUESTS", 1));
    renderAdmin(api, "/login");
    signInWith("ana@lafonda.example");

    expect((await screen.findByRole("alert")).textContent).toBe(t("signIn.wait", { seconds: 1 }));
    const submit = screen.getByRole("button", { name: t("signIn.submit") }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull(), { timeout: 2500 });
    expect(submit.disabled).toBe(false);
  });

  it("calls a closed login or a lost network unavailable", async () => {
    const { api } = fakeAdminApi();
    api.signIn.mockRejectedValueOnce(httpError(503, "LOGIN_UNAVAILABLE"));
    renderAdmin(api, "/login");
    signInWith("ana@lafonda.example");
    expect((await screen.findByRole("alert")).textContent).toBe(t("signIn.unavailable"));
  });
});

describe("the session", () => {
  it("sends the admin back to sign in when it ends in use, saying so", async () => {
    const { api } = fakeAdminApi({ signedIn: actor() });
    api.businesses.mockRejectedValueOnce(httpError(401, "UNAUTHORIZED"));
    renderAdmin(api, "/");

    expect(await screen.findByText(t("signIn.ended"))).toBeTruthy();
    expect(here()).toBe("/login?notice=ended");
  });

  it("offers to try again when it cannot be read, and recovers", async () => {
    const { api } = fakeAdminApi({ signedIn: actor() });
    const down = httpError(503, "SERVICE_UNAVAILABLE");
    api.session.mockRejectedValueOnce(down).mockRejectedValueOnce(down).mockRejectedValueOnce(down);
    renderAdmin(api, "/");

    fireEvent.click(await screen.findByRole("button", { name: t("status.retry") }));
    expect(await greeting()).toBeTruthy();
    expect(api.session).toHaveBeenCalledTimes(4);
  });

  it("signs out, forgetting what it loaded for the next person", async () => {
    const { api } = fakeAdminApi({
      signedIn: actor(),
      accounts: { "beto@lafonda.example": { ...actor(), user: { id: id(2), email: "beto@lafonda.example", name: "Beto" } } },
    });
    renderAdmin(api, "/");
    await screen.findByRole("heading", { name: "La Fonda" });

    fireEvent.click(screen.getByRole("button", { name: t("shell.signOut") }));
    expect(await screen.findByRole("heading", { name: t("signIn.title") })).toBeTruthy();
    expect(api.signOut).toHaveBeenCalledOnce();
    expect(here()).toBe("/login");

    // Beto's businesses take a moment: Ana's must not stand in for them meanwhile.
    let release = () => {};
    api.businesses.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ items: [business(20, "Tacos Beto")], nextCursor: null });
        }),
    );
    signInWith("beto@lafonda.example");
    expect(await screen.findByText(t("shell.greeting", { name: "Beto" }))).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "La Fonda" })).toBeNull();
    release();
    expect(await screen.findByRole("heading", { name: "Tacos Beto" })).toBeTruthy();
  });

  it("tells someone without roles they have no access yet, and lets them sign out", async () => {
    const { api } = fakeAdminApi({ signedIn: actor([]) });
    renderAdmin(api, "/");
    expect(await screen.findByRole("heading", { name: t("noAccess.title") })).toBeTruthy();
    expect(api.businesses).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: t("shell.signOut") }));
    expect(await screen.findByRole("heading", { name: t("signIn.title") })).toBeTruthy();
  });
});

describe("the home", () => {
  it("says what each person holds in each business", async () => {
    const { api } = fakeAdminApi({
      signedIn: actor([
        { businessId: id(10), branchId: null, role: "business_admin" },
        { businessId: id(20), branchId: id(21), role: "branch_admin" },
        { businessId: id(20), branchId: id(22), role: "branch_admin" },
        { businessId: id(30), branchId: id(31), role: "branch_admin" },
      ]),
      pages: [{ items: [business(10, "La Fonda"), business(20, "Tacos Beto"), business(30, "Café Sur")], nextCursor: null }],
    });
    renderAdmin(api, "/");

    const card = async (name: string) =>
      (await screen.findByRole("heading", { name })).closest("li") as HTMLElement;
    expect(within(await card("La Fonda")).getByText(t("home.administers"))).toBeTruthy();
    expect(within(await card("Tacos Beto")).getByText(t("home.branches.other", { count: 2 }))).toBeTruthy();
    expect(within(await card("Café Sur")).getByText(t("home.branches.one"))).toBeTruthy();
    expect(screen.getByRole("link", { name: t("shell.home") }).getAttribute("aria-current")).toBe("page");
  });

  it("shows the superadmin every business, a page at a time", async () => {
    const { api } = fakeAdminApi({
      signedIn: actor([], true),
      pages: [
        { items: [business(10, "La Fonda")], nextCursor: "p1" },
        { items: [business(20, "Tacos Beto")], nextCursor: null },
      ],
    });
    renderAdmin(api, "/");

    expect(await screen.findByText(t("role.superadmin"))).toBeTruthy();
    expect(screen.getByText(t("home.superadmin"))).toBeTruthy();
    await screen.findByRole("heading", { name: "La Fonda" });
    fireEvent.click(screen.getByRole("button", { name: t("home.loadMore") }));
    expect(await screen.findByRole("heading", { name: "Tacos Beto" })).toBeTruthy();
    expect(api.businesses).toHaveBeenLastCalledWith("p1");
    expect(screen.queryByRole("button", { name: t("home.loadMore") })).toBeNull();
  });

  it("says so when the businesses cannot load, and loads them on asking again", async () => {
    const { api } = fakeAdminApi({ signedIn: actor() });
    const down = httpError(503, "SERVICE_UNAVAILABLE");
    api.businesses.mockRejectedValueOnce(down).mockRejectedValueOnce(down).mockRejectedValueOnce(down);
    renderAdmin(api, "/");

    expect((await screen.findByRole("alert")).textContent).toBe(t("home.failed"));
    fireEvent.click(screen.getByRole("button", { name: t("status.retry") }));
    expect(await screen.findByRole("heading", { name: "La Fonda" })).toBeTruthy();
  });

  it("says when there are no businesses yet", async () => {
    const { api } = fakeAdminApi({ signedIn: actor([], true), pages: [{ items: [], nextCursor: null }] });
    renderAdmin(api, "/");
    expect(await screen.findByText(t("home.empty"))).toBeTruthy();
  });
});
