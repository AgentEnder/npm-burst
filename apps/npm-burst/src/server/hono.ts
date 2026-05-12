/**
 * npm-burst Hono app.
 *
 *   1. Per-request ctx middleware (env + auth) runs first, exposing
 *      `c.var.requestCtx` to plain Hono routes and threading the same
 *      ctx through to the telefunc handler as universal middleware.
 *   2. GitHub App install / setup / webhook routes — Pages Functions that
 *      used to live under `functions/api/github/*.ts`.
 *   3. Telefunc at `/_telefunc`, wired through `vike(app, [...])` so it
 *      sees the prebuilt ctx.
 *   4. Vike SSR catches everything else.
 *
 * The Worker entry lives at `+server.ts` at the app root.
 */

import vike from '@vikejs/hono';
import { Hono } from 'hono';

import {
  handleGitHubAppInstall,
  handleGitHubAppSetup,
  handleGitHubWebhook,
} from './github-app';
import {
  buildRequestCtx,
  requestCtxMiddleware,
  REQUEST_CTX_VAR,
  type RequestCtx,
} from './request-ctx-middleware';
import { telefuncHandler } from './telefunc-handler';

export interface WorkerBindings {
  DB?: D1Database;
}

interface HonoVariables {
  [REQUEST_CTX_VAR]: RequestCtx;
}

function getApp() {
  const app = new Hono<{
    Bindings: WorkerBindings;
    Variables: HonoVariables;
  }>();

  // Plain Hono mirror of `requestCtxMiddleware` for GitHub App routes —
  // those are direct Hono routes, not universal handlers, so the
  // universal-middleware adapter (set up by `vike(app, [...])`) doesn't
  // run on them. Same env + auth logic, same `c.var.requestCtx` output.
  app.use('/api/github/*', async (c, next) => {
    const honoEnv = c.env as unknown as Record<string, unknown> | undefined;
    c.set(REQUEST_CTX_VAR, await buildRequestCtx(c.req.raw, honoEnv));
    await next();
  });

  app.get('/api/github/install', (c) =>
    handleGitHubAppInstall(c.req.raw, c.var.requestCtx.env)
  );
  app.get('/api/github/setup', (c) => handleGitHubAppSetup(c.req.raw));
  app.post('/api/github/webhook', (c) =>
    handleGitHubWebhook(c.req.raw, c.var.requestCtx.env, c.executionCtx)
  );

  vike(app, [requestCtxMiddleware, telefuncHandler]);

  return app;
}

export const app = getApp();
