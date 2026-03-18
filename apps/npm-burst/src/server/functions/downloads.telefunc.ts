import { Abort, getContext } from 'telefunc';
import { getDb } from '../db';
import { isDevMode } from '../env';
import {
  type ExternalDataWarning,
  withExternalFallback,
} from '../external-data';
import { getFixturePackage } from '../fixtures/packages';
import { cachedFetch } from '../npm-fetch';
import { getYesterdayDate } from '../utils';

interface NpmDownloadsByVersion {
  downloads: Record<string, number>;
  package: string;
}

export interface DownloadsResponse {
  data: NpmDownloadsByVersion | null;
  warnings: ExternalDataWarning[];
}

export async function onGetDownloads(
  pkg: string
): Promise<DownloadsResponse> {
  const { env, userId } = getContext();

  if (!userId) {
    throw Abort({ reason: 'Authentication required' });
  }

  // In dev mode, return fixture data instead of hitting NPM
  if (isDevMode(env)) {
    const fixture = getFixturePackage(pkg);
    if (fixture) {
      return { data: fixture, warnings: [] };
    }
  }

  const db = getDb(env);

  // Fetch from NPM API (cached per day)
  const url = `https://api.npmjs.org/versions/${encodeURI(pkg).replace(
    '/',
    '%2f'
  )}/last-week`;
  const fetchResult = await withExternalFallback(
    { source: 'npm', operation: 'load version downloads' },
    async () => {
      const body = await cachedFetch(db, url);
      return JSON.parse(body) as NpmDownloadsByVersion;
    },
    null,
    { packageName: pkg }
  );
  const data = fetchResult.value;
  const warnings = fetchResult.warning ? [fetchResult.warning] : [];

  if (!data) {
    return { data: null, warnings };
  }

  // Opportunistically save snapshot for yesterday
  const yesterday = getYesterdayDate();

  try {
    await db
      .insertInto('tracked_packages')
      .values({ package_name: pkg })
      .onConflict((oc) => oc.column('package_name').doNothing())
      .execute();

    const pkgRow = await db
      .selectFrom('tracked_packages')
      .select('id')
      .where('package_name', '=', pkg)
      .$narrowType<{ id: number }>()
      .executeTakeFirst();

    if (pkgRow) {
      await db
        .insertInto('snapshots')
        .values({
          package_id: pkgRow.id,
          snapshot_date: yesterday,
          downloads: JSON.stringify(data.downloads),
        })
        .onConflict((oc) =>
          oc.columns(['package_id', 'snapshot_date']).doNothing()
        )
        .execute();
    }
  } catch (e) {
    console.error('Failed to save ad-hoc snapshot:', e);
  }

  return { data, warnings };
}
