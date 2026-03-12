/// <reference types="@cloudflare/workers-types" />
import { telefunc, config } from 'telefunc';
import { getAuthUserId } from './auth';
import { parseEnv } from './env';

config.telefuncUrl = '/npm-burst/_telefunc';

export async function telefuncHandler(context: EventContext<Record<string, string>, string, unknown>) {
  const request = context.request;
  const env = parseEnv(context.env);

  const userId = await getAuthUserId(request, env);

  const httpResponse = await telefunc({
    url: request.url,
    method: request.method,
    body: await request.text(),
    context: {
      env,
      userId,
      request,
    },
  });

  return new Response(httpResponse.body, {
    status: httpResponse.statusCode,
    headers: {
      'content-type': httpResponse.contentType,
    },
  });
}
