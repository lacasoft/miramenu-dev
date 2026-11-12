import { RESERVED_SUBDOMAINS, resolveQuerySchema } from "@miramenu/contracts";

/** A restaurant's place on the public site, as the API's /resolve takes it (ADR-0029). */
export interface SiteAddress {
  subdomain: string;
  /** Only when the branch lives under its business's subdomain. */
  slug?: string;
}

/**
 * Where the diner is, from the page's host and path: a restaurant subdomain of the public
 * site and, when the branch uses its business's subdomain, its slug as the first path
 * segment. Later segments belong to the PWA's own screens. null when the page is not a
 * restaurant's: the bare site, a reserved name, another domain or a malformed label.
 */
export function siteAddressOf(
  page: { hostname: string; pathname: string },
  siteHostname: string,
): SiteAddress | null {
  const host = page.hostname.toLowerCase();
  const site = siteHostname.toLowerCase();
  if (!host.endsWith(`.${site}`)) return null;
  const subdomain = host.slice(0, -(site.length + 1));
  if ((RESERVED_SUBDOMAINS as readonly string[]).includes(subdomain))
    return null;

  const [first] = page.pathname.split("/").filter((part) => part.length > 0);
  const parsed = resolveQuerySchema.safeParse(
    first === undefined ? { subdomain } : { subdomain, slug: first },
  );
  return parsed.success ? parsed.data : null;
}
