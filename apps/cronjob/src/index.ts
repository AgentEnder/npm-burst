import { handleFetch } from './api';
import { handleCron } from './cron';
import { parseEnv } from './env';

export default {
  async fetch(request: Request, env: unknown) {
    const validatedEnv = parseEnv(env);
    return handleFetch(request, validatedEnv);
  },

  async scheduled(
    _controller: ScheduledController,
    env: unknown,
    ctx: ExecutionContext
  ) {
    const validatedEnv = parseEnv(env);
    ctx.waitUntil(handleCron(validatedEnv));
  },
};
