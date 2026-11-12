import type { MenuDish, PublishedMenu } from "@miramenu/contracts";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n";
import { revealInViewport } from "../test/setup";
import { MenuScreen } from "./MenuScreen";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const image = (name: string) => ({
  width: 960,
  height: 960,
  sources: [{ width: 960, url: `https://cdn.example.test/${name}.webp` }],
});

const dish = (
  n: number,
  name: string,
  extra: Partial<MenuDish> = {},
): MenuDish => ({
  id: id(n),
  name,
  description: `Descripción de ${name}`,
  priceCents: 2500,
  currency: "MXN",
  available: true,
  image: image(name),
  video: null,
  ...extra,
});

const PASTOR = dish(1, "Pastor");
const SUADERO = dish(2, "Suadero", {
  image: null,
  video: {
    url: "https://cdn.example.test/suadero.mp4",
    width: 720,
    height: 1280,
    durationMs: 28_000,
    poster: image("suadero-poster"),
  },
});
const GRINGA = dish(3, "Gringa", { available: false, image: null });
const HORCHATA = dish(4, "Horchata", { priceCents: 3000 });

const MENU: PublishedMenu = {
  branchId: id(900),
  version: 1,
  publishedAt: "2026-11-12T18:00:00.000Z",
  profile: {
    name: "La Fonda",
    socialLinks: [
      { network: "instagram", url: "https://instagram.com/lafonda" },
    ],
    logo: null,
  },
  categories: [
    { id: id(100), name: "Tacos", dishes: [PASTOR, SUADERO, GRINGA] },
    { id: id(200), name: "Bebidas", dishes: [HORCHATA] },
  ],
};

const TIMINGS = { stillMs: 5000, holdMs: 10_000 };

const cell = (name: string) =>
  screen.getByRole("button", { name: t("menu.openDish", { name }) });
const query = () => new URLSearchParams(window.location.search);

beforeEach(() => {
  window.history.replaceState(null, "", "/centro");
});
afterEach(cleanup);

describe("the menu's grids", () => {
  it("opens on two columns, with each dish's name and the first one active", () => {
    render(<MenuScreen menu={MENU} feedTimings={TIMINGS} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "La Fonda" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: t("menu.density.grid2") })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(cell("Pastor").getAttribute("aria-current")).toBe("true");
    expect(within(cell("Horchata")).getByText("Horchata")).toBeTruthy();
    // The video's length on its cover, and a quiet placeholder for a dish without media.
    expect(within(cell("Suadero")).getByText("0:28")).toBeTruthy();
    expect(
      within(cell("Gringa")).getByText(t("media.unavailable")),
    ).toBeTruthy();
    // The contextual bar shows the active dish with its price and the detail.
    expect(screen.getByText("$25.00")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: t("dish.seeDetailOf", { name: "Pastor" }),
      }),
    ).toBeTruthy();
    expect(window.location.pathname).toBe("/centro");
  });

  it("drops the names in three columns, keeping the active dish and the path", () => {
    render(<MenuScreen menu={MENU} feedTimings={TIMINGS} />);
    fireEvent.click(
      screen.getByRole("button", { name: t("menu.density.grid3") }),
    );

    expect(query().get("view")).toBe("grid3");
    expect(window.location.pathname).toBe("/centro");
    expect(within(cell("Horchata")).queryByText("Horchata")).toBeNull();
    expect(within(cell("Suadero")).queryByText("0:28")).toBeNull();
    expect(cell("Pastor").getAttribute("aria-current")).toBe("true");
  });

  it("filters by category, and the filter travels in the URL", () => {
    render(<MenuScreen menu={MENU} feedTimings={TIMINGS} />);
    fireEvent.click(screen.getByRole("button", { name: "Bebidas" }));

    expect(query().get("category")).toBe(id(200));
    expect(cell("Horchata").getAttribute("aria-current")).toBe("true");
    expect(
      screen.queryByRole("button", {
        name: t("menu.openDish", { name: "Pastor" }),
      }),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: t("menu.allCategories") }),
    );
    expect(cell("Pastor")).toBeTruthy();
  });

  it("says when a dish is unavailable instead of its price", () => {
    window.history.replaceState(null, "", `/centro?dish=${GRINGA.id}`);
    render(<MenuScreen menu={MENU} feedTimings={TIMINGS} />);

    expect(cell("Gringa").getAttribute("aria-current")).toBe("true");
    expect(screen.getByText(t("menu.dishUnavailable"))).toBeTruthy();
  });
});

describe("the feed", () => {
  it("opens on the touched dish as its own step, and back returns to the grid", async () => {
    render(<MenuScreen menu={MENU} feedTimings={TIMINGS} />);
    fireEvent.click(cell("Suadero"));

    expect(query().get("view")).toBe("feed");
    expect(query().get("dish")).toBe(SUADERO.id);
    const feed = screen.getByRole("region", { name: t("menu.dishes") });
    expect(
      within(feed).getByRole("heading", { level: 2, name: "Suadero" }),
    ).toBeTruthy();

    window.history.back();
    await waitFor(() => expect(query().get("view")).toBeNull());
    expect(cell("Suadero").getAttribute("aria-current")).toBe("true");
  });

  it("follows the scene that comes into view", () => {
    window.history.replaceState(
      null,
      "",
      `/centro?view=feed&dish=${PASTOR.id}`,
    );
    const { container } = render(<MenuScreen menu={MENU} feedTimings={TIMINGS} />);

    const horchata = container.querySelector(`[data-dish-id="${HORCHATA.id}"]`);
    if (horchata === null) throw new Error("no Horchata scene");
    revealInViewport(horchata);

    expect(query().get("dish")).toBe(HORCHATA.id);
    expect(query().get("view")).toBe("feed");
  });

  it("plays only the active video, muted, with its controls", () => {
    window.history.replaceState(
      null,
      "",
      `/centro?view=feed&dish=${SUADERO.id}`,
    );
    const { container } = render(<MenuScreen menu={MENU} feedTimings={TIMINGS} />);

    const videos = container.querySelectorAll("video");
    expect(videos).toHaveLength(1);
    expect(videos[0]?.muted).toBe(true);
    expect(videos[0]?.getAttribute("src")).toBe(SUADERO.video?.url);

    fireEvent.click(screen.getByRole("button", { name: t("video.pause") }));
    expect(screen.getByRole("button", { name: t("video.play") })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t("video.soundOn") }));
    expect(videos[0]?.muted).toBe(false);
  });

  it("pauses the video while the detail sits on top", () => {
    window.history.replaceState(
      null,
      "",
      `/centro?view=feed&dish=${SUADERO.id}`,
    );
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");
    render(<MenuScreen menu={MENU} feedTimings={TIMINGS} />);
    expect(pause).not.toHaveBeenCalled();

    const feed = screen.getByRole("region", { name: t("menu.dishes") });
    fireEvent.click(
      within(feed).getByRole("button", {
        name: t("dish.seeDetailOf", { name: "Suadero" }),
      }),
    );
    expect(pause).toHaveBeenCalled();
    pause.mockRestore();
  });
});

describe("the detail", () => {
  it("opens over the dish with its category, and Escape returns the focus to its opener", async () => {
    render(<MenuScreen menu={MENU} feedTimings={TIMINGS} />);
    const opener = screen.getByRole("button", {
      name: t("dish.seeDetailOf", { name: "Pastor" }),
    });
    opener.focus();
    fireEvent.click(opener);

    expect(query().get("detail")).toBe("1");
    const detail = screen.getByRole("dialog", { name: "Pastor" });
    expect(within(detail).getByText("Tacos")).toBeTruthy();
    expect(within(detail).getByText("Descripción de Pastor")).toBeTruthy();
    expect(within(detail).getByText("$25.00")).toBeTruthy();

    fireEvent(detail, new Event("cancel", { cancelable: true }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(query().get("detail")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", {
        name: t("dish.seeDetailOf", { name: "Pastor" }),
      }),
    );
  });

  it("closes in place when a shared link opened it, without leaving the site", () => {
    window.history.replaceState(null, "", `/centro?dish=${PASTOR.id}&detail=1`);
    render(<MenuScreen menu={MENU} feedTimings={TIMINGS} />);

    fireEvent.click(screen.getByRole("button", { name: t("dish.close") }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.pathname).toBe("/centro");
    expect(query().get("dish")).toBe(PASTOR.id);
  });
});

describe("the profile", () => {
  it("shows the restaurant's networks, opening outside the menu", () => {
    render(<MenuScreen menu={MENU} feedTimings={TIMINGS} />);
    fireEvent.click(screen.getByRole("button", { name: "La Fonda" }));

    const profile = screen.getByRole("dialog", { name: "La Fonda" });
    const instagram = within(profile).getByRole("link", {
      name: t("social.instagram"),
    });
    expect(instagram.getAttribute("href")).toBe(
      "https://instagram.com/lafonda",
    );
    expect(instagram.getAttribute("rel")).toBe("noopener noreferrer");

    fireEvent.click(
      within(profile).getByRole("button", { name: t("profile.close") }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("the feed moving on by itself", () => {
  const openFeedOn = (dishId: string) => {
    window.history.replaceState(null, "", `/centro?view=feed&dish=${dishId}`);
    return render(<MenuScreen menu={MENU} feedTimings={TIMINGS} />);
  };
  const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));
  const activeDish = () => query().get("dish");
  const sceneOf = (container: HTMLElement, dishId: string) => {
    const scene = container.querySelector(`article[data-dish-id="${dishId}"]:not([data-clone])`);
    if (scene === null) throw new Error(`no scene for ${dishId}`);
    return scene;
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("moves on from a still after its time, and starts over after the last scene", () => {
    openFeedOn(GRINGA.id);

    wait(4_999);
    expect(activeDish()).toBe(GRINGA.id);
    wait(1);
    expect(activeDish()).toBe(HORCHATA.id);

    // The last scene leads to the copy of the first, which jumps back to the start.
    wait(5_000);
    expect(activeDish()).toBe(PASTOR.id);
    expect(query().get("view")).toBe("feed");
  });

  it("moves on from a video when it ends, not on a timer", () => {
    const { container } = openFeedOn(SUADERO.id);

    wait(60_000);
    expect(activeDish()).toBe(SUADERO.id);
    const video = container.querySelector("video");
    if (video === null) throw new Error("no video");
    fireEvent.ended(video);
    expect(activeDish()).toBe(GRINGA.id);
  });

  it("holds for the pause time after a touch, then runs again", () => {
    const { container } = openFeedOn(GRINGA.id);

    wait(3_000);
    fireEvent.pointerDown(sceneOf(container, GRINGA.id));
    wait(9_999);
    expect(activeDish()).toBe(GRINGA.id);
    // The hold ends and the still starts its time over.
    wait(1);
    wait(4_999);
    expect(activeDish()).toBe(GRINGA.id);
    wait(1);
    expect(activeDish()).toBe(HORCHATA.id);
  });

  it("ignores a touch on the scene's own buttons", () => {
    openFeedOn(GRINGA.id);
    fireEvent.pointerDown(screen.getByRole("button", { name: t("video.pause") }));
    wait(5_000);
    expect(activeDish()).toBe(HORCHATA.id);
  });

  it("stops while the diner's pause is on, until they press play", () => {
    openFeedOn(GRINGA.id);

    fireEvent.click(screen.getByRole("button", { name: t("video.pause") }));
    wait(60_000);
    expect(activeDish()).toBe(GRINGA.id);
    fireEvent.click(screen.getByRole("button", { name: t("video.play") }));
    wait(5_000);
    expect(activeDish()).toBe(HORCHATA.id);
  });

  it("waits while the detail is open, and starts the still over when it closes", async () => {
    openFeedOn(GRINGA.id);
    const feed = screen.getByRole("region", { name: t("menu.dishes") });
    fireEvent.click(within(feed).getByRole("button", { name: t("dish.seeDetailOf", { name: "Gringa" }) }));

    wait(60_000);
    expect(activeDish()).toBe(GRINGA.id);
    expect(query().get("detail")).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: t("dish.close") }));
    await act(async () => {
      await vi.waitFor(() => expect(query().get("detail")).toBeNull());
    });
    wait(4_999);
    expect(activeDish()).toBe(GRINGA.id);
    wait(1);
    expect(activeDish()).toBe(HORCHATA.id);
  });
});
