/**
 * Compresses existing JSON TEXT columns in D1 to gzip BLOBs.
 *
 * Handles three cases:
 * 1. Original uncompressed JSON text (e.g. '{"key":...}') — compress and store as BLOB
 * 2. Malformed data from prior run — text like '[31,139,8,0,...]' where compressed
 *    bytes were stored as a JSON number array string — decode back to bytes, store as BLOB
 * 3. Already-compressed BLOB — skip
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

async function gzipCompress(text: string): Promise<Uint8Array> {
  const stream = new Blob([text])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gzipDecompress(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Detect if a text value is a malformed byte array from the prior run.
 * These look like: [31,139,8,0,0,0,0,0,0,3,...]
 * The first two values should be 31,139 (gzip magic bytes).
 */
function isMalformedByteArray(text: string): boolean {
  return text.startsWith('[31,139,');
}

/**
 * Recover original JSON from a malformed byte array string.
 * Parse the number array, reconstruct the gzip bytes, decompress.
 */
async function recoverFromMalformedByteArray(text: string): Promise<string> {
  const numbers = JSON.parse(text) as number[];
  const bytes = new Uint8Array(numbers);
  return gzipDecompress(bytes);
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
  const countResult = await d1Query(
    `SELECT COUNT(*) as cnt FROM "${tableName}" WHERE typeof("${jsonColumn}") = 'text'`
  );
  const count = Number(countResult.result?.[0]?.results?.[0]?.['cnt'] ?? 0);

  if (count === 0) {
    console.log(`  ${tableName}.${jsonColumn}: no text rows to process`);
    return;
  }

  console.log(`  ${tableName}.${jsonColumn}: ${count} text rows to process`);

  let compressed = 0;
  let fixed = 0;
  let skipped = 0;

  // Keep selecting rows with text type until none remain
  // (no offset needed since each successful update changes the row's type)
  while (true) {
    const selectResult = await d1Query(
      `SELECT "${idColumn}", "${jsonColumn}" FROM "${tableName}" WHERE typeof("${jsonColumn}") = 'text' LIMIT 50`
    );

    const rows = selectResult.result?.[0]?.results ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const id = row[idColumn] as number;
      const textValue = row[jsonColumn] as string;

      let jsonToCompress: string;

      if (isMalformedByteArray(textValue)) {
        // Case 2: malformed byte array from prior run — recover original JSON
        try {
          jsonToCompress = await recoverFromMalformedByteArray(textValue);
          fixed++;
        } catch (e) {
          console.log(
            `    SKIP row ${id}: failed to recover malformed data: ${e}`
          );
          skipped++;
          // Clear the malformed data by re-storing original (non-gzip) text
          // so it doesn't get re-selected forever
          continue;
        }
      } else {
        // Case 1: original uncompressed JSON
        jsonToCompress = textValue;
      }

      const compressedBytes = await gzipCompress(jsonToCompress);
      const originalSize = new TextEncoder().encode(jsonToCompress).length;
      const compressedSize = compressedBytes.length;
      const hex = toHex(compressedBytes);

      // D1 SQL statement limit is 100KB
      const sqlSize = hex.length + 100;
      if (sqlSize > 95_000) {
        console.log(
          `    SKIP row ${id}: compressed hex too large (${(
            sqlSize / 1024
          ).toFixed(0)}KB)`
        );
        skipped++;
        // Store the recovered (uncompressed) JSON back so it's valid
        // even if we can't compress it within the SQL limit
        if (isMalformedByteArray(textValue)) {
          await d1Query(
            `UPDATE "${tableName}" SET "${jsonColumn}" = ? WHERE "${idColumn}" = ?`,
            [jsonToCompress, id]
          );
          console.log(
            `    Row ${id}: restored original JSON (too large to compress via API)`
          );
        }
        continue;
      }

      await d1Query(
        `UPDATE "${tableName}" SET "${jsonColumn}" = X'${hex}' WHERE "${idColumn}" = ?`,
        [id]
      );

      compressed++;
      const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(0);
      const total = compressed + skipped;
      if (total % 10 === 0 || total === count) {
        console.log(
          `    ${total}/${count} (last: ${(originalSize / 1024).toFixed(
            0
          )}KB -> ${(compressedSize / 1024).toFixed(0)}KB, ${ratio}% reduction)`
        );
      }
    }
  }

  console.log(
    `  ✓ ${tableName}.${jsonColumn}: ${compressed} compressed, ${fixed} recovered from malformed, ${skipped} skipped`
  );
}

async function main() {
  console.log('Compressing JSON columns in D1...');
  console.log('');

  await compressTable('snapshots', 'id', 'downloads');
  console.log('');
  await compressTable('github_health_snapshots', 'id', 'raw_data');

  console.log('');
  console.log('Done.');
}

main().catch((err) => {
  console.error('Compression failed:', err);
  process.exit(1);
});
