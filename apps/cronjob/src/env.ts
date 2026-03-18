import { z } from 'zod';

const envSchema = z.object({
  TURSO_DATABASE_URL: z.string(),
  TURSO_AUTH_TOKEN: z.string(),
  ENCRYPTION_KEY: z.string().optional(),
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  INTERNAL_API_SECRET: z.string().optional(),
  WORKER_SELF_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: unknown): Env {
  return envSchema.parse(raw);
}
