import { getContext } from 'telefunc';
import { getDb } from '../db';
import { isDevMode } from '../env';
import {
  type ExternalDataWarning,
  withExternalFallback,
} from '../external-data';
import { cachedFetch } from '../npm-fetch';
import { getFixtureTotalDownloads } from '../fixtures/packages';

export interface DailyDownloadPoint {
  day: string;
  downloads: number;
}

export interface TotalDownloadsResponse {
  downloads: DailyDownloadPoint[];
  warnings: ExternalDataWarning[];
}

export async function onGetTotalDownloads(
  pkg: string,
  start: string,
  end: string
): Promise<TotalDownloadsResponse> {
  const { env } = getContext();

  if (isDevMode(env)) {
    const fixture = getFixtureTotalDownloads(pkg);
    // Filter to requested range
    const filtered = fixture.filter((p) => p.day >= start && p.day <= end);
    return { downloads: filtered, warnings: [] };
  }

  const db = getDb(env);
  const encodedPkg = encodeURIComponent(pkg);
  const url = `https://api.npmjs.org/downloads/range/${start}:${end}/${encodedPkg}`;
  const result = await withExternalFallback(
    { source: 'npm', operation: 'load total downloads' },
    async () => {
      const body = await cachedFetch(db, url);
      const data = JSON.parse(body) as {
        downloads?: { day: string; downloads: number }[];
      };
      return (data.downloads ?? []).map((d) => ({
        day: d.day,
        downloads: d.downloads,
      }));
    },
    [],
    { packageName: pkg, start, end }
  );

  return {
    downloads: result.value,
    warnings: result.warning ? [result.warning] : [],
  };
}
