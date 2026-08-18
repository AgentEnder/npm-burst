import { absoluteUrl, SITE_ORIGIN } from './site';

describe('absoluteUrl', () => {
  it('prefixes the canonical origin', () => {
    expect(absoluteUrl('/package/nx/')).toBe(`${SITE_ORIGIN}/package/nx/`);
  });

  // `trailingSlash: true` means /usage redirects to /usage/. A canonical or
  // sitemap entry without the slash points at the redirect, not the page.
  it('adds the trailing slash the routing config requires', () => {
    expect(absoluteUrl('/usage')).toBe(`${SITE_ORIGIN}/usage/`);
    expect(absoluteUrl('/package/@nx/devkit')).toBe(
      `${SITE_ORIGIN}/package/@nx/devkit/`
    );
  });

  it('does not double up an existing slash', () => {
    expect(absoluteUrl('/usage/')).toBe(`${SITE_ORIGIN}/usage/`);
  });

  it('handles the root path', () => {
    expect(absoluteUrl('/')).toBe(`${SITE_ORIGIN}/`);
  });

  it('leaves file paths alone', () => {
    expect(absoluteUrl('/sitemap.xml')).toBe(`${SITE_ORIGIN}/sitemap.xml`);
    expect(absoluteUrl('/robots.txt')).toBe(`${SITE_ORIGIN}/robots.txt`);
  });

  it('tolerates a missing leading slash', () => {
    expect(absoluteUrl('usage')).toBe(`${SITE_ORIGIN}/usage/`);
  });
});
