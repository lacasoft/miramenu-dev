import type { DinerApi } from "@miramenu/api-client";
import { createContext, useContext } from "react";

/** The API client the screens use; tests give them a fake one. */
export const DinerApiContext = createContext<DinerApi | null>(null);

export function useDinerApi(): DinerApi {
  const api = useContext(DinerApiContext);
  if (api === null) throw new Error("DinerApiContext is not provided");
  return api;
}
