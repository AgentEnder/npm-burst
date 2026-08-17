import { describe, expect, it } from 'vitest';
import {
  resolveHealthEmptyPlan,
  type HealthEmptyInput,
} from './health-empty-state-model';

function plan(overrides: Partial<HealthEmptyInput> = {}) {
  return resolveHealthEmptyPlan({
    appInstalled: false,
    signedIn: false,
    githubLinked: false,
    isMaintainer: false,
    ...overrides,
  });
}

describe('resolveHealthEmptyPlan', () => {
  it('offers nothing once the app is installed — it resolves itself', () => {
    const result = plan({ appInstalled: true, signedIn: true });
    expect(result.title).toBe('No snapshots yet');
    expect(result.tone).toBe('waiting');
    expect(result.primary).toBeNull();
    expect(result.secondary).toBeNull();
  });

  it('stays a waiting state even for a signed-in maintainer', () => {
    // Nothing is blocked, so it must not nag someone who could act.
    const result = plan({
      appInstalled: true,
      signedIn: true,
      githubLinked: true,
      isMaintainer: true,
    });
    expect(result.primary).toBeNull();
  });

  it('offers only sign-in when signed out', () => {
    const result = plan();
    expect(result.primary).toBe('signIn');
    expect(result.secondary).toBeNull();
  });

  describe('signed in, not a maintainer', () => {
    it('leads with connecting GitHub when it is not linked', () => {
      const result = plan({ signedIn: true, githubLinked: false });
      expect(result.primary).toBe('connectGitHub');
      expect(result.secondary).toBe('install');
    });

    it('leads with the snapshot once GitHub is linked', () => {
      const result = plan({ signedIn: true, githubLinked: true });
      expect(result.primary).toBe('snapshot');
      expect(result.secondary).toBe('install');
    });

    it('describes those two cases differently, not just the button', () => {
      const unlinked = plan({ signedIn: true, githubLinked: false });
      const linked = plan({ signedIn: true, githubLinked: true });
      expect(unlinked.body).not.toBe(linked.body);
    });
  });

  describe('signed in maintainer', () => {
    it('leads with install and demotes the snapshot', () => {
      const result = plan({
        signedIn: true,
        githubLinked: true,
        isMaintainer: true,
      });
      expect(result.primary).toBe('install');
      expect(result.secondary).toBe('snapshot');
    });

    it('can still install without GitHub linked, offering to connect', () => {
      // Installing is a GitHub-side flow and needs no OAuth token from us.
      const result = plan({
        signedIn: true,
        githubLinked: false,
        isMaintainer: true,
      });
      expect(result.primary).toBe('install');
      expect(result.secondary).toBe('connectGitHub');
    });
  });

  it('never offers a snapshot without a linked GitHub account', () => {
    for (const isMaintainer of [false, true]) {
      const result = plan({
        signedIn: true,
        githubLinked: false,
        isMaintainer,
      });
      expect([result.primary, result.secondary]).not.toContain('snapshot');
    }
  });

  it('never offers an action to a signed-out visitor beyond signing in', () => {
    for (const githubLinked of [false, true]) {
      for (const isMaintainer of [false, true]) {
        const result = plan({ signedIn: false, githubLinked, isMaintainer });
        expect(result.primary).toBe('signIn');
        expect(result.secondary).toBeNull();
      }
    }
  });
});
