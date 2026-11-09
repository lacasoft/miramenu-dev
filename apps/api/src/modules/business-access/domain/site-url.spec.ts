import { branchUrl, qrShortUrl } from './site-url';

describe('branchUrl (ADR-0029)', () => {
  it('puts the slug in the path when the branch uses its business subdomain', () => {
    expect(
      branchUrl('https://mirame.nu', {
        branchSubdomain: null,
        businessSubdomain: 'elrestaurante',
        slug: 'centro',
      }),
    ).toBe('https://elrestaurante.mirame.nu/centro');
  });

  it('uses the branch subdomain alone when the branch has one', () => {
    expect(
      branchUrl('https://mirame.nu', {
        branchSubdomain: 'centro-mx',
        businessSubdomain: 'elrestaurante',
        slug: 'centro',
      }),
    ).toBe('https://centro-mx.mirame.nu/');
  });

  it('keeps the scheme and port of the configured site, as in development', () => {
    expect(
      branchUrl('http://miramenu.localhost:5173', {
        branchSubdomain: null,
        businessSubdomain: 'demo',
        slug: 'norte',
      }),
    ).toBe('http://demo.miramenu.localhost:5173/norte');
  });
});

describe('qrShortUrl (ADR-0010)', () => {
  it('links the code on the bare site domain', () => {
    expect(qrShortUrl('https://mirame.nu', 'k7m2x9p')).toBe(
      'https://mirame.nu/k7m2x9p',
    );
    expect(qrShortUrl('http://miramenu.localhost:5173', 'k7m2x9p')).toBe(
      'http://miramenu.localhost:5173/k7m2x9p',
    );
  });
});
