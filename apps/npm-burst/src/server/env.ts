import { z } from 'zod';

const prodSchema = z.object({
  DEV_MODE: z.undefined().optional(),
  TURSO_DATABASE_URL: z.string(),
  TURSO_AUTH_TOKEN: z.string(),
  CLERK_SECRET_KEY: z.string(),
});

const devSchema = z.object({
  DEV_MODE: z.literal('true'),
  TURSO_DATABASE_URL: z.string().optional(),
  TURSO_AUTH_TOKEN: z.string().optional(),
  CLERK_SECRET_KEY: z.string().optional(),
});

export const envSchema = z.union([devSchema, prodSchema]);

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: unknown): Env {
  return envSchema.parse(raw);
}

export function isDevMode(env: Env): boolean {
  return env.DEV_MODE === 'true';
}
