/**
 * Reads one cookie from a Cookie header. Express 5 does not parse cookies, and the API
 * only needs one, so this avoids a dependency. Values are taken as they are, unquoted.
 */
export function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (header === undefined) return undefined;
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() === name) {
      const value = pair.slice(separator + 1).trim();
      return value.length > 0 ? value : undefined;
    }
  }
  return undefined;
}
