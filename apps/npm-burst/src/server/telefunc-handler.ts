/// <reference types="@cloudflare/workers-types" />
import { telefunc, config } from 'telefunc';

config.telefuncUrl = '/_telefunc';

export async function telefuncHandler(context: EventContext<Record<string, string>, string, unknown>) {
  const request = context.request;
  const httpResponse = await telefunc({
    url: request.url,
    method: request.method,
    body: await request.text(),
    context: {
      env: (context as any).env,
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
