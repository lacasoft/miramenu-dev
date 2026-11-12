/**
 * How a request leaves the device. The web passes a wrapper around fetch and a native app
 * would pass its own, so this package needs neither the DOM nor Node (ADR-0024).
 */
export interface HttpRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  headers: Readonly<Record<string, string>>;
  body?: string;
  /**
   * The last good answer to this request may stand in for it when the network fails or
   * the server is down: the branch's resolution and its published menu, so the PWA opens
   * offline with what it showed last. How the copy is kept is the transport's business.
   */
  allowsLastCopy?: true;
}

export interface HttpResponse {
  status: number;
  /** A response header, or null; only the ones CORS exposes reach a cross-origin page. */
  header(name: string): string | null;
  text(): Promise<string>;
}

/** Rejects only when the request could not be sent or answered: no network, DNS, CORS. */
export type Transport = (request: HttpRequest) => Promise<HttpResponse>;
