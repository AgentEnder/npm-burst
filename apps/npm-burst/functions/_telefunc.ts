/// <reference types="@cloudflare/workers-types" />
import { telefuncHandler } from '../src/server/telefunc-handler';

export const onRequest: PagesFunction<Record<string, string>> = async (
  context
) => telefuncHandler(context);
