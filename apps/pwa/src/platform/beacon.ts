/**
 * Hands a request to the browser to deliver even as the page goes away (ADR-0011). A string
 * body goes as `text/plain`, which needs no preflight. False if the browser refused it (too
 * large, or no sendBeacon): what it carried stays pending for the next flush either way.
 */
export function sendBeacon({
  url,
  body,
}: {
  url: string;
  body: string;
}): boolean {
  if (typeof navigator.sendBeacon !== "function") return false;
  return navigator.sendBeacon(url, body);
}
