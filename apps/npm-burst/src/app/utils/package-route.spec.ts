import { describe, expect, it } from 'vitest';
import {
  buildLegacyRedirectPath,
  buildPackagePath,
  DEFAULT_PACKAGE_TAB,
  parseLegacyPackageHash,
  parsePackageRoute,
} from './package-route';

describe('parsePackageRoute', () => {
  it('reads an unscoped package with no tab as the default tab', () => {
    expect(parsePackageRoute('nx')).toEqual({
      packageName: 'nx',
      tab: DEFAULT_PACKAGE_TAB,
    });
  });

  it('reads an unscoped package with a tab', () => {
    expect(parsePackageRoute('nx/health')).toEqual({
      packageName: 'nx',
      tab: 'health',
    });
  });

  it('treats the first two segments as the name when scoped', () => {
    expect(parsePackageRoute('@nx/devkit')).toEqual({
      packageName: '@nx/devkit',
      tab: DEFAULT_PACKAGE_TAB,
    });
  });

  it('reads a tab after a scoped package name', () => {
    expect(parsePackageRoute('@nx/devkit/health')).toEqual({
      packageName: '@nx/devkit',
      tab: 'health',
    });
  });

  it('tolerates the trailing slash Vike adds via trailingSlash: true', () => {
    expect(parsePackageRoute('@nx/devkit/health/')).toEqual({
      packageName: '@nx/devkit',
      tab: 'health',
    });
    expect(parsePackageRoute('nx/')).toEqual({
      packageName: 'nx',
      tab: DEFAULT_PACKAGE_TAB,
    });
  });

  it('tolerates a leading slash', () => {
    expect(parsePackageRoute('/nx/health')).toEqual({
      packageName: 'nx',
      tab: 'health',
    });
  });

  it('decodes percent-encoded segments', () => {
    expect(parsePackageRoute('%40nx/devkit')).toEqual({
      packageName: '@nx/devkit',
      tab: DEFAULT_PACKAGE_TAB,
    });
  });

  it('does not mistake a package named like a tab for a tab', () => {
    // `health` is a real unscoped package name, and it sits in the package
    // position here — the tab is read positionally, never by name.
    expect(parsePackageRoute('health')).toEqual({
      packageName: 'health',
      tab: DEFAULT_PACKAGE_TAB,
    });
    expect(parsePackageRoute('@acme/health')).toEqual({
      packageName: '@acme/health',
      tab: DEFAULT_PACKAGE_TAB,
    });
  });

  it('rejects an unknown tab rather than silently defaulting', () => {
    expect(parsePackageRoute('nx/bogus')).toBeNull();
    expect(parsePackageRoute('@nx/devkit/bogus')).toBeNull();
  });

  it('rejects a scope with no package name', () => {
    expect(parsePackageRoute('@nx')).toBeNull();
    expect(parsePackageRoute('@nx/')).toBeNull();
  });

  it('rejects empty input', () => {
    expect(parsePackageRoute('')).toBeNull();
    expect(parsePackageRoute('/')).toBeNull();
  });

  it('rejects trailing junk beyond the tab', () => {
    expect(parsePackageRoute('nx/health/extra')).toBeNull();
    expect(parsePackageRoute('@nx/devkit/health/extra')).toBeNull();
  });
});

describe('buildPackagePath', () => {
  it('omits the segment for the default tab so it stays canonical', () => {
    expect(buildPackagePath('nx')).toBe('/package/nx');
    expect(buildPackagePath('nx', DEFAULT_PACKAGE_TAB)).toBe('/package/nx');
  });

  it('appends non-default tabs', () => {
    expect(buildPackagePath('nx', 'health')).toBe('/package/nx/health');
  });

  it('leaves the scope separator unencoded', () => {
    expect(buildPackagePath('@nx/devkit')).toBe('/package/@nx/devkit');
    expect(buildPackagePath('@nx/devkit', 'lifecycle')).toBe(
      '/package/@nx/devkit/lifecycle'
    );
  });

  it('round-trips through the parser', () => {
    for (const name of ['nx', '@nx/devkit', 'health']) {
      for (const tab of [DEFAULT_PACKAGE_TAB, 'health', 'adoption'] as const) {
        const path = buildPackagePath(name, tab);
        expect(parsePackageRoute(path.replace('/package/', ''))).toEqual({
          packageName: name,
          tab,
        });
      }
    }
  });
});

describe('parseLegacyPackageHash', () => {
  it('reads a bare package hash', () => {
    expect(parseLegacyPackageHash('#/nx')).toEqual({
      packageName: 'nx',
      search: '',
    });
  });

  it('carries hash query params over to the real query string', () => {
    expect(parseLegacyPackageHash('#/nx?sortBy=version&lpf=2.00')).toEqual({
      packageName: 'nx',
      search: 'sortBy=version&lpf=2.00',
    });
  });

  it('decodes the scoped names the old format percent-encoded', () => {
    expect(parseLegacyPackageHash('#/%40nx%2Fdevkit')).toEqual({
      packageName: '@nx/devkit',
      search: '',
    });
  });

  it('tolerates a missing leading slash', () => {
    expect(parseLegacyPackageHash('#nx')).toEqual({
      packageName: 'nx',
      search: '',
    });
  });

  it('returns null when there is no package to redirect to', () => {
    expect(parseLegacyPackageHash('')).toBeNull();
    expect(parseLegacyPackageHash('#')).toBeNull();
    expect(parseLegacyPackageHash('#/')).toBeNull();
    expect(parseLegacyPackageHash('#/?sortBy=version')).toBeNull();
  });
});

describe('buildLegacyRedirectPath', () => {
  it('produces the canonical path for a legacy hash', () => {
    expect(buildLegacyRedirectPath('#/nx')).toBe('/package/nx');
    expect(buildLegacyRedirectPath('#/%40nx%2Fdevkit')).toBe(
      '/package/@nx/devkit'
    );
  });

  it('preserves view state as query params', () => {
    expect(buildLegacyRedirectPath('#/nx?sortBy=version&lpf=2.00')).toBe(
      '/package/nx?sortBy=version&lpf=2.00'
    );
  });

  it('returns null when there is nothing to redirect', () => {
    expect(buildLegacyRedirectPath('#/')).toBeNull();
  });
});
