/**
 * How a request leaves the device. The web passes a wrapper around fetch and a native app
 * would pass its own, so this package needs neither the DOM nor Node (ADR-0024).
 */
export interface HttpRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  headers: Readonly<Record<string, string>>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  text(): Promise<string>;
}

/** Rejects only when the request could not be sent or answered: no network, DNS, CORS. */
export type Transport = (request: HttpRequest) => Promise<HttpResponse>;
