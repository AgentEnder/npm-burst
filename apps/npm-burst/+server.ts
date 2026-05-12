import type { Server } from 'vike/types';

import { handleCron } from './src/server/cron';
import { app } from './src/server/hono';
import { parseEnv } from './src/server/env';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4200;

/**
 * `satisfies Server` would reject `scheduled` (Vike's `Server` only
 * types `fetch` + `prod`). Cast through `unknown` so the Worker still
 * exposes the cron entry alongside the HTTP entry — workerd inspects
 * both at deploy time and binds whichever exist.
 */
export default {
  fetch: app.fetch,
  scheduled: async (
    _event: ScheduledEvent,
    rawEnv: Record<string, unknown>,
    executionCtx: ExecutionContext
  ) => {
    executionCtx.waitUntil(handleCron(parseEnv(rawEnv)));
  },
  prod: { port },
} as unknown as Server;
