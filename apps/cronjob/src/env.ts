import { z } from 'zod';

const envStringSchema = z.object({
  ENCRYPTION_KEY: z.string().optional(),
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  INTERNAL_API_SECRET: z.string().optional(),
  WORKER_SELF_URL: z.string().optional(),
});

type EnvStrings = z.infer<typeof envStringSchema>;

export type Env = EnvStrings & { DB: D1Database };

export function parseEnv(raw: unknown): Env {
  const env = raw as Record<string, unknown>;
  const strings = envStringSchema.parse(env);
  if (!env['DB']) {
    throw new Error('DB binding is required');
  }
  return { ...strings, DB: env['DB'] as D1Database };
}
