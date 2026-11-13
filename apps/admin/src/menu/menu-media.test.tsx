import { MEDIA_POLL_MS } from "@miramenu/admin-core";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n";
import { UploadError } from "../platform/upload";
import {
  actor,
  business,
  fakeAdminApi,
  httpError,
  id,
  renderAdmin,
  settled,
} from "../test/fake-admin";
import { readyMedia, settleMedia } from "../test/fake-media";
import {
  categoryOf,
  dishOf,
  emptyMenu,
  type MenuState,
} from "../test/fake-menu";
import { branchOf, type World } from "../test/fake-world";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const LA_FONDA = id(10);
const MENU = `/businesses/${LA_FONDA}/menu`;
const MB = 1024 * 1024;
const TACOS = categoryOf(20, "Tacos", 0);
const PASTOR = dishOf(30, TACOS.id, "Pastor", 9500, 0);
const PROFILE = {
  name: "La Fonda",
  socialLinks: [
    { network: "instagram" as const, url: "https://instagram.com/lafonda" },
  ],
  logoId: null,
};
const menuWith = (extra: Partial<MenuState> = {}) =>
  emptyMenu({
    draftVersion: 3,
    profile: { ...PROFILE },
    categories: [{ ...TACOS }],
    dishes: [{ ...PASTOR }],
    ...extra,
  });
const world = (menu: MenuState): World => ({
  businesses: [business(10, "La Fonda")],
  branches: [branchOf(11, LA_FONDA, "Centro", "centro")],
  users: [],
  mailWorks: true,
  menus: { [LA_FONDA]: menu },
});
const of = (action: string, name = "Pastor") => t("media.of", { action, name });
const fileOf = (name: string, type: string, size = 10) => {
  const file = new File(["x".repeat(Math.min(size, 10))], name, { type });
  if (size > 10) Object.defineProperty(file, "size", { value: size });
  return file;
};
const choose = (label: string, file: File) =>
  fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } });

async function open(menu: MenuState, who = actor()) {
  const fake = fakeAdminApi({ signedIn: who, world: world(menu) });
  renderAdmin(fake.api, MENU, fake.putFile);
  await screen.findByRole("heading", { level: 4, name: "Pastor" });
  return fake;
}

describe("a dish's photo and video (ADR-0038)", () => {
  it("uploads straight to storage, confirms, attaches, and shows the photo once the worker made it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const menu = menuWith();
    const { api, putFile, world: state } = await open(menu);
    const photo = fileOf("pastor.jpg", "image/jpeg");
    choose(of(t("media.upload.photo")), photo);

    expect(await screen.findByText(t("media.processing.photo"))).toBeTruthy();
    const [medium] = menu.media;
    expect(api.createMedia).toHaveBeenCalledWith(LA_FONDA, {
      kind: "image",
      contentType: "image/jpeg",
      sizeBytes: 10,
    });
    expect(putFile).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining(medium!.id) }),
      photo,
      expect.any(Function),
    );
    expect(api.completeMedia).toHaveBeenCalledWith(LA_FONDA, medium!.id);
    expect(api.updateDish).toHaveBeenCalledWith(LA_FONDA, PASTOR.id, {
      imageId: medium!.id,
    });

    // The draft is read again while the photo processes, and stops once it is ready.
    settleMedia(state, medium!.id, "ready");
    await act(() => vi.advanceTimersByTimeAsync(MEDIA_POLL_MS));
    const image = await screen.findByAltText(of(t("media.photo")));
    expect(image.getAttribute("src")).toBe(
      `https://media.example.test/${medium!.id}/480.webp`,
    );
    const reads = api.menuDraft.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(MEDIA_POLL_MS * 3));
    expect(api.menuDraft.mock.calls.length).toBe(reads);
    expect(screen.getByLabelText(of(t("media.replace.photo")))).toBeTruthy();
  });

  it("refuses a file of another type or too heavy before sending anything", async () => {
    const { api } = await open(menuWith());
    choose(of(t("media.upload.photo")), fileOf("pastor.gif", "image/gif"));
    expect((await screen.findByRole("alert")).textContent).toBe(
      t("media.file.format.image"),
    );
    choose(
      of(t("media.upload.video")),
      fileOf("pastor.mp4", "video/mp4", 200 * MB + 1),
    );
    expect(
      await screen.findByText(t("media.file.tooLarge.video")),
    ).toBeTruthy();
    choose(of(t("media.upload.video")), fileOf("vacio.mp4", "video/mp4", 0));
    expect(await screen.findByText(t("media.file.empty"))).toBeTruthy();
    await settled();
    expect(api.createMedia).not.toHaveBeenCalled();
  });

  it("goes on from the step that failed: the same signed PUT, and the confirmation again", async () => {
    const menu = menuWith();
    const { api, putFile } = await open(menu);
    putFile.mockRejectedValueOnce(new UploadError({ kind: "network" }));
    api.completeMedia.mockRejectedValueOnce(
      httpError(503, "SERVICE_UNAVAILABLE"),
    );
    choose(of(t("media.upload.video")), fileOf("pastor.mp4", "video/mp4"));

    expect(
      await screen.findByText(t("media.problem.unavailable")),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t("media.retry") }));
    expect(
      await screen.findByText(t("media.problem.unavailable")),
    ).toBeTruthy();
    expect(api.completeMedia).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: t("media.retry") }));
    expect(await screen.findByText(t("media.processing.video"))).toBeTruthy();

    expect(api.createMedia).toHaveBeenCalledTimes(1);
    expect(putFile).toHaveBeenCalledTimes(2);
    expect(putFile.mock.calls[0]?.[0]).toEqual(putFile.mock.calls[1]?.[0]);
    expect(api.completeMedia).toHaveBeenCalledTimes(2);
    expect(api.updateDish).toHaveBeenCalledWith(LA_FONDA, PASTOR.id, {
      videoId: menu.media[0]?.id,
    });
  });

  it("starts over with a new medium when storage refused what arrived", async () => {
    const { api } = await open(menuWith());
    api.completeMedia.mockRejectedValueOnce(httpError(422, "MEDIA_REJECTED"));
    choose(of(t("media.upload.photo")), fileOf("pastor.png", "image/png"));
    expect(await screen.findByText(t("media.problem.rejected"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t("media.retry") }));
    expect(await screen.findByText(t("media.processing.photo"))).toBeTruthy();
    expect(api.createMedia).toHaveBeenCalledTimes(2);
  });

  it("says a photo stuck processing and a video that failed, and lists them as problems", async () => {
    const stuck = {
      ...readyMedia(40),
      status: "processing" as const,
      image: null,
      stalled: true,
    };
    const long = {
      ...readyMedia(41, "video"),
      status: "failed" as const,
      video: null,
      failureReason: "too_long" as const,
    };
    await open(
      menuWith({
        dishes: [{ ...PASTOR, imageId: stuck.id, videoId: long.id }],
        media: [stuck, long],
      }),
    );
    expect(screen.getByText(t("media.stalled"))).toBeTruthy();
    const card = within(
      (
        await screen.findByRole("heading", { name: t("mediaProblems.title") })
      ).closest("section")!,
    );
    expect(card.getByText(t("media.failed.too_long"))).toBeTruthy();
    expect(card.getByText(t("mediaProblems.stalled"))).toBeTruthy();
    expect(screen.getAllByText(t("media.failed.too_long"))).toHaveLength(2);
  });

  it("lists a medium the worker failed after its upload ended, once the draft says so", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const menu = menuWith();
    const { world: state } = await open(menu);
    choose(of(t("media.upload.photo")), fileOf("roto.jpg", "image/jpeg"));
    expect(await screen.findByText(t("media.processing.photo"))).toBeTruthy();
    expect(screen.queryByRole("heading", { name: t("mediaProblems.title") })).toBeNull();

    settleMedia(state, menu.media[0]!.id, "unsupported_format");
    await act(() => vi.advanceTimersByTimeAsync(MEDIA_POLL_MS));
    const card = within((await screen.findByRole("heading", { name: t("mediaProblems.title") })).closest("section")!);
    expect(card.getByText(t("media.failed.unsupported_format"))).toBeTruthy();
  });

  it("takes a photo away, leaving the dish without one", async () => {
    const photo = readyMedia(40);
    const { api } = await open(
      menuWith({ dishes: [{ ...PASTOR, imageId: photo.id }], media: [photo] }),
    );
    expect(screen.getByAltText(of(t("media.photo")))).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: t("mediaProblems.title") }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: of(t("media.remove.photo")) }),
    );
    expect(await screen.findByText(t("media.none.photo"))).toBeTruthy();
    expect(api.updateDish).toHaveBeenCalledWith(LA_FONDA, PASTOR.id, {
      imageId: null,
    });
  });

  it("lets a branch admin see the photos, with nothing to upload", async () => {
    const photo = readyMedia(40);
    const { api } = await open(
      menuWith({ dishes: [{ ...PASTOR, imageId: photo.id }], media: [photo] }),
      actor([{ businessId: LA_FONDA, branchId: id(11), role: "branch_admin" }]),
    );
    expect(screen.getByAltText(of(t("media.photo")))).toBeTruthy();
    expect(screen.queryByLabelText(of(t("media.replace.photo")))).toBeNull();
    expect(screen.queryByLabelText(of(t("media.upload.video")))).toBeNull();
    await settled();
    expect(api.mediaProblems).not.toHaveBeenCalled();
  });
});

describe("the restaurant's logo", () => {
  it("uploads it into the profile, keeping the rest of the profile", async () => {
    const menu = menuWith();
    const { api } = await open(menu);
    choose(
      of(t("media.upload.logo"), "La Fonda"),
      fileOf("logo.webp", "image/webp"),
    );
    expect(await screen.findByText(t("media.processing.logo"))).toBeTruthy();
    expect(api.putProfile).toHaveBeenCalledWith(LA_FONDA, {
      ...PROFILE,
      logoId: menu.media[0]?.id,
    });
  });

  it("waits for the profile before taking one", async () => {
    await open(menuWith({ profile: null }));
    expect(screen.getByText(t("media.logoNeedsProfile"))).toBeTruthy();
    expect(
      screen.queryByLabelText(of(t("media.upload.logo"), "La Fonda")),
    ).toBeNull();
  });
});
