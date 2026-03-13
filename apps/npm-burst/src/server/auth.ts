import { verifyToken } from '@clerk/backend';
import type { Env } from './env';
import { isDevMode } from './env';

export async function getAuthUserId(
  request: Request,
  env: Env
): Promise<string | null> {
  if (isDevMode(env)) {
    return 'dev-user';
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY!,
    });
    return payload.sub;
  } catch {
    return null;
  }
}
