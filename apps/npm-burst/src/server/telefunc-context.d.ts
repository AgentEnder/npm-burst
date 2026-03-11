import type { Client } from '@libsql/client';

declare module 'telefunc' {
  namespace Telefunc {
    interface Context {
      env: {
        TURSO_DATABASE_URL: string;
        TURSO_AUTH_TOKEN: string;
        CLERK_SECRET_KEY: string;
      };
      userId: string | null;
      request: Request;
    }
  }
}
