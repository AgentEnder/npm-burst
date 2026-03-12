import { getContext } from 'telefunc';
import { getDb } from '../db';
import { isDevMode } from '../env';
import { cachedFetch } from '../npm-fetch';
import { getFixtureVersionDates } from '../fixtures/packages';
import { parse } from 'semver';

export interface VersionRelease {
  version: string;
  date: string;
}

export async function onGetVersionDates(
  pkg: string
): Promise<{ versions: VersionRelease[] }> {
  const { env } = getContext();

  if (isDevMode(env)) {
    const fixture = getFixtureVersionDates(pkg);
    if (fixture) {
      return {
        versions: Object.entries(fixture).map(([version, date]) => ({
          version,
          date,
        })),
      };
    }
  }

  const db = getDb(env);
  const url = `https://registry.npmjs.org/${encodeURIComponent(pkg)}`;
  const body = await cachedFetch(db, url);
  const data = JSON.parse(body) as { time?: Record<string, string> };

  if (!data.time) {
    return { versions: [] };
  }

  const versions: VersionRelease[] = [];
  for (const [version, timestamp] of Object.entries(data.time)) {
    if (version === 'created' || version === 'modified') continue;
    const parsed = parse(version);
    if (!parsed || parsed.prerelease.length > 0) continue;
    versions.push({ version, date: timestamp.slice(0, 10) });
  }

  versions.sort((a, b) => a.date.localeCompare(b.date));
  return { versions };
}
