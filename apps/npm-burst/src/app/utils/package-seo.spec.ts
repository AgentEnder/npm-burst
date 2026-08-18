import {
  buildPackageDescription,
  buildPackageTitle,
  formatDownloads,
  summarizeSnapshot,
} from './package-seo';

describe('formatDownloads', () => {
  it('leaves small counts alone', () => {
    expect(formatDownloads(0)).toBe('0');
    expect(formatDownloads(903)).toBe('903');
  });

  it('abbreviates thousands, dropping the decimal past 10K', () => {
    expect(formatDownloads(1_240)).toBe('1.2K');
    expect(formatDownloads(47_200)).toBe('47K');
  });

  it('abbreviates millions', () => {
    expect(formatDownloads(1_240_000)).toBe('1.24M');
    expect(formatDownloads(23_500_000)).toBe('23.5M');
  });

  it('does not emit NaN for junk input', () => {
    expect(formatDownloads(Number.NaN)).toBe('0');
    expect(formatDownloads(-5)).toBe('0');
  });
});

describe('summarizeSnapshot', () => {
  it('totals downloads and counts versions', () => {
    const summary = summarizeSnapshot({
      '21.0.0': 600,
      '21.1.0': 200,
      '20.5.0': 200,
    });

    expect(summary?.totalDownloads).toBe(1000);
    expect(summary?.versionCount).toBe(3);
  });

  it('picks the major line with the largest share, not the largest version', () => {
    // 20.x wins on volume even though 21.x is the newer line.
    const summary = summarizeSnapshot({
      '21.0.0': 100,
      '20.1.0': 500,
      '20.2.0': 400,
    });

    expect(summary?.topMajor).toBe('20');
    expect(summary?.topMajorShare).toBeCloseTo(0.9);
  });

  it('returns null when there is nothing to describe', () => {
    expect(summarizeSnapshot(null)).toBeNull();
    expect(summarizeSnapshot({})).toBeNull();
    // Zero-download entries are not versions worth counting.
    expect(summarizeSnapshot({ '1.0.0': 0 })).toBeNull();
  });

  it('tolerates unparseable version keys without dropping their downloads', () => {
    const summary = summarizeSnapshot({ '1.0.0': 100, garbage: 50 });

    expect(summary?.totalDownloads).toBe(150);
    expect(summary?.versionCount).toBe(2);
    expect(summary?.topMajor).toBe('1');
  });
});

describe('buildPackageTitle', () => {
  it('leads with the real numbers when there is a snapshot', () => {
    const summary = summarizeSnapshot({ '21.0.0': 1_240_000 });
    expect(buildPackageTitle('nx', summary, 'sunburst')).toBe(
      'nx — 1.24M weekly npm downloads across 1 versions'
    );
  });

  it('falls back to a generic title for an unsnapshotted package', () => {
    expect(buildPackageTitle('left-pad', null, 'sunburst')).toBe(
      'left-pad — npm download stats by version | Npm Burst'
    );
  });

  it('describes the health tab differently', () => {
    expect(buildPackageTitle('nx', null, 'health')).toContain(
      'repository health'
    );
  });

  it('handles scoped names', () => {
    expect(buildPackageTitle('@nx/devkit', null, 'sunburst')).toContain(
      '@nx/devkit'
    );
  });
});

describe('buildPackageDescription', () => {
  it('states the dominant major line', () => {
    const summary = summarizeSnapshot({ '21.0.0': 620, '20.0.0': 380 });
    const description = buildPackageDescription('nx', summary, 'sunburst');

    expect(description).toContain('62% are on 21.x');
    expect(description).toContain('nx');
  });

  it('stays within the length search engines display', () => {
    const summary = summarizeSnapshot({ '1.0.0': 1_000_000 });
    const longName = `@scope/${'a'.repeat(120)}`;

    expect(
      buildPackageDescription(longName, summary, 'sunburst').length
    ).toBeLessThanOrEqual(155);
  });

  it('marks a truncated description and leaves no dangling space', () => {
    const summary = summarizeSnapshot({ '1.0.0': 1_000_000 });
    const description = buildPackageDescription(
      `@scope/${'a'.repeat(120)}`,
      summary,
      'sunburst'
    );

    expect(description.endsWith('…')).toBe(true);
    // The ellipsis attaches to the text, rather than floating after a space.
    expect(description).not.toMatch(/\s…$/);
  });

  it('cuts on a word boundary rather than mid-word', () => {
    // A name long enough to force truncation, but short enough that the cut
    // lands in the prose that follows it — where word boundaries exist.
    const summary = summarizeSnapshot({ '1.0.0': 1_000_000 });
    const description = buildPackageDescription(
      `@scope/${'a'.repeat(60)}`,
      summary,
      'sunburst'
    );

    expect(description.endsWith('…')).toBe(true);

    const lastWord = description.slice(0, -1).split(' ').pop() ?? '';
    // Whatever word the cut landed on survived whole: it still appears,
    // followed by a space, in the untruncated text the builder started from.
    expect(
      `1.00M weekly downloads of @scope/${'a'.repeat(
        60
      )} across 1 published versions. 100% are on 1.x. See the full version breakdown and adoption history.`
    ).toContain(`${lastWord} `);
  });
});
