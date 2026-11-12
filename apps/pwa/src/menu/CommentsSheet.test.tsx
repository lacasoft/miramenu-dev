import { ApiError, type DinerApi } from "@miramenu/api-client";
import type {
  MenuDish,
  OwnComment,
  PublishedMenu,
  PublicComment,
} from "@miramenu/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DinerApiContext } from "../app/api-context";
import { t } from "../i18n";
import { MenuScreen } from "./MenuScreen";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const BRANCH = id(900);
const DISH: MenuDish = {
  id: id(1),
  name: "Pastor",
  description: "",
  priceCents: 2500,
  currency: "MXN",
  available: true,
  image: null,
  video: null,
};
const MENU: PublishedMenu = {
  branchId: BRANCH,
  version: 1,
  publishedAt: "2026-11-12T18:00:00.000Z",
  profile: { name: "La Fonda", socialLinks: [], logo: null },
  categories: [{ id: id(100), name: "Tacos", dishes: [DISH] }],
};
const NOTICE = {
  version: "2026-11",
  url: "https://example.com/aviso-de-privacidad",
};
const ANA = { diner: { id: id(500), name: "Ana" } };

const approved = (n: number): PublicComment => ({
  id: id(200 + n),
  text: `Comentario ${n}`,
  author: { name: `Persona ${n}` },
  approvedAt: new Date(Date.now() - n * 3600_000).toISOString(),
});

const own = (
  text: string,
  status: OwnComment["status"] = "pending",
): OwnComment => ({
  id: id(300),
  branchId: BRANCH,
  dishId: DISH.id,
  text,
  status,
  version: 1,
  submittedAt: new Date().toISOString(),
});

const http = (status: number, code: string, retryAfterSeconds?: number) =>
  new ApiError({
    kind: "http",
    status,
    code,
    message: code,
    requestId: "r",
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  });

/** A branch's comments and a diner's account, in memory, answering as the API does. */
function fakeApi(
  start: {
    session?: typeof ANA | null;
    approved?: PublicComment[][];
    mine?: OwnComment[];
  } = {},
) {
  let session = start.session ?? null;
  let mine = start.mine ?? [];
  const pages = start.approved ?? [[]];
  const api = {
    myLikes: vi.fn(async () => ({ dishIds: [] })),
    interactions: vi.fn(async () => ({ dishes: [] })),
    privacyNotice: vi.fn(async () => NOTICE),
    session: vi.fn(async () => session),
    signOut: vi.fn(async () => {
      session = null;
    }),
    comments: vi.fn(async (_branch: string, _dish: string, cursor?: string) => {
      const index = cursor === undefined ? 0 : Number(cursor);
      return {
        items: pages[index] ?? [],
        nextCursor: index + 1 < pages.length ? String(index + 1) : null,
      };
    }),
    requestCode: vi.fn(async () => ({
      delivery: "sent" as const,
      expiresAt: new Date().toISOString(),
      resendAfterSeconds: 60,
    })),
    verify: vi.fn(async () => {
      session = ANA;
      return ANA;
    }),
    postComment: vi.fn(async ({ text }: { text: string; clientId: string }) => {
      const comment = own(text);
      mine = [comment];
      return comment;
    }),
    myComments: vi.fn(async () => ({ items: mine, nextCursor: null })),
    editComment: vi.fn(async (_id: string, text: string) => {
      mine = [own(text, "pending")];
      return mine[0];
    }),
    deleteComment: vi.fn(async () => {
      mine = [];
    }),
  };
  return api;
}

function openSheet(api: ReturnType<typeof fakeApi>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DinerApiContext value={api as unknown as DinerApi}>
        <MenuScreen
          menu={MENU}
          feedTimings={{ stillMs: 5000, holdMs: 10_000 }}
        />
      </DinerApiContext>
    </QueryClientProvider>,
  );
  return screen.getByRole("dialog", {
    name: t("comments.of", { name: "Pastor" }),
  });
}

const typeIn = (field: HTMLElement, value: string) =>
  fireEvent.change(field, { target: { value } });

async function fillDetails(sheet: HTMLElement, { privacy = true } = {}) {
  typeIn(
    within(sheet).getByLabelText(new RegExp(t("registration.phone"))),
    "55 1234 5678",
  );
  typeIn(
    within(sheet).getByLabelText(new RegExp(t("registration.name"))),
    "Ana",
  );
  if (privacy)
    fireEvent.click(within(sheet).getByLabelText(t("registration.privacy")));
  await waitFor(() =>
    expect(
      (
        within(sheet).getByRole("button", {
          name: t("registration.sendCode"),
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
}

async function writeAndPublish(sheet: HTMLElement, text: string) {
  typeIn(within(sheet).getByLabelText(t("comments.write")), text);
  fireEvent.click(
    within(sheet).getByRole("button", { name: t("comments.publish") }),
  );
}

beforeEach(() => {
  window.history.replaceState(null, "", `/centro?dish=${DISH.id}&comments=1`);
});
afterEach(cleanup);

describe("the comments sheet", () => {
  it("lists the approved comments with their author, a page at a time", async () => {
    const sheet = openSheet(
      fakeApi({ approved: [[approved(1), approved(2)], [approved(3)]] }),
    );

    expect(await within(sheet).findByText("Comentario 1")).toBeTruthy();
    expect(within(sheet).getByText("Persona 2")).toBeTruthy();
    expect(within(sheet).getByText("hace 1 hora")).toBeTruthy();
    expect(within(sheet).queryByText("Comentario 3")).toBeNull();

    fireEvent.click(
      within(sheet).getByRole("button", { name: t("comments.loadMore") }),
    );
    expect(await within(sheet).findByText("Comentario 3")).toBeTruthy();
    expect(
      within(sheet).queryByRole("button", { name: t("comments.loadMore") }),
    ).toBeNull();
  });

  it("says when there are no comments yet", async () => {
    const sheet = openSheet(fakeApi());
    expect(await within(sheet).findByText(t("comments.empty"))).toBeTruthy();
  });

  it("closes with its button and back, leaving the menu where it was", async () => {
    const sheet = openSheet(fakeApi());
    fireEvent.click(
      within(sheet).getByRole("button", { name: t("comments.close") }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      new URLSearchParams(window.location.search).get("comments"),
    ).toBeNull();
  });
});

describe("commenting and registering in context", () => {
  it("asks an anonymous diner to register, then posts the comment they wrote", async () => {
    const api = fakeApi();
    const sheet = openSheet(api);
    await writeAndPublish(sheet, "¡El mejor pastor!");

    expect(
      await within(sheet).findByText(t("registration.intro")),
    ).toBeTruthy();
    await fillDetails(sheet);
    fireEvent.click(
      within(sheet).getByRole("button", { name: t("registration.sendCode") }),
    );
    expect(
      await within(sheet).findByText(
        t("registration.codeSent", { phone: "+525512345678" }),
      ),
    ).toBeTruthy();
    expect(api.requestCode).toHaveBeenCalledWith("+525512345678");

    typeIn(within(sheet).getByLabelText(t("registration.code")), "123456");
    fireEvent.click(
      within(sheet).getByRole("button", { name: t("registration.verify") }),
    );

    await waitFor(() => expect(api.postComment).toHaveBeenCalledTimes(1));
    expect(api.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: "+525512345678",
        code: "123456",
        name: "Ana",
        offersConsent: false,
        privacyNoticeVersion: NOTICE.version,
      }),
    );
    expect(api.postComment).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: BRANCH,
        dishId: DISH.id,
        text: "¡El mejor pastor!",
      }),
    );
    expect(
      await within(sheet).findByText(t("comments.status.pending")),
    ).toBeTruthy();
    expect(
      within(sheet).getByText(t("comments.signedInAs", { name: "Ana" })),
    ).toBeTruthy();
  });

  it("checks the details before asking for a code", async () => {
    const api = fakeApi();
    const sheet = openSheet(api);
    await writeAndPublish(sheet, "Rico");

    await within(sheet).findByText(t("registration.intro"));
    typeIn(
      within(sheet).getByLabelText(new RegExp(t("registration.phone"))),
      "55 1234",
    );
    await waitFor(() =>
      expect(
        (
          within(sheet).getByRole("button", {
            name: t("registration.sendCode"),
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(
      within(sheet).getByRole("button", { name: t("registration.sendCode") }),
    );
    expect(within(sheet).getByRole("alert").textContent).toBe(
      t("registration.phoneInvalid"),
    );

    await fillDetails(sheet, { privacy: false });
    fireEvent.click(
      within(sheet).getByRole("button", { name: t("registration.sendCode") }),
    );
    expect(within(sheet).getByRole("alert").textContent).toBe(
      t("registration.privacyRequired"),
    );
    expect(api.requestCode).not.toHaveBeenCalled();
  });

  it("says when to ask again after a 429, and when a code is wrong or expired", async () => {
    const api = fakeApi();
    api.requestCode.mockRejectedValueOnce(http(429, "TOO_MANY_REQUESTS", 42));
    api.verify
      .mockRejectedValueOnce(http(422, "CODE_INVALID"))
      .mockRejectedValueOnce(http(422, "CODE_EXPIRED"));
    const sheet = openSheet(api);
    await writeAndPublish(sheet, "Rico");
    await within(sheet).findByText(t("registration.intro"));
    await fillDetails(sheet);

    fireEvent.click(
      within(sheet).getByRole("button", { name: t("registration.sendCode") }),
    );
    expect(
      await within(sheet).findByText(t("registration.wait", { seconds: 42 })),
    ).toBeTruthy();

    fireEvent.click(
      within(sheet).getByRole("button", { name: t("registration.sendCode") }),
    );
    await within(sheet).findByLabelText(t("registration.code"));
    expect(
      within(sheet).getByRole("button", { name: /Pedir otro código en \d+ s/ }),
    ).toBeTruthy();

    typeIn(within(sheet).getByLabelText(t("registration.code")), "000000");
    fireEvent.click(
      within(sheet).getByRole("button", { name: t("registration.verify") }),
    );
    expect(
      await within(sheet).findByText(t("registration.codeInvalid")),
    ).toBeTruthy();

    fireEvent.click(
      within(sheet).getByRole("button", { name: t("registration.verify") }),
    );
    expect(
      await within(sheet).findByText(t("registration.codeExpired")),
    ).toBeTruthy();
    // An expired code may be replaced right away.
    expect(
      (
        within(sheet).getByRole("button", {
          name: t("registration.resend"),
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(api.postComment).not.toHaveBeenCalled();
  });

  it("asks to accept the privacy notice again when it changed", async () => {
    const api = fakeApi();
    api.verify.mockRejectedValueOnce(http(409, "PRIVACY_NOTICE_OUTDATED"));
    const sheet = openSheet(api);
    await writeAndPublish(sheet, "Rico");
    await within(sheet).findByText(t("registration.intro"));
    await fillDetails(sheet);
    fireEvent.click(
      within(sheet).getByRole("button", { name: t("registration.sendCode") }),
    );
    typeIn(
      await within(sheet).findByLabelText(t("registration.code")),
      "123456",
    );
    fireEvent.click(
      within(sheet).getByRole("button", { name: t("registration.verify") }),
    );

    expect(
      await within(sheet).findByText(t("registration.privacyOutdated")),
    ).toBeTruthy();
    expect(
      (
        within(sheet).getByLabelText(
          t("registration.privacy"),
        ) as HTMLInputElement
      ).checked,
    ).toBe(false);
    await waitFor(() => expect(api.privacyNotice).toHaveBeenCalledTimes(2));
  });

  it("links the privacy notice the API says is in force", async () => {
    const sheet = openSheet(fakeApi());
    await writeAndPublish(sheet, "Rico");
    const link = await within(sheet).findByRole("link", {
      name: t("registration.privacyLink"),
    });
    expect(link.getAttribute("href")).toBe(NOTICE.url);
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
});

describe("a registered diner's comments", () => {
  it("posts at once, and retries with the same client id so nothing doubles", async () => {
    const api = fakeApi({ session: ANA });
    api.postComment.mockRejectedValueOnce(new ApiError({ kind: "network" }));
    const sheet = openSheet(api);
    await within(sheet).findByText(t("comments.signedInAs", { name: "Ana" }));

    await writeAndPublish(sheet, "Muy rico");
    expect(
      await within(sheet).findByText(t("comments.publishFailed")),
    ).toBeTruthy();
    fireEvent.click(
      within(sheet).getByRole("button", { name: t("comments.publish") }),
    );
    expect(
      await within(sheet).findByText(t("comments.pendingNote"), {
        selector: "form p",
      }),
    ).toBeTruthy();

    const [first, second] = api.postComment.mock.calls.map(
      ([comment]) => comment.clientId,
    );
    expect(second).toBe(first);
  });

  it("says how long to wait after too many comments", async () => {
    const api = fakeApi({ session: ANA });
    api.postComment.mockRejectedValueOnce(http(429, "TOO_MANY_REQUESTS", 1500));
    const sheet = openSheet(api);
    await within(sheet).findByText(t("comments.signedInAs", { name: "Ana" }));
    await writeAndPublish(sheet, "Otro más");
    expect(
      await within(sheet).findByText(t("comments.tooMany", { minutes: 25 })),
    ).toBeTruthy();
  });

  it("shows their own comments with their state, and lets them edit or delete one", async () => {
    const api = fakeApi({ session: ANA, mine: [own("Rico", "rejected")] });
    const sheet = openSheet(api);

    expect(
      await within(sheet).findByText(t("comments.status.rejected")),
    ).toBeTruthy();
    fireEvent.click(
      within(sheet).getByRole("button", { name: t("comments.edit") }),
    );
    typeIn(
      within(sheet).getAllByRole("textbox", { name: t("comments.write") })[0] as HTMLElement,
      "Muy rico",
    );
    fireEvent.click(
      within(sheet).getByRole("button", { name: t("comments.save") }),
    );
    expect(
      await within(sheet).findByText(t("comments.status.pending")),
    ).toBeTruthy();
    expect(api.editComment).toHaveBeenCalledWith(id(300), "Muy rico");

    fireEvent.click(
      within(sheet).getByRole("button", { name: t("comments.delete") }),
    );
    fireEvent.click(
      within(sheet).getByRole("button", { name: t("comments.confirmDelete") }),
    );
    await waitFor(() =>
      expect(within(sheet).queryByText(t("comments.yours"))).toBeNull(),
    );
    expect(api.deleteComment).toHaveBeenCalledWith(id(300));
  });

  it("signs out, and commenting asks for registration again", async () => {
    const api = fakeApi({ session: ANA });
    const sheet = openSheet(api);
    fireEvent.click(
      await within(sheet).findByRole("button", { name: t("comments.signOut") }),
    );
    await waitFor(() =>
      expect(
        within(sheet).queryByText(t("comments.signedInAs", { name: "Ana" })),
      ).toBeNull(),
    );

    await writeAndPublish(sheet, "Rico");
    expect(
      await within(sheet).findByText(t("registration.intro")),
    ).toBeTruthy();
    expect(api.postComment).not.toHaveBeenCalled();
  });
});
