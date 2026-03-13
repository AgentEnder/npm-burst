import { createClerkClient } from '@clerk/backend';
import type { Env } from './env';
import { isDevMode } from './env';

export async function getUserEmails(
  userId: string,
  env: Env
): Promise<string[]> {
  if (isDevMode(env)) {
    return ['dev@example.com'];
  }

  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY! });
  const user = await clerk.users.getUser(userId);
  return user.emailAddresses.map((e) => e.emailAddress);
}
