import { handleCron } from '../src/server/cron';
import { parseEnv } from '../src/server/env';

export default {
  async scheduled(_event: ScheduledEvent, env: unknown) {
    const validatedEnv = parseEnv(env);
    await handleCron(validatedEnv);
  },
};
