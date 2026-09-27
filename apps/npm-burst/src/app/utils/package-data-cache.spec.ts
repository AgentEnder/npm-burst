import { beforeEach, describe, expect, it } from 'vitest';
import type { PackageHealthResponse } from '../../server/functions/health.telefunc';
import {
  readPackageDataCache,
  writePackageDataCache,
} from './package-data-cache';

function health(): PackageHealthResponse {
  return {
    packageName: 'nx',
    installationConfigured: true,
    githubUserAuthAvailable: true,
    repo: { owner: 'nrwl', name: 'nx' },
    externalRepo: null,
    filterConfig: null,
    snapshots: [],
    lastRefreshedAt: '2026-09-01T00:00:00.000Z',
    warnings: [{ source: 'github', message: 'rate limited' } as never],
  };
}

describe('package data cache', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips every data point', () => {
    writePackageDataCache('nx', {
      liveData: { package: 'nx', downloads: { '1.0.0': 5 } },
      versionReleases: [{ version: '1.0.0', date: '2026-01-01' } as never],
      totalDownloads: [{ day: '2026-01-01', downloads: 5 } as never],
      health: health(),
    });

    const cached = readPackageDataCache('nx');
    expect(cached?.liveData?.downloads).toEqual({ '1.0.0': 5 });
    expect(cached?.versionReleases).toHaveLength(1);
    expect(cached?.totalDownloads).toHaveLength(1);
    expect(cached?.health?.repo).toEqual({ owner: 'nrwl', name: 'nx' });
    expect(typeof cached?.savedAt).toBe('number');
  });

  it('drops warnings so stale failures are not replayed', () => {
    writePackageDataCache('nx', {
      liveData: null,
      versionReleases: [],
      totalDownloads: [],
      health: health(),
    });
    expect(readPackageDataCache('nx')?.health?.warnings).toEqual([]);
  });

  it('ignores missing or malformed entries', () => {
    expect(readPackageDataCache('nope')).toBeNull();
    localStorage.setItem('npm-burst:package-data:v1:bad', '{"liveData":1}');
    expect(readPackageDataCache('bad')).toBeNull();
    localStorage.setItem('npm-burst:package-data:v1:worse', 'not json');
    expect(readPackageDataCache('worse')).toBeNull();
  });
});
