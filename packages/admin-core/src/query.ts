/**
 * The values of a URL query or fragment (`?a=1&b=2` or `#token=…`), read by hand: this
 * package has no DOM, so no URLSearchParams. The first value of a repeated name wins.
 */
export function paramsOf(part: string): ReadonlyMap<string, string> {
  const params = new Map<string, string>();
  for (const pair of part.replace(/^[?#]/, "").split("&")) {
    if (pair === "") continue;
    const at = pair.indexOf("=");
    const [name, value] = at < 0 ? [pair, ""] : [pair.slice(0, at), pair.slice(at + 1)];
    try {
      const key = decodeURIComponent(name.replace(/\+/g, " "));
      if (!params.has(key)) params.set(key, decodeURIComponent(value.replace(/\+/g, " ")));
    } catch {
      // A malformed escape (%zz) names nothing.
    }
  }
  return params;
}
