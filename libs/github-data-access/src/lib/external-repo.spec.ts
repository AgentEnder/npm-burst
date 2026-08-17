import { describe, expect, it } from 'vitest';
import { parseNonGitHubRepository } from './external-repo';

describe('parseNonGitHubRepository', () => {
  it('returns null for GitHub repositories', () => {
    expect(parseNonGitHubRepository('https://github.com/nrwl/nx')).toBeNull();
    expect(
      parseNonGitHubRepository({
        type: 'git',
        url: 'git+https://github.com/a/b.git',
      })
    ).toBeNull();
    expect(parseNonGitHubRepository('github:nrwl/nx')).toBeNull();
    expect(parseNonGitHubRepository('git@github.com:nrwl/nx.git')).toBeNull();
  });

  it('names the host for other providers', () => {
    expect(parseNonGitHubRepository('https://gitlab.com/group/proj')).toEqual({
      host: 'gitlab.com',
      url: 'https://gitlab.com/group/proj',
    });
    expect(
      parseNonGitHubRepository({
        type: 'git',
        url: 'git+https://bitbucket.org/a/b.git',
      })
    ).toEqual({ host: 'bitbucket.org', url: 'https://bitbucket.org/a/b' });
    expect(parseNonGitHubRepository('https://codeberg.org/a/b')).toEqual({
      host: 'codeberg.org',
      url: 'https://codeberg.org/a/b',
    });
  });

  it('normalizes git+ and ssh forms', () => {
    expect(
      parseNonGitHubRepository('git+ssh://git@gitlab.com/a/b.git')
    ).toEqual({
      host: 'gitlab.com',
      url: 'https://gitlab.com/a/b',
    });
    expect(parseNonGitHubRepository('git@gitlab.com:a/b.git')).toEqual({
      host: 'gitlab.com',
      url: 'https://gitlab.com/a/b',
    });
  });

  it('strips a www prefix so the host reads cleanly', () => {
    expect(parseNonGitHubRepository('https://www.gitlab.com/a/b')?.host).toBe(
      'gitlab.com'
    );
  });

  it('returns null when there is no repository at all', () => {
    expect(parseNonGitHubRepository(undefined)).toBeNull();
    expect(parseNonGitHubRepository(null)).toBeNull();
    expect(parseNonGitHubRepository({})).toBeNull();
    expect(parseNonGitHubRepository('')).toBeNull();
    expect(parseNonGitHubRepository('not a url')).toBeNull();
  });
});
