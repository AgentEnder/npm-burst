/**
 * Per-request context middleware.
 *
 * Runs once at the top of the universal-middleware chain registered with
 * `vike(app, [...])`. Parses env (D1 binding + secrets) and resolves the
 * Clerk-authenticated user id, then stashes the result on the Hono
 * context for two consumers:
 *
 *   1. The telefunc handler reads it via the universal-middleware
 *      `context` parameter.
 *   2. Plain Hono route handlers (GitHub install/setup/webhook) read it
 *      via `c.var.requestCtx`.
 *
 * Both dev and prod run inside workerd (`@cloudflare/vite-plugin` hosts
 * SSR in workerd in dev too), so `c.env` is the canonical source. The
 * `process.env` fallback is a safety net for the rare codepath where
 * the middleware runs outside a Worker request — Node CLIs that import
 * server modules directly. In dev, populate `.dev.vars` next to
 * `wrangler.toml` with the secrets the production worker reads from
 * the Cloudflare dashboard.
 */

import { enhance } from '@universal-middleware/core';
import type { UniversalMiddleware } from '@universal-middleware/core';

import { getAuthUserId } from './auth';
import { parseEnv, type Env } from './env';

export const REQUEST_CTX_VAR = 'requestCtx' as const;

export interface RequestCtx {
  env: Env;
  userId: string | null;
  request: Request;
}

interface RequestCtxOutContext extends Universal.Context {
  [REQUEST_CTX_VAR]: RequestCtx;
}

interface HonoRuntime {
  env?: Record<string, unknown>;
  executionCtx?: ExecutionContext;
  set?: (key: string, value: unknown) => void;
}

function buildRawEnv(
  honoEnv: Record<string, unknown> | undefined
): Record<string, unknown> {
  // In workerd, `c.env` carries bindings + vars/secrets.
  if (honoEnv && Object.keys(honoEnv).length > 0) {
    return honoEnv;
  }
  // In Node dev, fall back to process.env (Vite loads .env.local) and
  // default DEV_MODE so the env schema picks the dev branch.
  const fromProcess =
    typeof process !== 'undefined' && process.env ? { ...process.env } : {};
  return { DEV_MODE: 'true', ...fromProcess };
}

/**
 * Build a {@link RequestCtx} from a raw Hono environment (or
 * `process.env` fallback). Shared between the universal-middleware path
 * (`requestCtxMiddleware`) and the plain Hono routes that don't go
 * through the universal-middleware adapter (the GitHub App routes).
 */
export async function buildRequestCtx(
  request: Request,
  honoEnv: Record<string, unknown> | undefined
): Promise<RequestCtx> {
  const env = parseEnv(buildRawEnv(honoEnv));
  const userId = await getAuthUserId(request, env);
  return { env, userId, request };
}

export const requestCtxMiddleware: UniversalMiddleware<
  Universal.Context,
  RequestCtxOutContext,
  'hono'
> = enhance(
  async (request, _context, runtime) => {
    const honoRuntime = (runtime as { hono?: HonoRuntime } | undefined)?.hono;
    const env = parseEnv(buildRawEnv(honoRuntime?.env));
    const userId = await getAuthUserId(request, env);
    const ctx: RequestCtx = { env, userId, request };
    honoRuntime?.set?.(REQUEST_CTX_VAR, ctx);
    return { [REQUEST_CTX_VAR]: ctx };
  },
  {
    name: 'npm-burst:request-ctx',
    order: -900,
    immutable: false,
  }
);
