import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const WORKSPACE_ROOT = resolve(__dirname, '..');
const APP_DIR = resolve(WORKSPACE_ROOT, 'apps/npm-burst');
const WRANGLER_TOML = resolve(APP_DIR, 'wrangler.toml');

function parseRequiredSecrets(tomlPath: string): string[] {
  const text = readFileSync(tomlPath, 'utf8');
  const block = text.match(/\[secrets\][\s\S]*?required\s*=\s*\[([\s\S]*?)\]/);
  if (!block) {
    throw new Error(
      `No [[secrets]] required = [ ... ] block found in ${tomlPath}`
    );
  }
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

const dryRun = process.argv.includes('--dry-run');
const required = parseRequiredSecrets(WRANGLER_TOML);

const payload: Record<string, string> = {};
const missing: string[] = [];

for (const name of required) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    missing.push(name);
    continue;
  }
  payload[name] = value;
}

if (missing.length) {
  console.error(
    `Missing values in .env.local for: ${missing.join(', ')}\n` +
      `Add them to apps/npm-burst/.env.local and re-run.`
  );
  process.exit(1);
}

console.log(`Pushing ${required.length} secrets to npm-burst:`);
for (const name of required) console.log(`  - ${name}`);

if (dryRun) {
  console.log('\n--dry-run set; not invoking wrangler.');
  process.exit(0);
}

const result = spawnSync(
  'pnpm',
  ['exec', 'wrangler', 'secret', 'bulk', '--config', WRANGLER_TOML],
  {
    cwd: WORKSPACE_ROOT,
    input: JSON.stringify(payload),
    stdio: ['pipe', 'inherit', 'inherit'],
  }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
