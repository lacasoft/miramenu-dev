import type { Transport } from "@miramenu/api-client";

/**
 * The browser's side of the API client (ADR-0024): fetch, sending the diner's cookie to
 * the API's host, which is the same site as the PWA (ADR-0045).
 */
export const fetchTransport: Transport = async ({
  method,
  url,
  headers,
  body,
}) => {
  const response = await fetch(url, {
    method,
    headers,
    body,
    credentials: "include",
  });
  return { status: response.status, text: () => response.text() };
};
