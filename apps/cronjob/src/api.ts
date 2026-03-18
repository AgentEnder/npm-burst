import type { BotPattern } from '@npm-burst/github-data-access';
import type { Kysely } from 'kysely';
import type { DB } from './db-schema';
import { getDb } from './db';
import type { Env } from './env';
import { snapshotSingleRepo, getInstallationTokenForRepo } from './github-health';

interface SnapshotRepoBody {
  repoId: number;
  owner: string;
  name: string;
  installationId: number | null;
}

async function loadBotPatterns(db: Kysely<DB>): Promise<BotPattern[]> {
  const rows = await db
    .selectFrom('github_bot_patterns')
    .select(['pattern_type', 'pattern_value'])
    .execute();

  return rows.map((row) => ({
    pattern_type: row.pattern_type as BotPattern['pattern_type'],
    pattern_value: row.pattern_value,
  }));
}

export async function handleFetch(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === '/api/snapshot-repo' && request.method === 'POST') {
    return handleSnapshotRepo(request, env);
  }

  return new Response('Not found', { status: 404 });
}

async function handleSnapshotRepo(
  request: Request,
  env: Env
): Promise<Response> {
  if (env.INTERNAL_API_SECRET) {
    const auth = request.headers.get('Authorization');
    if (auth !== `Bearer ${env.INTERNAL_API_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  const body = (await request.json()) as SnapshotRepoBody;
  const { repoId, owner, name, installationId } = body;

  if (!repoId || !owner || !name) {
    return new Response('Missing required fields', { status: 400 });
  }

  const db = getDb(env);
  const token = await getInstallationTokenForRepo(db, installationId, env);
  if (!token) {
    return Response.json(
      { ok: false, error: 'No valid installation token' },
      { status: 422 }
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const botPatterns = await loadBotPatterns(db);

  const success = await snapshotSingleRepo(
    db,
    { id: repoId, owner, name },
    token,
    today,
    botPatterns
  );

  return Response.json({ ok: success });
}
