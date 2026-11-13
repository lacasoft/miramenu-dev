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
  httpError,
  id,
  renderAdmin,
} from "../test/fake-admin";
import { commentOf, type FakeComment } from "../test/fake-moderation";
import { branchOf, type World } from "../test/fake-world";

afterEach(cleanup);

const LA_FONDA = id(10);
const CENTRO = id(11);
const NORTE = id(12);
const QUEUE = `/businesses/${LA_FONDA}/comments`;
const world = (comments: FakeComment[]): World => ({
  businesses: [business(10, "La Fonda")],
  branches: [
    branchOf(11, LA_FONDA, "Centro", "centro"),
    branchOf(12, LA_FONDA, "Norte", "norte"),
  ],
  users: [],
  mailWorks: true,
  comments,
});
const owner = actor();
const press = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
const items = () => [...document.querySelectorAll("blockquote")].map((quote) => quote.textContent);
/** The comment whose text is this one, as its list item. */
const comment = (text: string) => within(screen.getByText(text).closest("li") as HTMLElement);
const overdueText = (count: number) =>
  count === 1
    ? t("moderation.overdue.one")
    : t("moderation.overdue.other", { count });

describe("moderating a business's comments (ADR-0040)", () => {
  it("is reached from the business with its overdue notice, oldest first, saying dish, author and branch", async () => {
    const comments = [
      commentOf(2, NORTE, "Muy picante", {
        overdue: true,
        author: { name: "Eva" },
      }),
      commentOf(1, CENTRO, "Riquísimo", { overdue: true }),
      commentOf(3, CENTRO, "Volveré", { dishName: null }),
    ];
    const { api } = fakeAdminApi({ signedIn: owner, world: world(comments) });
    renderAdmin(api, `/businesses/${LA_FONDA}`);
    expect(await screen.findByText(overdueText(2))).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: t("moderation.open") }));
    expect(here()).toBe(QUEUE);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: t("moderation.title", { name: "La Fonda" }),
      }),
    ).toBeTruthy();
    await screen.findByText("Riquísimo");
    expect(items()).toEqual(["Riquísimo", "Muy picante", "Volveré"]);
    const first = comment("Riquísimo");
    expect(
      first.getByRole("heading", {
        name: t("moderation.about", { dish: "Pastor" }),
      }),
    ).toBeTruthy();
    expect(first.getByText(t("moderation.late"))).toBeTruthy();
    expect(
      await first.findByText(
        new RegExp(t("moderation.atBranch", { branch: "Centro" })),
      ),
    ).toBeTruthy();
    const last = comment("Volveré");
    expect(
      last.getByRole("heading", { name: t("moderation.aboutGone") }),
    ).toBeTruthy();
    expect(last.queryByText(t("moderation.late"))).toBeNull();
  });

  it("approves and rejects the version read, and the comment leaves the queue", async () => {
    const comments = [
      commentOf(1, CENTRO, "Riquísimo", { version: 3 }),
      commentOf(2, NORTE, "Feo", { author: { name: "Eva" } }),
    ];
    const { api } = fakeAdminApi({ signedIn: owner, world: world(comments) });
    renderAdmin(api, QUEUE);
    await screen.findByText("Riquísimo");

    press(t("moderation.approveOf", { author: "Dana" }));
    expect(
      await screen.findByText(t("moderation.approved", { author: "Dana" })),
    ).toBeTruthy();
    expect(api.approveComment).toHaveBeenCalledWith(id(1), 3);
    await waitFor(() => expect(items()).toEqual(["Feo"]));

    press(t("moderation.rejectOf", { author: "Eva" }));
    expect(
      await screen.findByText(t("moderation.rejected", { author: "Eva" })),
    ).toBeTruthy();
    expect(api.rejectComment).toHaveBeenCalledWith(id(2), 1);
    expect(await screen.findByText(t("moderation.empty"))).toBeTruthy();
    expect(comments.map((each) => each.status)).toEqual([
      "approved",
      "rejected",
    ]);
  });

  it("shows a comment that changed as it is now, and decides on that version", async () => {
    const comment = commentOf(1, CENTRO, "Rico");
    const { api } = fakeAdminApi({ signedIn: owner, world: world([comment]) });
    renderAdmin(api, QUEUE);
    await screen.findByText("Rico");
    // Its author edits it while the moderator reads.
    Object.assign(comment, { text: "Rico, pero frío", version: 2 });

    press(t("moderation.approveOf", { author: "Dana" }));
    expect(
      await screen.findByText(t("moderation.problem.changed")),
    ).toBeTruthy();
    expect(await screen.findByText("Rico, pero frío")).toBeTruthy();
    press(t("moderation.approveOf", { author: "Dana" }));
    expect(
      await screen.findByText(t("moderation.approved", { author: "Dana" })),
    ).toBeTruthy();
    expect(api.approveComment.mock.calls).toEqual([
      [id(1), 1],
      [id(1), 2],
    ]);
  });

  it("says a comment its author deleted, and an outage, keeping the comment for another try", async () => {
    const comments = [
      commentOf(1, CENTRO, "Rico"),
      commentOf(2, CENTRO, "Bueno", { author: { name: "Eva" } }),
    ];
    const { api, world: state } = fakeAdminApi({
      signedIn: owner,
      world: world(comments),
    });
    renderAdmin(api, QUEUE);
    await screen.findByText("Rico");
    state.comments = [comments[1]!];
    press(
      t("moderation.approveOf", { author: "Dana" }),
    );
    expect(await screen.findByText(t("moderation.problem.gone"))).toBeTruthy();
    await waitFor(() => expect(items()).toEqual(["Bueno"]));

    api.rejectComment.mockRejectedValueOnce(
      httpError(503, "SERVICE_UNAVAILABLE"),
    );
    press(t("moderation.rejectOf", { author: "Eva" }));
    expect(
      await screen.findByText(t("moderation.problem.unavailable")),
    ).toBeTruthy();
    expect(items()).toEqual(["Bueno"]);
  });

  it("shows only the overdue ones when asked, and the queue a page at a time", async () => {
    const comments = [1, 2, 3, 4].map((n) =>
      commentOf(n, CENTRO, `Comentario ${n}`, { overdue: n % 2 === 0 }),
    );
    const { api } = fakeAdminApi({ signedIn: owner, world: world(comments) });
    renderAdmin(api, QUEUE);
    await screen.findByText("Comentario 1");
    expect(items()).toEqual(["Comentario 1", "Comentario 2", "Comentario 3"]);
    press(t("common.loadMore"));
    await waitFor(() => expect(items()).toHaveLength(4));

    press(t("moderation.onlyOverdue"));
    await waitFor(() =>
      expect(items()).toEqual(["Comentario 2", "Comentario 4"]),
    );
    expect(api.businessModeration).toHaveBeenLastCalledWith(LA_FONDA, {
      cursor: undefined,
      overdue: true,
    });
    expect(
      screen
        .getByRole("button", { name: t("moderation.onlyOverdue") })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    for (const comment of comments) comment.overdue = false;
    press(t("moderation.all"));
    press(t("moderation.onlyOverdue"));
    expect(await screen.findByText(t("moderation.emptyOverdue"))).toBeTruthy();
  });

  it("shows a comment's text as text, never as markup", async () => {
    const { api } = fakeAdminApi({
      signedIn: owner,
      world: world([commentOf(1, CENTRO, "<b>hola</b><img src=x>")]),
    });
    renderAdmin(api, QUEUE);
    expect(await screen.findByText("<b>hola</b><img src=x>")).toBeTruthy();
    expect(document.querySelector("blockquote b, blockquote img")).toBeNull();
  });
});

describe("who moderates what", () => {
  const centroAdmin = actor([
    { businessId: LA_FONDA, branchId: CENTRO, role: "branch_admin" },
  ]);

  it("lets a branch admin moderate its branch from its page, and not the business's queue", async () => {
    const comments = [
      commentOf(1, CENTRO, "Riquísimo", { overdue: true }),
      commentOf(2, NORTE, "De Norte"),
    ];
    const { api } = fakeAdminApi({
      signedIn: centroAdmin,
      world: world(comments),
    });
    renderAdmin(api, `/businesses/${LA_FONDA}`);
    await screen.findByRole("heading", { level: 1, name: "La Fonda" });
    expect(
      screen.queryByRole("link", { name: t("moderation.open") }),
    ).toBeNull();
    cleanup();

    renderAdmin(api, `/branches/${CENTRO}`);
    expect(await screen.findByText(overdueText(1))).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: t("moderation.open") }));
    expect(await screen.findByText("Riquísimo")).toBeTruthy();
    expect(screen.queryByText("De Norte")).toBeNull();
    press(t("moderation.approveOf", { author: "Dana" }));
    expect(
      await screen.findByText(t("moderation.approved", { author: "Dana" })),
    ).toBeTruthy();
    cleanup();

    renderAdmin(api, QUEUE);
    expect(
      await screen.findByText(t("moderation.problem.forbidden")),
    ).toBeTruthy();
    expect(screen.queryByText("De Norte")).toBeNull();
  });
});
