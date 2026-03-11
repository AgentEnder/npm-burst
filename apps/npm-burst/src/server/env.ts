import { z } from 'zod';

export const envSchema = z.object({
  TURSO_DATABASE_URL: z.string(),
  TURSO_AUTH_TOKEN: z.string(),
  CLERK_SECRET_KEY: z.string(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: unknown): Env {
  return envSchema.parse(raw);
}
