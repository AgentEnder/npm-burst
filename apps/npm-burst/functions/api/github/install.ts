/// <reference types="@cloudflare/workers-types" />
import { parseEnv } from '../../../src/server/env';
import { handleGitHubAppInstall } from '../../../src/server/github-app';

export const onRequest: PagesFunction<Record<string, string>> = async (
  context
) => handleGitHubAppInstall(context, parseEnv(context.env));
