import type { Config } from 'vike/types';

export default {
  /**
   * Server-rendered per request rather than prerendered: the page lists the
   * packages currently tracked, which changes as people track new ones. The
   * HTML is user-agnostic, so it is edge-cached alongside package pages (see
   * the cache middleware registration in `src/server/hono.ts`).
   */
  prerender: false,

  title: 'Npm Burst — npm download stats broken down by version',
  description:
    'Look up any npm package and see how its weekly downloads split across major, minor and patch versions, with daily snapshots showing how adoption moves.',
} satisfies Config;
