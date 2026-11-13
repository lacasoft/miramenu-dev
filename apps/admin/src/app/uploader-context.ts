import { createContext, useContext } from "react";
import type { PutFile } from "../platform/upload";

/** How files reach storage; tests give the screens a fake one. */
export const UploaderContext = createContext<PutFile | null>(null);

export function usePutFile(): PutFile {
  const putFile = useContext(UploaderContext);
  if (putFile === null) throw new Error("UploaderContext is not provided");
  return putFile;
}
