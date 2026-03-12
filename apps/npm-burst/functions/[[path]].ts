/// <reference types="@cloudflare/workers-types" />
import { telefuncHandler } from '../src/server/telefunc-handler';

export const onRequest: PagesFunction<Record<string, string>> = async (context) => {
  const { request } = context;

  // Only handle telefunc requests
  const pathname = new URL(request.url).pathname;
  if (pathname === '/_telefunc' || pathname === '/npm-burst/_telefunc') {
    return telefuncHandler(context);
  }

  // Let Cloudflare Pages handle static assets
  return context.next();
};
