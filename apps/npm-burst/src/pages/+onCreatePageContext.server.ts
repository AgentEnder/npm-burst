/**
 * Inject server-side request state into Vike's pageContext so client
 * components can read it through `usePageContext()` instead of
 * touching `import.meta.env.*` directly. Anything added here also
 * needs to be listed in `+config.ts`'s `passToClient` so it survives
 * server→client hydration.
 *
 * Runs server-side only. During prerender there's no Hono runtime
 * attached, so we default to `isDevMode = false` — prerendered HTML
 * never ships claiming dev mode.
 */

import type { PageContextServer } from 'vike/types';

import { isDevMode } from '../server/env';
import {
  REQUEST_CTX_VAR,
  type RequestCtx,
} from '../server/request-ctx-middleware';

interface HonoRuntime {
  get?: (key: string) => unknown;
}

export async function onCreatePageContext(
  pageContext: PageContextServer
): Promise<void> {
  const runtime = pageContext.runtime as { hono?: HonoRuntime } | undefined;
  const ctx = runtime?.hono?.get?.(REQUEST_CTX_VAR) as RequestCtx | undefined;
  pageContext.isDevMode = ctx ? isDevMode(ctx.env) : false;
  pageContext.requestCtx = ctx ?? null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Vike {
    interface PageContext {
      isDevMode: boolean;
      /**
       * Server-only. Deliberately absent from `passToClient` — it holds the
       * D1 binding, secrets and the raw Request, none of which may cross to
       * the browser. `+data` hooks read the env from here.
       */
      requestCtx: RequestCtx | null;
    }
    interface Server {
      server: 'hono';
    }
  }
}
