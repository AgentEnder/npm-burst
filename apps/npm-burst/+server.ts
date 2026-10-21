import type { Server } from 'vike/types';

import { handleCron } from './src/server/cron';
import { app } from './src/server/hono';
import { parseEnv } from './src/server/env';
import { handleOgRequest, type OgWasm } from './src/server/og-handler';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4200;

/**
 * The card renderer's wasm, compiled by the bundler into `WebAssembly.Module`s.
 * A Worker cannot fetch and instantiate wasm at runtime.
 *
 * Imported lazily because Vike prerenders by importing this file under Node,
 * which cannot load `.wasm` modules. Prerendering never requests a card, so
 * the import only runs in workerd, once per isolate.
 */
let wasm: Promise<OgWasm> | undefined;
function loadWasm(): Promise<OgWasm> {
  wasm ??= Promise.all([
    import('satori/yoga.wasm'),
    import('@resvg/resvg-wasm/index_bg.wasm'),
  ]).then(([yoga, resvg]) => ({ yoga: yoga.default, resvg: resvg.default }));
  return wasm;
}

/**
 * Social cards. This is the only entrypoint with Workers Cache enabled (see
 * `[exports]` in `wrangler.toml`), so the tiered cache sits in front of card
 * rendering and nothing else.
 *
 * A plain object rather than a `WorkerEntrypoint` class: Vike imports this
 * file under Node to prerender, and Node cannot resolve `cloudflare:workers`.
 */
export const OgCard = {
  fetch: async (request: Request, env?: Record<string, unknown>) =>
    handleOgRequest(request, env, await loadWasm()),
};

interface WorkerContext extends ExecutionContext {
  /** Absent outside workerd (`vike preview`'s Node server). */
  exports?: { OgCard: { fetch: (request: Request) => Promise<Response> } };
}

/**
 * `satisfies Server` would reject `scheduled` (Vike's `Server` only
 * types `fetch` + `prod`). Cast through `unknown` so the Worker still
 * exposes the cron entry alongside the HTTP entry — workerd inspects
 * both at deploy time and binds whichever exist.
 *
 * Cards go through `ctx.exports` so the call crosses into the cached
 * entrypoint. Calling `OgCard.fetch` directly would skip the cache.
 */
export default {
  fetch: (
    request: Request,
    env: Record<string, unknown>,
    ctx: WorkerContext | undefined
  ) => {
    if (!new URL(request.url).pathname.startsWith('/og/')) {
      return app.fetch(request, env, ctx);
    }
    return ctx?.exports
      ? ctx.exports.OgCard.fetch(request)
      : OgCard.fetch(request, env);
  },
  scheduled: async (
    _event: ScheduledEvent,
    rawEnv: Record<string, unknown>,
    executionCtx: ExecutionContext
  ) => {
    executionCtx.waitUntil(handleCron(parseEnv(rawEnv)));
  },
  prod: { port },
} as unknown as Server;
