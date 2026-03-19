import { z } from 'zod';

const prodSchema = z.object({
  DEV_MODE: z.undefined().optional(),
  CLERK_SECRET_KEY: z.string(),
  ENCRYPTION_KEY: z.string(),
  GITHUB_APP_ID: z.string(),
  GITHUB_APP_SLUG: z.string(),
  GITHUB_APP_PRIVATE_KEY: z.string(),
  GITHUB_WEBHOOK_SECRET: z.string(),
});

const devSchema = z.object({
  DEV_MODE: z.literal('true'),
  DEV_GITHUB_PAT: z.string().optional(),
  CLERK_SECRET_KEY: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_SLUG: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
});

const envStringSchema = z.union([devSchema, prodSchema]);

type EnvStrings = z.infer<typeof envStringSchema>;

export type Env = EnvStrings & { DB?: D1Database };

export function parseEnv(raw: unknown): Env {
  const env = raw as Record<string, unknown>;
  const strings = envStringSchema.parse(env);
  const db = env['DB'] as D1Database | undefined;
  return { ...strings, DB: db };
}

export function isDevMode(env: Env): boolean {
  return env.DEV_MODE === 'true';
}

export function getDevGitHubPat(env: Env): string | undefined {
  return env.DEV_MODE === 'true' ? env.DEV_GITHUB_PAT : undefined;
}
