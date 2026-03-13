import type { Kysely } from 'kysely';
import type { DB } from './db-schema';
import { cachedFetch } from './npm-fetch';

export interface NpmMaintainer {
  name: string;
  email: string;
}

export async function getPackageMaintainers(
  db: Kysely<DB>,
  pkg: string
): Promise<NpmMaintainer[]> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(pkg)}`;
  const body = await cachedFetch(db, url);
  try {
    const data = JSON.parse(body) as { maintainers?: NpmMaintainer[] };
    return data.maintainers ?? [];
  } catch {
    return [];
  }
}

export function isUserMaintainer(
  userEmails: string[],
  maintainers: NpmMaintainer[]
): boolean {
  const maintainerEmailSet = new Set(
    maintainers.map((m) => m.email.toLowerCase())
  );
  return userEmails.some((email) =>
    maintainerEmailSet.has(email.toLowerCase())
  );
}
