export interface BranchLocation {
  /** The branch's own current subdomain, if it has one. */
  branchSubdomain: string | null;
  /** The business's current subdomain, used with the slug otherwise. */
  businessSubdomain: string;
  slug: string;
}

function onSubdomain(
  publicSiteUrl: string,
  subdomain: string,
  path: string,
): string {
  const site = new URL(publicSiteUrl);
  site.hostname = `${subdomain}.${site.hostname}`;
  site.pathname = path;
  return site.toString();
}

/**
 * Where a branch's menu lives (ADR-0029): its own subdomain if it has one, otherwise its
 * business's subdomain with the slug in the path.
 */
export function branchUrl(
  publicSiteUrl: string,
  location: BranchLocation,
): string {
  return location.branchSubdomain !== null
    ? onSubdomain(publicSiteUrl, location.branchSubdomain, '/')
    : onSubdomain(
        publicSiteUrl,
        location.businessSubdomain,
        `/${location.slug}`,
      );
}

/** The short link printed in the QR, on the bare site domain (ADR-0010): mirame.nu/<code>. */
export function qrShortUrl(publicSiteUrl: string, code: string): string {
  const site = new URL(publicSiteUrl);
  site.pathname = `/${code}`;
  return site.toString();
}
