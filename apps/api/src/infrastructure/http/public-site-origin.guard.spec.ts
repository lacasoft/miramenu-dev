import { isPublicSiteOrigin } from './public-site-origin.guard';

describe('isPublicSiteOrigin', () => {
  const site = new URL('https://mirame.nu');

  it('accepts the public site and the subdomain of any restaurant', () => {
    for (const origin of [
      'https://mirame.nu',
      'https://tacos.mirame.nu',
      'https://sucursal.tacos.mirame.nu',
    ]) {
      expect(isPublicSiteOrigin(site, origin)).toBe(true);
    }
  });

  it('refuses other sites, look-alikes, other schemes or ports, and no origin', () => {
    for (const origin of [
      undefined,
      'null',
      '',
      'https://evil.example',
      'https://mirame.nu.evil.example',
      'https://evilmirame.nu',
      'http://mirame.nu',
      'https://mirame.nu:8443',
      'https://tacos.mirame.nu/path',
    ]) {
      expect(isPublicSiteOrigin(site, origin)).toBe(false);
    }
  });

  it('keeps the port of a local site', () => {
    const local = new URL('http://miramenu.localhost:5173');

    expect(
      isPublicSiteOrigin(local, 'http://tacos.miramenu.localhost:5173'),
    ).toBe(true);
    expect(
      isPublicSiteOrigin(local, 'http://tacos.miramenu.localhost:5174'),
    ).toBe(false);
  });
});
