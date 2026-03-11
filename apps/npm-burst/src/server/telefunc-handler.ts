/// <reference types="@cloudflare/workers-types" />
import { telefunc, config } from 'telefunc';
import { getAuthUserId } from './auth';

config.telefuncUrl = '/_telefunc';

export async function telefuncHandler(context: EventContext<Record<string, string>, string, unknown>) {
  const request = context.request;
  const env = (context as any).env;

  const userId = await getAuthUserId(request, env.CLERK_SECRET_KEY);

  const httpResponse = await telefunc({
    url: request.url,
    method: request.method,
    body: await request.text(),
    context: {
      env,
      userId,
    },
  });

  return new Response(httpResponse.body, {
    status: httpResponse.statusCode,
    headers: {
      'content-type': httpResponse.contentType,
    },
  });
}
