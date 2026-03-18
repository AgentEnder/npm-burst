export interface ResolvedGitHubRepo {
  owner: string;
  name: string;
}

function normalizeRepoPath(pathname: string): string[] {
  return pathname
    .replace(/\.git$/, '')
    .split('/')
    .filter(Boolean);
}

export function parseGitHubRepositoryUrl(
  repository: unknown
): ResolvedGitHubRepo | null {
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

  const shorthandMatch = rawUrl.match(
    /^(?:git\+)?github:\/?\/?([^/]+)\/([^/#]+)$/
  );
  if (shorthandMatch) {
    return {
      owner: shorthandMatch[1],
      name: shorthandMatch[2].replace(/\.git$/, ''),
    };
  }

  let url: URL;
  try {
    const normalized = rawUrl.startsWith('git@github.com:')
      ? rawUrl.replace('git@github.com:', 'https://github.com/')
      : rawUrl.replace(/^git\+/, '');
    url = new URL(normalized);
  } catch {
    return null;
  }

  if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') {
    return null;
  }

  const [owner, name] = normalizeRepoPath(url.pathname);
  if (!owner || !name) return null;
  return { owner, name };
}
