import { ApiError, type DinerApi } from "@miramenu/api-client";
import type { PublishedMenu, Resolution } from "@miramenu/contracts";
import { onlineManager, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n";
import { DinerApiContext } from "./api-context";
import { EntryOutboxContext } from "./entry-outbox-context";
import { App } from "./App";
import { createQueryClient } from "./query-client";
import { testOutbox } from "../test/entry-outbox";

const BRANCH = "6f1c2e0a-8b3d-4c5e-9f7a-1b2c3d4e5f60";
const ADDRESS = { subdomain: "lafonda", slug: "centro" };

const RESOLUTION: Resolution = {
  businessId: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  branchId: BRANCH,
  canonicalUrl: "https://lafonda.example.test/centro",
};

const dish = (name: string, priceCents: number, available = true) => ({
  id: crypto.randomUUID(),
  name,
  description: "",
  priceCents,
  currency: "MXN",
  available,
  image: null,
  video: null,
});

const MENU: PublishedMenu = {
  branchId: BRANCH,
  version: 1,
  publishedAt: "2026-11-12T18:00:00.000Z",
  profile: { name: "La Fonda", socialLinks: [], logo: null },
  categories: [
    {
      id: crypto.randomUUID(),
      name: "Tacos",
      dishes: [dish("Taco de pastor", 2500), dish("Gringa", 6000, false)],
    },
  ],
};

const failure = (status: number, code: string) =>
  new ApiError({ kind: "http", status, code, message: code, requestId: "r" });

function renderApp(
  api: Partial<DinerApi>,
  address: typeof ADDRESS | null = ADDRESS,
) {
  const client = createQueryClient();
  // The real retry policy, without waiting between attempts.
  client.setDefaultOptions({
    queries: { ...client.getDefaultOptions().queries, retryDelay: 0 },
  });
  render(
    <QueryClientProvider client={client}>
      <DinerApiContext value={api as DinerApi}>
        <EntryOutboxContext value={testOutbox().outbox}>
          <App address={address} feedTimings={{ stillMs: 5000, holdMs: 10_000 }} />
        </EntryOutboxContext>
      </DinerApiContext>
    </QueryClientProvider>,
  );
  return client;
}

afterEach(cleanup);

describe("the diner PWA", () => {
  it("shows a skeleton, then the restaurant's menu in its grid", async () => {
    renderApp({
      resolve: vi.fn(async () => RESOLUTION),
      menu: vi.fn(async () => MENU),
    });

    expect(
      screen.getByLabelText(t("menu.loading")).getAttribute("aria-busy"),
    ).toBe("true");
    expect(
      await screen.findByRole("heading", { level: 1, name: "La Fonda" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: t("menu.openDish", { name: "Gringa" }),
      }),
    ).toBeTruthy();
    // The first dish is active: its price is in the contextual bar.
    expect(screen.getByText("$25.00")).toBeTruthy();
    expect(document.title).toBe("La Fonda");
  });

  it("says so when the page names no restaurant, without calling the API", () => {
    const resolve = vi.fn();
    renderApp({ resolve }, null);

    expect(
      screen.getByRole("heading", { name: t("status.notFound.title") }),
    ).toBeTruthy();
    expect(resolve).not.toHaveBeenCalled();
  });

  it("says so when no branch answers to the address, and does not retry a 404", async () => {
    const resolve = vi.fn(async () => {
      throw failure(404, "NOT_FOUND");
    });
    renderApp({ resolve });

    expect(
      await screen.findByRole("heading", { name: t("status.notFound.title") }),
    ).toBeTruthy();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("tells apart a branch that has not published its menu yet", async () => {
    renderApp({
      resolve: vi.fn(async () => RESOLUTION),
      menu: vi.fn(async () => {
        throw failure(404, "NOT_FOUND");
      }),
    });

    expect(
      await screen.findByRole("heading", {
        name: t("status.notPublished.title"),
      }),
    ).toBeTruthy();
  });

  it("retries an outage on its own, then offers to try again, and recovers", async () => {
    let outage = true;
    const menu = vi.fn(async () => {
      if (outage) throw failure(503, "SERVICE_UNAVAILABLE");
      return MENU;
    });
    renderApp({ resolve: vi.fn(async () => RESOLUTION), menu });

    const retry = await screen.findByRole("button", {
      name: t("status.retry"),
    });
    expect(
      screen.getByRole("heading", { name: t("status.unavailable.title") }),
    ).toBeTruthy();
    // The first attempt and the two automatic retries.
    expect(menu).toHaveBeenCalledTimes(3);

    outage = false;
    fireEvent.click(retry);
    expect(
      await screen.findByRole("heading", { level: 1, name: "La Fonda" }),
    ).toBeTruthy();
  });

  it("keeps a loaded menu on screen when a later refresh fails", async () => {
    let online = true;
    const menu = vi.fn(async () => {
      if (!online) throw new ApiError({ kind: "network" });
      return MENU;
    });
    const client = renderApp({ resolve: vi.fn(async () => RESOLUTION), menu });
    expect(
      await screen.findByRole("heading", { level: 1, name: "La Fonda" }),
    ).toBeTruthy();

    online = false;
    await act(() => client.refetchQueries({ queryKey: ["menu"] }));
    // The refresh failed (with its retries) and the cached menu is kept.
    expect(client.getQueryState(["menu", BRANCH])?.status).toBe("error");
    expect(menu).toHaveBeenCalledTimes(4);
    // Let the failed refresh reach the screen before looking at it.
    await act(() => new Promise((settle) => setTimeout(settle, 0)));
    expect(
      screen.getByRole("heading", { level: 1, name: "La Fonda" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: t("status.unavailable.title") }),
    ).toBeNull();
  });

  it("asks for the menu even when the browser says it is offline", async () => {
    // The transport decides what offline means: the last copy of the menu, or a failure.
    onlineManager.setOnline(false);
    try {
      renderApp({
        resolve: vi.fn(async () => RESOLUTION),
        menu: vi.fn(async () => MENU),
      });
      expect(
        await screen.findByRole("heading", { level: 1, name: "La Fonda" }),
      ).toBeTruthy();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it("treats a lost network like an outage", async () => {
    renderApp({
      resolve: vi.fn(async () => {
        throw new ApiError({ kind: "network" });
      }),
    });

    expect(
      await screen.findByRole("heading", {
        name: t("status.unavailable.title"),
      }),
    ).toBeTruthy();
  });
});
