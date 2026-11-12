import type { AdminApi } from "@miramenu/api-client";
import { createContext, useContext } from "react";

/** The API client the screens use; tests give them a fake one. */
export const AdminApiContext = createContext<AdminApi | null>(null);

export function useAdminApi(): AdminApi {
  const api = useContext(AdminApiContext);
  if (api === null) throw new Error("AdminApiContext is not provided");
  return api;
}
