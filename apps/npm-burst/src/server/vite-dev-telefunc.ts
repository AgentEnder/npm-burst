import type { Plugin } from 'vite';
import type { IncomingMessage } from 'node:http';
import { telefunc } from 'telefunc';
import { parseEnv, type Env } from './env';

function getDevEnv(rawEnv: Record<string, string>): Env {
  return parseEnv({
    DEV_MODE: 'true',
    ...rawEnv,
  });
}

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
 * Telefunc's built-in dev middleware only matches exact `/_telefunc`.
 * This plugin intercepts that request, provides dev context, and calls
 * telefunc directly just like the production Cloudflare handler does.
 */
export function telefuncDevContext(rawEnv: Record<string, string>): Plugin {
  const env = getDevEnv(rawEnv);

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
              env,
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
