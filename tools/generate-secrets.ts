import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const keysDir = resolve(process.cwd(), 'keys');
const force = process.argv.includes('--force');

const pemFlagIndex = process.argv.indexOf('--pem-file');
const pemPath = pemFlagIndex !== -1 ? process.argv[pemFlagIndex + 1] : null;

if (pemPath && !existsSync(pemPath)) {
  console.error(`PEM file not found: ${pemPath}`);
  process.exit(1);
}

const files = [
  resolve(keysDir, 'npm-burst.env'),
  resolve(keysDir, 'cronjob.env'),
  resolve(keysDir, 'cloudflare.env'),
];

if (!force && files.some((f) => existsSync(f))) {
  console.error(
    'Secret files already exist in ./keys/. Re-run with --force to overwrite.'
  );
  process.exit(1);
}

mkdirSync(keysDir, { recursive: true });

const encryptionKey = randomBytes(32).toString('hex');
const webhookSecret = randomBytes(32).toString('hex');
const internalApiSecret = randomBytes(32).toString('hex');

// Inline the PEM as a single-line string with literal \n for env var use
const privateKeyLine = pemPath
  ? `GITHUB_APP_PRIVATE_KEY="${readFileSync(pemPath, 'utf8')
      .trim()
      .replace(/\n/g, '\\n')}"\n`
  : '';

// apps/npm-burst/.env.local
writeFileSync(
  files[0],
  `# Copy into apps/npm-burst/.env.local
ENCRYPTION_KEY=${encryptionKey}
GITHUB_WEBHOOK_SECRET=${webhookSecret}
${privateKeyLine}`,
  'utf8'
);

// apps/cronjob/.dev.vars
writeFileSync(
  files[1],
  `# Copy into apps/cronjob/.dev.vars
ENCRYPTION_KEY=${encryptionKey}
INTERNAL_API_SECRET=${internalApiSecret}
${privateKeyLine}`,
  'utf8'
);

// Cloudflare deployed environments (all secrets)
writeFileSync(
  files[2],
  `# Set as Cloudflare secrets for deployed environments
ENCRYPTION_KEY=${encryptionKey}
GITHUB_WEBHOOK_SECRET=${webhookSecret}
INTERNAL_API_SECRET=${internalApiSecret}
${privateKeyLine}`,
  'utf8'
);

console.log('Wrote secrets to:');
console.log('  keys/npm-burst.env   → copy into apps/npm-burst/.env.local');
console.log('  keys/cronjob.env     → copy into apps/cronjob/.dev.vars');
console.log('  keys/cloudflare.env  → set as Cloudflare secrets');
if (privateKeyLine) {
  console.log('  (includes GITHUB_APP_PRIVATE_KEY from PEM file)');
} else {
  console.log(
    '  Tip: pass --pem-file <path> to include GITHUB_APP_PRIVATE_KEY'
  );
}
