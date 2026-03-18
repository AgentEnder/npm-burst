import { createClerkClient } from '@clerk/backend';
import type { Env } from './env';
import { isDevMode } from './env';

function getClerkClient(env: Env) {
  return createClerkClient({ secretKey: env.CLERK_SECRET_KEY! });
}

export async function getUserEmails(
  userId: string,
  env: Env
): Promise<string[]> {
  if (isDevMode(env)) {
    return ['dev@example.com'];
  }

  const clerk = getClerkClient(env);
  const user = await clerk.users.getUser(userId);
  return user.emailAddresses.map((e) => e.emailAddress);
}

export interface GitHubOauthAccess {
  token: string;
  scopes: string[];
}

export async function getUserGitHubOauthAccess(
  userId: string,
  env: Env
): Promise<GitHubOauthAccess | null> {
  if (isDevMode(env)) {
    return {
      token: 'dev-github-oauth-token',
      scopes: ['public_repo'],
    };
  }

  const clerk = getClerkClient(env);
  const tokens = await clerk.users.getUserOauthAccessToken(userId, 'github');
  const freshest = [...tokens.data]
    .sort((a, b) => (b.expiresAt ?? Number.MAX_SAFE_INTEGER) - (a.expiresAt ?? Number.MAX_SAFE_INTEGER))
    .find((token) => !!token.token);

  if (!freshest?.token) {
    return null;
  }

  return {
    token: freshest.token,
    scopes: freshest.scopes ?? [],
  };
}

export async function hasUserGitHubOauthAccess(
  userId: string,
  env: Env
): Promise<boolean> {
  return (await getUserGitHubOauthAccess(userId, env)) !== null;
}
