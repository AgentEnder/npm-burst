import type { Env } from './env';

declare module 'telefunc' {
  namespace Telefunc {
    interface Context {
      env: Env;
      userId: string | null;
      request: Request;
    }
  }
}
