import { handleCron } from './cron';
import { parseEnv } from './env';

export default {
  async scheduled(
    _controller: ScheduledController,
    env: unknown,
    ctx: ExecutionContext
  ) {
    const validatedEnv = parseEnv(env);
    ctx.waitUntil(handleCron(validatedEnv));
  },
};
