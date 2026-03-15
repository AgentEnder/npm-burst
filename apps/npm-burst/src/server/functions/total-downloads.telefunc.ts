import { getContext } from 'telefunc';
import { getDb } from '../db';
import { isDevMode } from '../env';
import { cachedFetch } from '../npm-fetch';
import { getFixtureTotalDownloads } from '../fixtures/packages';

export interface DailyDownloadPoint {
  day: string;
  downloads: number;
}

export async function onGetTotalDownloads(
  pkg: string,
  start: string,
  end: string
): Promise<{ downloads: DailyDownloadPoint[] }> {
  const { env } = getContext();

  if (isDevMode(env)) {
    const fixture = getFixtureTotalDownloads(pkg);
    // Filter to requested range
    const filtered = fixture.filter((p) => p.day >= start && p.day <= end);
    return { downloads: filtered };
  }

  const db = getDb(env);
  const encodedPkg = encodeURIComponent(pkg);
  const url = `https://api.npmjs.org/downloads/range/${start}:${end}/${encodedPkg}`;
  const body = await cachedFetch(db, url);
  const data = JSON.parse(body) as {
    downloads?: { day: string; downloads: number }[];
  };

  return {
    downloads: (data.downloads ?? []).map((d) => ({
      day: d.day,
      downloads: d.downloads,
    })),
  };
}
