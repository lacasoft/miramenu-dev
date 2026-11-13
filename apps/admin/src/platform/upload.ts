import type { CallFailure } from "@miramenu/admin-core";
import type { MediaUpload } from "@miramenu/contracts";

/** Storage refused the file, or never answered: what admin-core reads of a failed step. */
export class UploadError extends Error {
  readonly failure: CallFailure;

  constructor(failure: CallFailure) {
    super(failure.kind === "http" ? `storage answered ${failure.status}` : "storage did not answer");
    this.failure = failure;
  }
}

/** Sends a file to its signed PUT, telling how much went out (from 0 to 1). */
export type PutFile = (
  upload: MediaUpload,
  file: Blob,
  onProgress: (sent: number) => void,
) => Promise<void>;

/**
 * The browser's upload straight to storage (ADR-0038), never through the API. It goes
 * with the signed headers only: the browser sets Content-Length from the file, which is
 * the size that was signed. XMLHttpRequest, because fetch cannot tell the progress of
 * what it sends, and a video may take minutes.
 */
export const xhrPutFile: PutFile = (upload, file, onProgress) =>
  new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(upload.method, upload.url);
    for (const [name, value] of Object.entries(upload.headers))
      request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0)
        onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new UploadError({ kind: "http", status: request.status }));
    };
    request.onerror = () => reject(new UploadError({ kind: "network" }));
    request.onabort = () => reject(new UploadError({ kind: "network" }));
    request.send(file);
  });
