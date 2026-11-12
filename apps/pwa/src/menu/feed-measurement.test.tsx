import { ApiError, type DinerApi } from "@miramenu/api-client";
import { feedEntrySchema, type FeedEntry } from "@miramenu/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
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

const T0 = Date.parse("2026-11-12T18:00:00Z");
const at = (ms: number) => new Date(T0 + ms).toISOString();

const api = {
  myLikes: async () => ({ dishIds: [] }),
  interactions: async () => ({ dishes: [] }),
} as Partial<DinerApi> as DinerApi;

const unavailable = () =>
  new ApiError({
    kind: "http",
    status: 503,
    code: "MEASUREMENT_QUEUE_FULL",
    message: "full",
    requestId: "r",
  });

/** An entry a previous visit left behind. */
const earlier: FeedEntry = {
  entryId: id(700),
  branchId: MENU.branchId,
  dishId: HORCHATA.id,
  enteredAt: "2026-11-11T20:00:00.000Z",
  exposureMs: 4000,
  validView: true,
  exit: "abandoned",
};

let visibility: DocumentVisibilityState = "visible";
Object.defineProperty(document, "visibilityState", {
  configurable: true,
  get: () => visibility,
});
const setVisibility = (state: DocumentVisibilityState) =>
  act(() => {
    visibility = state;
    document.dispatchEvent(new Event("visibilitychange"));
  });

const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));
/** Lets the outbox's promises (the store, the send) run to their end. */
const settle = () => act(() => vi.advanceTimersByTimeAsync(0));

function openFeedOn(dishId: string, outbox = testOutbox()) {
  window.history.replaceState(null, "", `/centro?view=feed&dish=${dishId}`);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <DinerApiContext value={api}>
        <EntryOutboxContext value={outbox.outbox}>
          <MenuScreen menu={MENU} feedTimings={TIMINGS} />
        </EntryOutboxContext>
      </DinerApiContext>
    </QueryClientProvider>,
  );
  const swipeTo = (to: string) => {
    const scene = view.container.querySelector(
      `article[data-dish-id="${to}"]:not([data-clone])`,
    );
    if (scene === null) throw new Error(`no scene for ${to}`);
    act(() => revealInViewport(scene));
  };
  /** Every entry the outbox got, sent or still pending, oldest first. */
  const recorded = async () => {
    await settle();
    const all = [...outbox.sent.flat(), ...(await outbox.store.pending(100))];
    const byId = new Map(all.map((entry) => [entry.entryId, entry]));
    return [...byId.values()].sort((a, b) => a.enteredAt.localeCompare(b.enteredAt));
  };
  return { ...outbox, swipeTo, recorded };
}

const shape = ({
  dishId,
  enteredAt,
  exposureMs,
  validView,
  exit,
}: FeedEntry) => ({
  dishId,
  enteredAt,
  exposureMs,
  validView,
  exit,
});

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "Date",
    ],
    now: T0,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  visibility = "visible";
});

describe("the feed's entries", () => {
  it("closes the scene the diner swipes away from as manual, with its time in view", async () => {
    const feed = openFeedOn(PASTOR.id);

    await wait(2_400);
    feed.swipeTo(SUADERO.id);
    await wait(600);
    feed.swipeTo(GRINGA.id);

    const entries = await feed.recorded();
    expect(entries.map(shape)).toEqual([
      {
        dishId: PASTOR.id,
        enteredAt: at(0),
        exposureMs: 2_400,
        validView: true,
        exit: "manual",
      },
      // Under a second: no valid view (the API calls it a quick skip).
      {
        dishId: SUADERO.id,
        enteredAt: at(2_400),
        exposureMs: 600,
        validView: false,
        exit: "manual",
      },
    ]);
    for (const entry of entries) {
      expect(entry.branchId).toBe(MENU.branchId);
      expect(feedEntrySchema.safeParse(entry).success).toBe(true);
    }
    expect(new Set(entries.map((entry) => entry.entryId)).size).toBe(2);
  });

  it("closes as automatic the scenes the feed moves on from by itself, past the last one too", async () => {
    const feed = openFeedOn(GRINGA.id);

    await wait(5_000);
    await wait(5_000);

    expect((await feed.recorded()).map(shape)).toEqual([
      {
        dishId: GRINGA.id,
        enteredAt: at(0),
        exposureMs: 5_000,
        validView: true,
        exit: "auto",
      },
      {
        dishId: HORCHATA.id,
        enteredAt: at(5_000),
        exposureMs: 5_000,
        validView: true,
        exit: "auto",
      },
    ]);
    // The copy of the first scene led back to it, now the active one.
    expect(new URLSearchParams(window.location.search).get("dish")).toBe(
      PASTOR.id,
    );
  });

  it("closes the entry as manual on leaving the feed, and opens none outside it", async () => {
    const feed = openFeedOn(PASTOR.id);

    await wait(1_500);
    fireEvent.click(
      screen.getByRole("button", { name: t("menu.density.grid2") }),
    );
    await wait(30_000);

    expect((await feed.recorded()).map(shape)).toEqual([
      {
        dishId: PASTOR.id,
        enteredAt: at(0),
        exposureMs: 1_500,
        validView: true,
        exit: "manual",
      },
    ]);
  });

  it("stops counting while the detail covers the feed", async () => {
    const feed = openFeedOn(PASTOR.id);

    await wait(800);
    const scenes = screen.getByRole("region", { name: t("menu.dishes") });
    fireEvent.click(
      within(scenes).getByRole("button", {
        name: t("dish.seeDetailOf", { name: "Pastor" }),
      }),
    );
    await wait(5_000);
    await setVisibility("hidden");

    expect((await feed.recorded()).map(shape)).toEqual([
      {
        dishId: PASTOR.id,
        enteredAt: at(0),
        exposureMs: 800,
        validView: false,
        exit: "abandoned",
      },
    ]);
  });

  it("abandons the entry when the page hides, beacons it at once with the rest, and keeps all", async () => {
    const outbox = testOutbox(async () => {
      throw unavailable();
    });
    await outbox.store.add(earlier);
    const feed = openFeedOn(PASTOR.id, outbox);
    await settle();

    await wait(3_000);
    // Not awaited: before the store answers, the entry it just closed is on its way.
    void setVisibility("hidden");
    expect(feed.beacons.map((batch) => batch.map(shape))).toEqual([
      [
        {
          dishId: PASTOR.id,
          enteredAt: at(0),
          exposureMs: 3_000,
          validView: true,
          exit: "abandoned",
        },
      ],
    ]);
    await settle();
    expect(feed.beacons[1]).toEqual([earlier]);

    // Nothing is sent nor counted while away.
    const sends = feed.sent.length;
    await wait(60_000);
    expect(feed.sent.length).toBe(sends);

    await setVisibility("visible");
    await settle();
    expect(feed.sent.length).toBe(sends + 1);
    await wait(1_500);
    feed.swipeTo(SUADERO.id);

    const entries = await feed.recorded();
    expect(entries.map(shape)).toEqual([
      shape(earlier),
      {
        dishId: PASTOR.id,
        enteredAt: at(0),
        exposureMs: 3_000,
        validView: true,
        exit: "abandoned",
      },
      // A new entry for the same scene, from the moment the page came back.
      {
        dishId: PASTOR.id,
        enteredAt: at(63_000),
        exposureMs: 1_500,
        validView: true,
        exit: "manual",
      },
    ]);
    expect(entries[1]?.entryId).not.toBe(entries[2]?.entryId);
  });
});

describe("sending the entries", () => {
  it("sends what earlier visits left as the menu opens, then the new ones every 10 s", async () => {
    const outbox = testOutbox();
    await outbox.store.add(earlier);
    const feed = openFeedOn(PASTOR.id, outbox);

    await settle();
    expect(feed.sent).toEqual([[earlier]]);
    expect(await feed.store.pending(100)).toEqual([]);

    await wait(2_000);
    feed.swipeTo(SUADERO.id);
    await settle();
    expect(feed.sent).toHaveLength(1);
    await wait(8_000);
    await settle();

    expect(feed.sent[1]?.map(shape)).toEqual([
      {
        dishId: PASTOR.id,
        enteredAt: at(0),
        exposureMs: 2_000,
        validView: true,
        exit: "manual",
      },
    ]);
    expect(await feed.store.pending(100)).toEqual([]);
  });

  it("keeps what the API could not take for the next round", async () => {
    let refuse = true;
    const outbox = testOutbox(async (entries) => {
      if (refuse) throw unavailable();
      return { accepted: entries.map((entry) => entry.entryId), rejected: [] };
    });
    await outbox.store.add(earlier);
    // A video: the feed does not move on by itself while the test waits.
    openFeedOn(SUADERO.id, outbox);

    await settle();
    expect(outbox.sent).toHaveLength(1);
    expect(await outbox.store.pending(100)).toEqual([earlier]);

    refuse = false;
    await wait(10_000);
    await settle();
    expect(outbox.sent).toHaveLength(2);
    expect(await outbox.store.pending(100)).toEqual([]);
  });
});
