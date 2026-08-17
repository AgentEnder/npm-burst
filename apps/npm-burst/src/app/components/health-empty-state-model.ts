/**
 * What the health tab should offer when there is nothing to show.
 *
 * Auth here is two independent axes — signed in, and GitHub *linked* — and
 * maintainer status is a third. Resolving them in nested ternaries inside the
 * component let the "signed in but GitHub not linked" case collapse into the
 * "GitHub linked" one, differing only in a button label. Keeping it as a pure
 * function makes the whole matrix explicit and testable.
 */

export type HealthEmptyAction =
  | 'signIn'
  | 'connectGitHub'
  | 'snapshot'
  | 'install';

export interface HealthEmptyInput {
  /** Whether the GitHub App is installed for the repo owner. */
  appInstalled: boolean;
  signedIn: boolean;
  /** Whether the signed-in user has a usable GitHub OAuth token. */
  githubLinked: boolean;
  /** npm maintainer heuristic; only meaningful when signed in. */
  isMaintainer: boolean;
}

export interface HealthEmptyPlan {
  title: string;
  /** `waiting` = it will resolve itself; `blocked` = someone must act. */
  tone: 'waiting' | 'blocked';
  body: string;
  primary: HealthEmptyAction | null;
  secondary: HealthEmptyAction | null;
}

export function resolveHealthEmptyPlan(
  input: HealthEmptyInput
): HealthEmptyPlan {
  const { appInstalled, signedIn, githubLinked, isMaintainer } = input;

  // The App is already installed — nothing to ask of anyone, the daily job
  // will fill this in. Offering actions here would imply something is wrong.
  if (appInstalled) {
    return {
      title: 'No snapshots yet',
      tone: 'waiting',
      body: 'The GitHub App is installed — this report fills in once the daily snapshot job captures the repo.',
      primary: null,
      secondary: null,
    };
  }

  if (!signedIn) {
    return {
      title: 'No health data yet',
      tone: 'blocked',
      body: 'Sign in to turn on daily tracking, or to pull a one-off snapshot yourself.',
      primary: 'signIn',
      secondary: null,
    };
  }

  // Maintainers lead with the durable fix. Installing the App is a GitHub-side
  // flow, so it does not require our OAuth token — a maintainer who has not
  // linked GitHub can still install.
  if (isMaintainer) {
    return {
      title: 'No health data yet',
      tone: 'blocked',
      body: 'You maintain this package. Install the GitHub App to track it daily, automatically.',
      primary: 'install',
      secondary: githubLinked ? 'snapshot' : 'connectGitHub',
    };
  }

  // Signed in, not a maintainer, GitHub not linked: the snapshot needs a token
  // first, so connecting is the real next step rather than a relabelled button.
  if (!githubLinked) {
    return {
      title: 'No health data yet',
      tone: 'blocked',
      body: 'Connect your GitHub account to pull a one-off snapshot. Daily tracking needs a maintainer to install the app.',
      primary: 'connectGitHub',
      secondary: 'install',
    };
  }

  return {
    title: 'No health data yet',
    tone: 'blocked',
    body: 'Pull a snapshot now with your own GitHub access. Daily tracking needs a maintainer to install the app.',
    primary: 'snapshot',
    secondary: 'install',
  };
}
