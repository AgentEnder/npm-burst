import { renderRobotsTxt, renderSitemapXml } from './seo-routes';

describe('renderRobotsTxt', () => {
  it('points crawlers at the sitemap with an absolute URL', () => {
    expect(renderRobotsTxt()).toContain(
      'Sitemap: https://npm-burst.com/sitemap.xml'
    );
  });

  it('keeps the per-user dashboard and non-document routes out', () => {
    const robots = renderRobotsTxt();
    expect(robots).toContain('Disallow: /usage');
    expect(robots).toContain('Disallow: /_telefunc');
    expect(robots).toContain('Disallow: /api/');
  });

  it('still allows the indexable surface', () => {
    expect(renderRobotsTxt()).toContain('Allow: /');
  });
});

describe('renderSitemapXml', () => {
  it('emits absolute locations', () => {
    const xml = renderSitemapXml([{ path: '/package/nx/' }]);
    expect(xml).toContain('<loc>https://npm-burst.com/package/nx/</loc>');
  });

  it('includes lastmod only when known', () => {
    const xml = renderSitemapXml([
      { path: '/package/nx/', lastmod: '2026-08-17' },
      { path: '/package/vite/', lastmod: null },
    ]);

    expect(xml).toContain('<lastmod>2026-08-17</lastmod>');
    expect(xml.match(/<lastmod>/g)).toHaveLength(1);
  });

  // Scoped package names contain characters that are legal in a URL but must
  // still be escaped in XML; an unescaped '&' would make the document invalid
  // and the whole sitemap unreadable, not just that entry.
  it('escapes XML metacharacters', () => {
    const xml = renderSitemapXml([{ path: '/package/a&b/' }]);
    expect(xml).toContain('a&amp;b');
    expect(xml).not.toMatch(/[^&]&(?!amp;|lt;|gt;|quot;|apos;)/);
  });

  it('is well-formed with no entries', () => {
    const xml = renderSitemapXml([]);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('</urlset>');
  });
});
