import { ApiError, type AdminApi } from "@miramenu/api-client";
import type { Business, Page, SessionActor } from "@miramenu/contracts";
import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { AdminApiContext } from "../app/api-context";
import { App } from "../app/App";
import { createQueryClient } from "../app/query-client";
import { worldApi, type World } from "./fake-world";

export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const actor = (
  roles: SessionActor["roles"] = [{ businessId: id(10), branchId: null, role: "business_admin" }],
  isSuperadmin = false,
): SessionActor => ({
  user: { id: id(1), email: "ana@lafonda.example", name: "Ana" },
  isSuperadmin,
  roles,
});

export const business = (n: number, name: string): Business => ({
  id: id(n),
  name,
  country: "MX",
  subdomain: name.toLowerCase().replace(/\s+/g, ""),
  createdAt: "2026-11-12T18:00:00.000Z",
});

export const httpError = (status: number, code: string, retryAfterSeconds?: number) =>
  new ApiError({
    kind: "http",
    status,
    code,
    message: code,
    requestId: "r",
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  });

/**
 * The admin's API in memory: who is signed in, and which businesses they see. Each call
 * is a spy, so a test can make one fail or count them.
 */
export function fakeAdminApi({
  signedIn = null,
  accounts = { "ana@lafonda.example": actor() },
  pages = [{ items: [business(10, "La Fonda")], nextCursor: null }],
  world = { businesses: [business(10, "La Fonda")], branches: [], users: [], mailWorks: true },
}: {
  signedIn?: SessionActor | null;
  accounts?: Record<string, SessionActor>;
  pages?: Page<Business>[];
  world?: World;
} = {}) {
  let current = signedIn;
  const api = {
    ...worldApi(world, () => current),
    session: vi.fn(async () => current),
    signIn: vi.fn(async ({ email }: { email: string; password: string }) => {
      const account = accounts[email];
      if (account === undefined) throw httpError(401, "INVALID_CREDENTIALS");
      current = account;
    }),
    signOut: vi.fn(async () => {
      current = null;
    }),
    acceptInvitation: vi.fn(async () => undefined),
    businesses: vi.fn(async (cursor?: string) => {
      const index = cursor === undefined ? 0 : Number(cursor.slice(1));
      const page = pages[index];
      if (page === undefined) throw new Error(`no page ${index}`);
      return page;
    }),
  };
  return { api, world, end: () => (current = null) };
}

/** The app at a path, with the real query client and its retry policy, without waiting. */
export function renderAdmin(api: Partial<AdminApi>, path = "/") {
  window.history.replaceState(null, "", path);
  const client = createQueryClient();
  client.setDefaultOptions({
    queries: { ...client.getDefaultOptions().queries, retryDelay: 0 },
  });
  render(
    <QueryClientProvider client={client}>
      <AdminApiContext value={api as AdminApi}>
        <App />
      </AdminApiContext>
    </QueryClientProvider>,
  );
  return client;
}

export const here = () => `${window.location.pathname}${window.location.search}`;
