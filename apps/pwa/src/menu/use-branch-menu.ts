import { isNotFound } from "@miramenu/api-client";
import type { PublishedMenu } from "@miramenu/contracts";
import type { SiteAddress } from "@miramenu/diner-core";
import { skipToken, useQuery } from "@tanstack/react-query";
import { useDinerApi } from "../app/api-context";

export type BranchMenuState =
  | { status: "loading" }
  /** No branch answers to this subdomain and slug. */
  | { status: "not-found" }
  /** The branch exists but has never published a menu (the API's 404 before the first). */
  | { status: "not-published" }
  | { status: "unavailable"; retry: () => void }
  | { status: "ready"; menu: PublishedMenu };

/**
 * The branch behind the page's address and its published menu. A menu already loaded stays
 * on screen even if a later refresh fails, as the design asks for a diner without network.
 */
export function useBranchMenu(address: SiteAddress): BranchMenuState {
  const api = useDinerApi();
  const branch = useQuery({
    queryKey: ["resolution", address.subdomain, address.slug ?? null],
    queryFn: () => api.resolve(address),
  });
  const branchId = branch.data?.branchId;
  const menu = useQuery({
    queryKey: ["menu", branchId ?? null],
    queryFn: branchId === undefined ? skipToken : () => api.menu(branchId),
  });

  if (menu.data !== undefined) return { status: "ready", menu: menu.data };
  if (branch.isError) {
    return isNotFound(branch.error)
      ? { status: "not-found" }
      : { status: "unavailable", retry: () => void branch.refetch() };
  }
  if (menu.isError) {
    return isNotFound(menu.error)
      ? { status: "not-published" }
      : { status: "unavailable", retry: () => void menu.refetch() };
  }
  return { status: "loading" };
}
