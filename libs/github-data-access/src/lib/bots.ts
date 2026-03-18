import type { BotPattern, GitHubActor } from './types';

export function isBotActor(
  actor: GitHubActor | null | undefined,
  patterns: BotPattern[]
): boolean {
  if (!actor) return true;
  if (actor.__typename === 'Bot') return true;

  const login = actor.login?.toLowerCase() ?? '';
  const email = actor.email?.toLowerCase() ?? '';

  return patterns.some((pattern) => {
    const value = pattern.pattern_value.toLowerCase();
    if (pattern.pattern_type === 'username') {
      return login === value;
    }
    if (pattern.pattern_type === 'username_suffix') {
      return login.endsWith(value);
    }
    return email === value;
  });
}
