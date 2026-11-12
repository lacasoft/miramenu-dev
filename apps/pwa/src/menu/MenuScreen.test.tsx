import { ApiError, type DinerApi } from "@miramenu/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { DinerApiContext } from "../app/api-context";
import { EntryOutboxContext } from "../app/entry-outbox-context";
import { t } from "../i18n";
import { testOutbox } from "../test/entry-outbox";
import {
  GRINGA,
  HORCHATA,
  id,
  MENU,
  PASTOR,
  SUADERO,
  TIMINGS,
} from "../test/menu-fixtures";
import { revealInViewport } from "../test/setup";
import { MenuScreen } from "./MenuScreen";


interface FakeLikes {
  liked?: string[];
  comments?: Record<string, number>;
  failLikes?: boolean;
}

/** Holds the API's answers to likes until the test lets them go. */
function gate() {
  let open = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open: () => open() };
}

/** The calls the menu makes for likes and counts, against an in-memory branch. */
function fakeApi({
  liked = [],
  comments = {},
  failLikes = false,
  answer = Promise.resolve(),
}: FakeLikes & { answer?: Promise<void> } = {}) {
  const likes = new Set(liked);
  const calls: { dishId: string; active: boolean }[] = [];
  const api: Partial<DinerApi> = {
    myLikes: async () => ({ dishIds: [...likes] }),
    interactions: async () => ({
      dishes: Object.entries(comments).map(([dishId, count]) => ({
        dishId,
        likes: 0,
        comments: count,
      })),
    }),
    like: async (_branchId, dishId, active) => {
      calls.push({ dishId, active });
      await answer;
      if (failLikes)
        throw new ApiError({ kind: "http", status: 503, code: "SERVICE_UNAVAILABLE", message: "down", requestId: "r" });
      if (active) likes.add(dishId);
      else likes.delete(dishId);
      return { active, likes: likes.size };
    },
  };
  return { api: api as DinerApi, calls };
}

function renderMenu(api: DinerApi = fakeApi().api) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DinerApiContext value={api}>
        <EntryOutboxContext value={testOutbox().outbox}>
          <MenuScreen menu={MENU} feedTimings={TIMINGS} />
        </EntryOutboxContext>
      </DinerApiContext>
    </QueryClientProvider>,
  );
}

const cell = (name: string) =>
  screen.getByRole("button", { name: t("menu.openDish", { name }) });
const query = () => new URLSearchParams(window.location.search);

beforeEach(() => {
  window.history.replaceState(null, "", "/centro");
});
afterEach(cleanup);

describe("the menu's grids", () => {
  it("opens on two columns, with each dish's name and the first one active", () => {
    renderMenu();

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
    renderMenu();
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
    renderMenu();
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
    renderMenu();

    expect(cell("Gringa").getAttribute("aria-current")).toBe("true");
    expect(screen.getByText(t("menu.dishUnavailable"))).toBeTruthy();
  });
});

describe("the feed", () => {
  it("opens on the touched dish as its own step, and back returns to the grid", async () => {
    renderMenu();
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
    const { container } = renderMenu();

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
    const { container } = renderMenu();

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
    renderMenu();
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
    renderMenu();
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
    renderMenu();

    fireEvent.click(screen.getByRole("button", { name: t("dish.close") }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.pathname).toBe("/centro");
    expect(query().get("dish")).toBe(PASTOR.id);
  });
});

describe("the profile", () => {
  it("shows the restaurant's networks, opening outside the menu", () => {
    renderMenu();
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
    return renderMenu();
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

describe("likes", () => {
  const heart = (name: string) =>
    screen.getAllByRole("button", { name: t("like.action", { name }) })[0] as HTMLElement;

  it("likes a dish before the API answers, and keeps it once it agrees", async () => {
    const answer = gate();
    const { api, calls } = fakeApi({ answer: answer.opened });
    renderMenu(api);

    fireEvent.click(heart("Pastor"));
    await waitFor(() => expect(heart("Pastor").getAttribute("aria-pressed")).toBe("true"));
    expect(calls).toEqual([{ dishId: PASTOR.id, active: true }]);
    answer.open();
    await waitFor(() => expect(screen.queryByText(t("like.failed"))).toBeNull());
    expect(heart("Pastor").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(heart("Pastor"));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toEqual({ dishId: PASTOR.id, active: false });
    expect(heart("Pastor").getAttribute("aria-pressed")).toBe("false");
  });

  it("undoes a like it could not save, and says so", async () => {
    const answer = gate();
    renderMenu(fakeApi({ failLikes: true, answer: answer.opened }).api);

    fireEvent.click(heart("Suadero"));
    await waitFor(() => expect(heart("Suadero").getAttribute("aria-pressed")).toBe("true"));
    answer.open();
    expect(await screen.findByText(t("like.failed"))).toBeTruthy();
    expect(heart("Suadero").getAttribute("aria-pressed")).toBe("false");
  });

  it("undoes a failed like even without network to ask the API again", async () => {
    const answer = gate();
    const { api } = fakeApi({ failLikes: true, answer: answer.opened });
    let online = true;
    const offlineLater: DinerApi = {
      ...api,
      myLikes: async (branchId) => {
        if (!online) throw new ApiError({ kind: "network" });
        return api.myLikes(branchId);
      },
    };
    renderMenu(offlineLater);
    await waitFor(() => expect(heart("Pastor").getAttribute("aria-pressed")).toBe("false"));

    online = false;
    fireEvent.click(heart("Pastor"));
    await waitFor(() => expect(heart("Pastor").getAttribute("aria-pressed")).toBe("true"));
    answer.open();
    expect(await screen.findByText(t("like.failed"))).toBeTruthy();
    expect(heart("Pastor").getAttribute("aria-pressed")).toBe("false");
  });

  it("still shows the earlier likes when a heart is touched before they load", async () => {
    const answer = gate();
    const { api } = fakeApi({ liked: [SUADERO.id] });
    let firstRead = true;
    const slowFirstRead: DinerApi = {
      ...api,
      myLikes: async (branchId) => {
        if (firstRead) {
          firstRead = false;
          await answer.opened;
        }
        return api.myLikes(branchId);
      },
    };
    renderMenu(slowFirstRead);

    fireEvent.click(heart("Pastor"));
    await waitFor(() => expect(heart("Suadero").getAttribute("aria-pressed")).toBe("true"));
    expect(heart("Pastor").getAttribute("aria-pressed")).toBe("true");
    answer.open();
  });

  it("shows the likes the diner gave before", async () => {
    renderMenu(fakeApi({ liked: [SUADERO.id] }).api);

    await waitFor(() => expect(heart("Suadero").getAttribute("aria-pressed")).toBe("true"));
    expect(heart("Pastor").getAttribute("aria-pressed")).toBe("false");
  });

  it("puts the heart in every cell, the contextual bar, the feed and the detail", () => {
    window.history.replaceState(null, "", `/centro?view=feed&dish=${PASTOR.id}&detail=1`);
    renderMenu();

    const detail = screen.getByRole("dialog", { name: "Pastor" });
    expect(within(detail).getByRole("button", { name: t("like.action", { name: "Pastor" }) })).toBeTruthy();
    const feed = screen.getByRole("region", { name: t("menu.dishes") });
    // One scene per dish, plus the copy of the first one after the last.
    expect(within(feed).getAllByRole("button", { name: /^Me gusta en /, hidden: true })).toHaveLength(5);
  });

  it("counts the approved comments in the feed and the detail, as the way into them", async () => {
    window.history.replaceState(null, "", `/centro?view=feed&dish=${SUADERO.id}&detail=1`);
    renderMenu(fakeApi({ comments: { [SUADERO.id]: 3, [PASTOR.id]: 1 } }).api);

    const detail = screen.getByRole("dialog", { name: "Suadero" });
    expect(
      await within(detail).findByRole("button", { name: "Ver comentarios de Suadero, 3 comentarios" }),
    ).toBeTruthy();
    expect(within(detail).getByText("3 comentarios")).toBeTruthy();
    const feed = screen.getByRole("region", { name: t("menu.dishes"), hidden: true });
    expect(
      within(feed).getAllByRole("button", { name: "Ver comentarios de Pastor, 1 comentario", hidden: true }).length,
    ).toBeGreaterThan(0);
    expect(
      within(feed).getAllByRole("button", { name: "Ver comentarios de Gringa, 0 comentarios", hidden: true }).length,
    ).toBeGreaterThan(0);
  });
});
