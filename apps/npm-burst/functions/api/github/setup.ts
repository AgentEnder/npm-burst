/// <reference types="@cloudflare/workers-types" />
import { handleGitHubAppSetup } from '../../../src/server/github-app';

export const onRequest: PagesFunction<Record<string, string>> = async (
  context
) => handleGitHubAppSetup(context);
