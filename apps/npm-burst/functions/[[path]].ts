/// <reference types="@cloudflare/workers-types" />
import { telefuncHandler } from '../src/server/telefunc-handler';

export const onRequest: PagesFunction<Record<string, string>> = async (context) => {
  const { request } = context;

  // Only handle telefunc requests
  if (new URL(request.url).pathname === '/_telefunc') {
    return telefuncHandler(context);
  }

  // Let Cloudflare Pages handle static assets
  return context.next();
};
