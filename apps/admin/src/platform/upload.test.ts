import { afterEach, describe, expect, it, vi } from "vitest";
import { UploadError, xhrPutFile } from "./upload";

/** An XMLHttpRequest that records what it was asked and answers when told. */
class FakeRequest {
  static last: FakeRequest | null = null;
  opened: [string, string] | null = null;
  headers: Record<string, string> = {};
  body: unknown = null;
  status = 0;
  upload: {
    onprogress:
      | ((event: {
          lengthComputable: boolean;
          loaded: number;
          total: number;
        }) => void)
      | null;
  } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeRequest.last = this;
  }
  open(method: string, url: string) {
    this.opened = [method, url];
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    this.body = body;
  }
}

const UPLOAD = {
  url: "https://s3.example.test/originals/x?X-Amz-Signature=abc",
  method: "PUT" as const,
  headers: { "Content-Type": "image/jpeg" },
  expiresAt: "2026-11-13T18:10:00.000Z",
};

afterEach(() => vi.unstubAllGlobals());

describe("the upload straight to storage (ADR-0038)", () => {
  it("PUTs the file to its signed URL with the signed headers, telling what went out", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeRequest);
    const file = new Blob(["x"], { type: "image/jpeg" });
    const progress: number[] = [];
    const done = xhrPutFile(UPLOAD, file, (sent) => progress.push(sent));
    const request = FakeRequest.last!;
    expect(request.opened).toEqual(["PUT", UPLOAD.url]);
    expect(request.headers).toEqual({ "Content-Type": "image/jpeg" });
    expect(request.body).toBe(file);

    request.upload.onprogress?.({
      lengthComputable: true,
      loaded: 25,
      total: 100,
    });
    request.upload.onprogress?.({
      lengthComputable: false,
      loaded: 0,
      total: 0,
    });
    request.status = 200;
    request.onload?.();
    await expect(done).resolves.toBeUndefined();
    expect(progress).toEqual([0.25]);
  });

  it("reports what storage answered, or that it did not answer", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeRequest);
    const refused = xhrPutFile(UPLOAD, new Blob(["x"]), () => undefined);
    FakeRequest.last!.status = 403;
    FakeRequest.last!.onload?.();
    await expect(refused).rejects.toEqual(
      new UploadError({ kind: "http", status: 403 }),
    );
    await refused.catch((error: UploadError) =>
      expect(error.failure).toEqual({ kind: "http", status: 403 }),
    );

    const lost = xhrPutFile(UPLOAD, new Blob(["x"]), () => undefined);
    FakeRequest.last!.onerror?.();
    await lost.catch((error: UploadError) =>
      expect(error.failure).toEqual({ kind: "network" }),
    );
  });
});
