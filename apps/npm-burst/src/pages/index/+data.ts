import type { PageContextServer } from 'vike/types';

import { getDb } from '../../server/db';
import { isDevMode } from '../../server/env';
import { getAllFixturePackageNames } from '../../server/fixtures/packages';
import { listTrackedPackages } from '../../server/snapshots';

/** How many tracked packages the landing page lists. */
const LANDING_PACKAGE_LIMIT = 12;

export interface IndexData {
  /**
   * Packages this instance holds snapshots for, newest tracked first.
   *
   * Server-rendered rather than fetched after hydration, because these are the
   * site's internal links to its own indexable pages — a crawler needs to see
   * them in the HTML. That they are also the most useful thing to put in front
   * of a human who just landed is what makes this worth doing at all.
   */
  trackedPackages: string[];
}

export async function data(pageContext: PageContextServer): Promise<IndexData> {
  const env = pageContext.requestCtx?.env;

  if (!env || isDevMode(env)) {
    return {
      trackedPackages: getAllFixturePackageNames().slice(
        0,
        LANDING_PACKAGE_LIMIT
      ),
    };
  }

  try {
    const tracked = await listTrackedPackages(
      getDb(env),
      LANDING_PACKAGE_LIMIT
    );
    return { trackedPackages: tracked.map((row) => row.packageName) };
  } catch {
    // The landing page's job is the search box; a database hiccup should
    // degrade the list away, not take the page down.
    return { trackedPackages: [] };
  }
}
