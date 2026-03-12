import type { Plugin } from 'vite';
import type { IncomingMessage } from 'node:http';
import { telefunc } from 'telefunc';
import type { Env } from './env';

const devEnv: Env = {
  DEV_MODE: 'true' as const,
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

/**
 * Vite plugin that handles telefunc requests during local dev.
 * Telefunc's built-in dev middleware only matches exact `/_telefunc`,
 * but Vite's base path makes the client post to `/npm-burst/_telefunc`.
 * This plugin intercepts the base-prefixed URL, provides dev context,
 * and calls telefunc directly — passing context inline just like the
 * production Cloudflare handler does.
 */
export function telefuncDevContext(): Plugin {
  return {
    name: 'telefunc-dev-context',
    apply: 'serve',
    configureServer(server) {
      return () => {
        server.middlewares.use(async (req, res, next) => {
          const url = req.originalUrl || req.url;
          if (!url?.endsWith('/_telefunc')) {
            return next();
          }

          const body = await readBody(req);
          const httpResponse = await telefunc({
            url: '/_telefunc',
            method: req.method ?? 'POST',
            body,
            context: {
              env: devEnv,
              userId: 'dev-user',
              request: new Request('http://localhost/_telefunc', {
                method: req.method,
                headers: req.headers as Record<string, string>,
              }),
            },
          });

          res.setHeader('Content-Type', httpResponse.contentType);
          res.statusCode = httpResponse.statusCode;
          res.end(httpResponse.body);
        });
      };
    },
  };
}
