import { handleCron } from '../src/server/cron';

export default {
  async scheduled(event: ScheduledEvent, env: any) {
    await handleCron(env);
  },
};
