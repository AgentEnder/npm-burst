export interface ExternalRepository {
  /** Hostname with any `www.` prefix stripped, e.g. `gitlab.com`. */
  host: string;
  /** Normalized https URL, safe to link to. */
  url: string;
}

/**
 * Recognise a repository that exists but is not on GitHub.
 *
 * `parseGitHubRepositoryUrl` returns null both for "no repository at all" and
 * for "a repository we can't read", which are very different things to tell
 * someone: one package has nothing to track, the other is on GitLab and never
 * will be trackable here. This distinguishes the second case.
 */
export function parseNonGitHubRepository(
  repository: unknown
): ExternalRepository | null {
  let rawUrl: string | null = null;

  if (typeof repository === 'string') {
    rawUrl = repository;
  } else if (
    repository &&
    typeof repository === 'object' &&
    'url' in repository &&
    typeof repository.url === 'string'
  ) {
    rawUrl = repository.url;
  }

  if (!rawUrl) return null;

  // `github:owner/name` shorthand has no host to parse, but is GitHub.
  if (/^(?:git\+)?github:/.test(rawUrl)) return null;

  const normalized = rawUrl
    .replace(/^git\+/, '')
    // scp-style `git@host:owner/name`
    .replace(/^(?:ssh:\/\/)?git@([^/:]+):/, 'https://$1/')
    .replace(/^ssh:\/\//, 'https://');

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return null;
  }

  if (!/^https?:$/.test(url.protocol)) return null;

  const host = url.hostname.replace(/^www\./, '');
  if (host === 'github.com') return null;

  const path = url.pathname.replace(/\.git$/, '').replace(/\/+$/, '');
  if (path === '' || path === '/') return null;

  return { host, url: `https://${host}${path}` };
}
