import type { Config } from 'vike/types';

export default {
  /**
   * Rendered on demand, not at build time: the route is parameterised by
   * package name, so there is no finite URL set to prerender. The Worker
   * SSRs each request and the response is edge-cached (see the HTML cache
   * middleware in `src/server/hono.ts`).
   */
  prerender: false,
} satisfies Config;
