import { execSync, ExecSyncOptions } from 'child_process';
import { join } from 'path';
import isCI from 'is-ci';

const cwd = join(__dirname, '../dist/npm-burst');
const stdio = 'inherit';

const opts: ExecSyncOptions = {
  cwd,
  stdio,
};

execSync('git init', opts);
try {
  if (isCI) {
    execSync(
      `git remote add origin https://github-actions:${process.env.GITHUB_TOKEN}@github.com/agentender/npm-burst`,
      opts
    );
  } else {
    execSync(
      'git remote add origin https://github.com/agentender/npm-burst',
      opts
    );
  }
} catch {
  // its ok
}
execSync('git add .', opts);
execSync('git commit -m "chore: deploy to gh-pages"', opts);
execSync('git checkout -B gh-pages', opts);
execSync('git push -fu origin HEAD', opts);
