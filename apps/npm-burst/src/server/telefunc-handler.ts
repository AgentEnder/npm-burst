/// <reference types="@cloudflare/workers-types" />
import { config, telefunc } from 'telefunc';
import { getAuthUserId } from './auth';
import { parseEnv } from './env';

config.telefuncUrl = '/_telefunc';

export async function telefuncHandler(
  context: EventContext<Record<string, string>, string, unknown>
) {
  const request = context.request;
  const env = parseEnv(context.env);

  const userId = await getAuthUserId(request, env);

  const httpResponse = await telefunc({
    request,
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
