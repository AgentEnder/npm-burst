/**
 * Compresses existing JSON TEXT columns in D1 to gzip BLOBs.
 *
 * Reads rows with uncompressed string data from snapshots.downloads
 * and github_health_snapshots.raw_data, compresses them, and updates
 * via the D1 REST API.
 *
 * Usage:
 *   pnpm exec tsx --env-file=apps/npm-burst/.env.local tools/compress-d1-json-columns.ts
 *
 * Required env vars:
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_API_TOKEN
 *   D1_DATABASE_ID (defaults to npm-burst-db)
 */

const cfAccountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
const cfApiToken = process.env['CLOUDFLARE_API_TOKEN'];
const d1DatabaseId =
  process.env['D1_DATABASE_ID'] ?? '273b28f0-f0e3-43e6-b7aa-1fd083c1ae6f';

if (!cfAccountId || !cfApiToken) {
  console.error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.');
  process.exit(1);
}

const D1_API_BASE = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/d1/database/${d1DatabaseId}`;

async function gzipCompress(text: string): Promise<number[]> {
  const stream = new Blob([text])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return Array.from(bytes);
}

interface D1QueryResult {
  success: boolean;
  errors?: unknown[];
  result?: { results?: Record<string, unknown>[] }[];
}

async function d1Query(
  sql: string,
  params?: unknown[]
): Promise<D1QueryResult> {
  const body = params ? { sql, params } : { sql };
  const res = await fetch(`${D1_API_BASE}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as D1QueryResult;
  if (!json.success) {
    throw new Error(`D1 query failed: ${JSON.stringify(json.errors)}`);
  }
  return json;
}

async function compressTable(
  tableName: string,
  idColumn: string,
  jsonColumn: string
): Promise<void> {
  // Get count of rows with string data (uncompressed rows start with '{' or '[')
  const countResult = await d1Query(
    `SELECT COUNT(*) as cnt FROM "${tableName}" WHERE typeof("${jsonColumn}") = 'text'`
  );
  const count = Number(countResult.result?.[0]?.results?.[0]?.['cnt'] ?? 0);

  if (count === 0) {
    console.log(
      `  ${tableName}.${jsonColumn}: already compressed (0 text rows)`
    );
    return;
  }

  console.log(`  ${tableName}.${jsonColumn}: ${count} rows to compress`);

  const PAGE_SIZE = 50;
  let compressed = 0;

  for (let offset = 0; offset < count; offset += PAGE_SIZE) {
    const selectResult = await d1Query(
      `SELECT "${idColumn}", "${jsonColumn}" FROM "${tableName}" WHERE typeof("${jsonColumn}") = 'text' LIMIT ${PAGE_SIZE}`
    );

    const rows = selectResult.result?.[0]?.results ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const id = row[idColumn] as number;
      const jsonText = row[jsonColumn] as string;

      const compressedBytes = await gzipCompress(jsonText);
      const originalSize = new TextEncoder().encode(jsonText).length;
      const compressedSize = compressedBytes.length;

      await d1Query(
        `UPDATE "${tableName}" SET "${jsonColumn}" = ? WHERE "${idColumn}" = ?`,
        [compressedBytes, id]
      );

      compressed++;
      const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(0);
      if (compressed % 10 === 0 || compressed === count) {
        console.log(
          `    ${compressed}/${count} (last row: ${originalSize} -> ${compressedSize} bytes, ${ratio}% reduction)`
        );
      }
    }
  }

  console.log(`  ✓ ${tableName}.${jsonColumn}: ${compressed} rows compressed`);
}

async function main() {
  console.log('Compressing JSON columns in D1...');

  await compressTable('snapshots', 'id', 'downloads');
  await compressTable('github_health_snapshots', 'id', 'raw_data');

  console.log('Done.');
}

main().catch((err) => {
  console.error('Compression failed:', err);
  process.exit(1);
});
