/**
 * Telefunc handler. Reads the per-request context prebuilt by
 * {@link requestCtxMiddleware} (registered first in `vike(app, [...])`)
 * and forwards the request to telefunc.
 *
 * Real auth still happens inside each telefunc body — this handler only
 * threads the parsed env + userId through telefunc's context.
 */

import { enhance, type UniversalHandler } from '@universal-middleware/core';
import { config, telefunc } from 'telefunc';

import { REQUEST_CTX_VAR, type RequestCtx } from './request-ctx-middleware';

config.telefuncUrl = '/_telefunc';
// Telefunc's dev-time `.telefunc.ts` collocation check does
// `readdirSync` against the source path. Workerd's virtual FS has no
// `/bundle/src/server/functions`, so the check throws ENOENT on every
// telefunc call. The shield() generator at build time already enforces
// naming, so disabling the runtime variant is safe.
config.disableNamingConvention = true;

interface TelefuncInContext extends Universal.Context {
  [REQUEST_CTX_VAR]?: RequestCtx;
}

export const telefuncHandler: UniversalHandler<TelefuncInContext> = enhance(
  async (request, context) => {
    const ctx = context[REQUEST_CTX_VAR];
    if (!ctx) {
      throw new Error(
        'telefunc-handler: request ctx is missing — ' +
          '`requestCtxMiddleware` should run first in `vike(app, [...])`.'
      );
    }
    const { body, statusCode, contentType } = await telefunc({
      request,
      context: ctx,
    });
    return new Response(body, {
      status: statusCode,
      headers: { 'content-type': contentType },
    });
  },
  {
    name: 'npm-burst:telefunc-handler',
    path: '/_telefunc',
    method: ['GET', 'POST'],
    immutable: false,
  }
);
