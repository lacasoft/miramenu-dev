import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { t } from "../i18n";
import { fakeAdminApi, here, httpError, renderAdmin } from "../test/fake-admin";

afterEach(cleanup);

const TOKEN = "Ab3_-".repeat(8) + "xyz";
const PASSWORD = "una frase larga";

const choose = (password: string, confirmation = password) => {
  fireEvent.change(screen.getByLabelText(t("invitation.password")), { target: { value: password } });
  fireEvent.change(screen.getByLabelText(t("invitation.confirmation")), { target: { value: confirmation } });
  fireEvent.click(screen.getByRole("button", { name: t("invitation.submit") }));
};

describe("accepting an invitation", () => {
  it("takes the token from the link, drops it from the address at once, and sends it in the body", async () => {
    const { api } = fakeAdminApi();
    renderAdmin(api, `/invitation#token=${TOKEN}`);

    expect(screen.getByRole("heading", { name: t("invitation.title") })).toBeTruthy();
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain(TOKEN);

    choose(PASSWORD);
    expect(await screen.findByText(t("signIn.invited"))).toBeTruthy();
    expect(api.acceptInvitation).toHaveBeenCalledWith(TOKEN, PASSWORD);
    expect(here()).toBe("/login?notice=invited");
  });

  it("checks the password as the API will before sending anything", async () => {
    const { api } = fakeAdminApi();
    renderAdmin(api, `/invitation#token=${TOKEN}`);

    choose("corta");
    expect(screen.getByText(t("invitation.tooShort"))).toBeTruthy();
    expect((screen.getByLabelText(t("invitation.password")) as HTMLInputElement).getAttribute("aria-invalid")).toBe("true");
    choose(PASSWORD, `${PASSWORD}!`);
    expect(screen.getByText(t("invitation.mismatch"))).toBeTruthy();
    expect(api.acceptInvitation).not.toHaveBeenCalled();
  });

  it("says so when the link carries no invitation", () => {
    const { api } = fakeAdminApi();
    renderAdmin(api, "/invitation#token=short");
    expect(screen.getByRole("alert").textContent).toBe(t("invitation.missing"));
    expect(screen.getByRole("link", { name: t("invitation.toSignIn") })).toBeTruthy();
    expect(screen.queryByLabelText(t("invitation.password"))).toBeNull();
  });

  it("tells a used invitation from an expired one, with nothing left to try", async () => {
    for (const [status, code, text] of [
      [404, "INVITATION_NOT_FOUND", t("invitation.used")],
      [410, "INVITATION_EXPIRED", t("invitation.expired")],
    ] as const) {
      const { api } = fakeAdminApi();
      api.acceptInvitation.mockRejectedValueOnce(httpError(status, code));
      renderAdmin(api, `/invitation#token=${TOKEN}`);
      choose(PASSWORD);
      expect((await screen.findByRole("alert")).textContent).toBe(text);
      expect(screen.queryByLabelText(t("invitation.password"))).toBeNull();
      cleanup();
    }
  });

  it("lets the admin try again after an outage", async () => {
    const { api } = fakeAdminApi();
    api.acceptInvitation.mockRejectedValueOnce(httpError(503, "SERVICE_UNAVAILABLE"));
    renderAdmin(api, `/invitation#token=${TOKEN}`);
    choose(PASSWORD);
    expect((await screen.findByRole("alert")).textContent).toBe(t("invitation.unavailable"));
    fireEvent.click(screen.getByRole("button", { name: t("invitation.submit") }));
    expect(await screen.findByText(t("signIn.invited"))).toBeTruthy();
    expect(api.acceptInvitation).toHaveBeenCalledTimes(2);
  });
});
