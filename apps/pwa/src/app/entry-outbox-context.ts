import type { EntryOutbox } from "@miramenu/diner-core";
import { createContext, useContext } from "react";

/** Where the feed's closed entries go (IndexedDB and the API); tests give one in memory. */
export const EntryOutboxContext = createContext<EntryOutbox | null>(null);

export function useEntryOutbox(): EntryOutbox {
  const outbox = useContext(EntryOutboxContext);
  if (outbox === null) throw new Error("EntryOutboxContext is not provided");
  return outbox;
}
