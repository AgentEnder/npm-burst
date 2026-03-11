import { telefuncHandler } from '../src/server/telefunc-handler';

export const onRequest: PagesFunction = async (context) => {
  const { request } = context;

  // Only handle telefunc requests
  if (new URL(request.url).pathname === '/_telefunc') {
    return telefuncHandler(context);
  }

  // Let Cloudflare Pages handle static assets
  return context.next();
};
