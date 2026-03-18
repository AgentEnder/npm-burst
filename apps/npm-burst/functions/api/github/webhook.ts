/// <reference types="@cloudflare/workers-types" />
import { parseEnv } from '../../../src/server/env';
import { handleGitHubWebhook } from '../../../src/server/github-app';

export const onRequest: PagesFunction<Record<string, string>> = async (
  context
) => handleGitHubWebhook(context, parseEnv(context.env));
