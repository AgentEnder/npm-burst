import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';
import { parseEnv, type Env } from './env';

type GitHubRouteContext = {
  request: Request;
  env: Env;
  params: Record<string, string>;
  data: Record<string, unknown>;
  functionPath: string;
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
  next(input?: Request | string, init?: RequestInit): Promise<Response>;
};
type GitHubRouteHandler = (context: GitHubRouteContext, env: Env) => Promise<Response>;

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function getDevEnv(rawEnv: Record<string, string>): Env {
  return parseEnv({
    DEV_MODE: 'true',
    ...rawEnv,
    GITHUB_APP_PRIVATE_KEY: rawEnv.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  });
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const origin = `http://${req.headers.host ?? 'localhost:4200'}`;
  const url = new URL(req.url ?? '/', origin);
  const method = req.method ?? 'GET';
  const body =
    method === 'GET' || method === 'HEAD' ? undefined : await readBody(req);

  return new Request(url, {
    method,
    headers: req.headers as Record<string, string>,
    body,
    duplex: body ? 'half' : undefined,
  });
}

function createContext(request: Request, env: Env): GitHubRouteContext {
  return {
    request,
    env,
    params: {},
    data: {},
    functionPath: new URL(request.url).pathname,
    waitUntil(promise) {
      void promise.catch((error) => {
        console.error('Unhandled waitUntil() error in Vite dev GitHub API middleware:', error);
      });
    },
    passThroughOnException() { /* noop stub for dev */ },
    next: async () => new Response('Not implemented', { status: 501 }),
  };
}

async function writeResponse(response: Response, res: ServerResponse): Promise<void> {
  res.statusCode = response.status;

  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  const body = Buffer.from(await response.arrayBuffer());
  res.end(body);
}

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

let routeHandlersPromise: Promise<Record<string, GitHubRouteHandler>> | null = null;

async function getRouteHandlers(
  server: ViteDevServer
): Promise<Record<string, GitHubRouteHandler>> {
  routeHandlersPromise ??= server.ssrLoadModule('/src/server/github-app.ts').then(
    ({ handleGitHubAppInstall, handleGitHubAppSetup, handleGitHubWebhook }) => ({
      '/api/github/install': handleGitHubAppInstall,
      '/api/github/setup': async (context, _env) => handleGitHubAppSetup(context),
      '/api/github/webhook': handleGitHubWebhook,
    })
  );

  return routeHandlersPromise;
}

/**
 * Vite plugin that handles the Cloudflare Pages GitHub API routes during local dev.
 */
export function githubApiDevContext(rawEnv: Record<string, string>): Plugin {
  const env = getDevEnv(rawEnv);

  return {
    name: 'github-api-dev-context',
    apply: 'serve',
    configureServer(server) {
      return () => {
        server.middlewares.use(async (req, res, next) => {
          const url = req.originalUrl || req.url;
          const pathname = url
            ? normalizePathname(new URL(url, 'http://localhost').pathname)
            : null;
          const routeHandlers = pathname ? await getRouteHandlers(server) : null;
          const handler = pathname && routeHandlers ? routeHandlers[pathname] : undefined;

          if (!handler) {
            return next();
          }

          try {
            const request = await toRequest(req);
            const context = createContext(request, env);
            const response = await handler(context, env);
            await writeResponse(response, res);
          } catch (error) {
            next(error as Error);
          }
        });
      };
    },
  };
}
