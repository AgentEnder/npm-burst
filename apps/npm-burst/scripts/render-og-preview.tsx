/**
 * Render breakdown cards from live npm data, so the design can be looked at.
 *
 *   nx run npm-burst:og:preview --args="nx '?selectedVersion=v21'"
 *
 * Arguments come in pairs of package name and query string. The query string
 * is read exactly as the card route reads it, so it accepts what a shared page
 * URL carries. Cards land in `tmp/og-preview/` at the repo root.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CHART_RADIUS } from '../src/og/card';
import { buildBreakdownCard } from '../src/og/card-model';
import { breakdownViewFromSearch } from '../src/og/card-url';
import { initResvg, initSatori, renderBreakdownCard } from '../src/og/render';

const require = createRequire(import.meta.url);
const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'tmp',
  'og-preview'
);

async function fetchDownloads(pkg: string): Promise<Record<string, number>> {
  const res = await fetch(
    `https://api.npmjs.org/versions/${encodeURIComponent(pkg)}/last-week`
  );
  if (!res.ok) throw new Error(`npm returned ${res.status} for ${pkg}`);
  return ((await res.json()) as { downloads: Record<string, number> })
    .downloads;
}

const args = process.argv.slice(2);
if (args.length === 0 || args.length % 2 !== 0) {
  console.error(
    'usage: render-og-preview <package> <query> [<package> <query> ...]'
  );
  process.exit(1);
}

await initSatori(readFileSync(require.resolve('satori/yoga.wasm')));
await initResvg(
  readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm'))
);
mkdirSync(OUT_DIR, { recursive: true });

for (let i = 0; i < args.length; i += 2) {
  const [pkg, query] = [args[i], args[i + 1]];
  const card = buildBreakdownCard(
    pkg,
    await fetchDownloads(pkg),
    breakdownViewFromSearch(query),
    CHART_RADIUS
  );
  if (!card) {
    console.log(`${pkg}: no downloads, skipped`);
    continue;
  }

  const started = Date.now();
  const png = await renderBreakdownCard(card);
  const file = join(
    OUT_DIR,
    `${pkg.replace(/[@/]/g, '_')}${query.replace(/[^a-z0-9]+/gi, '_')}.png`
  );
  writeFileSync(file, png);
  console.log(`${file}  ${png.byteLength}B  ${Date.now() - started}ms`);
}
