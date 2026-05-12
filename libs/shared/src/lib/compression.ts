/**
 * Gzip compression utilities for large JSON columns.
 *
 * Uses the Web Standard CompressionStream/DecompressionStream APIs,
 * available in both Cloudflare Workers and Node.js 18+.
 *
 * The read path handles these data shapes (ordered by priority):
 *   1. null / undefined → null
 *   2. string → JSON.parse (legacy uncompressed text)
 *   3. string "[31,139,…]" → malformed byte-array text from old compress tool
 *   4. number[] → byte-array (old compress tool stored Array.from(Uint8Array))
 *   5. Uint8Array / ArrayBuffer / ArrayBufferView → binary
 *   6. gzip binary (magic 0x1f 0x8b) → decompress then JSON.parse
 *   7. non-gzip binary → TextDecoder → JSON.parse (raw UTF-8 JSON bytes)
 */

export async function compressJson(value: unknown): Promise<Uint8Array> {
  const json = JSON.stringify(value);
  const stream = new Blob([json])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function isNumberArray(data: unknown): data is number[] {
  return Array.isArray(data) && data.length > 0 && typeof data[0] === 'number';
}

function toBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data))
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (isNumberArray(data)) return new Uint8Array(data);
  throw new Error(
    `Cannot convert ${typeof data} (${Object.prototype.toString.call(
      data
    )}) to bytes`
  );
}

export async function decompressJson<T = unknown>(
  data: unknown
): Promise<T | null> {
  if (data === null || data === undefined) return null;

  if (typeof data === 'string') {
    // Malformed byte-array string from old compress tool: "[31,139,8,0,…]"
    if (data.startsWith('[31,139,')) {
      const bytes = new Uint8Array(JSON.parse(data) as number[]);
      return decompressGzip<T>(bytes);
    }
    // Legacy uncompressed JSON text
    return JSON.parse(data) as T;
  }

  // number[] — old compress tool stored Array.from(Uint8Array)
  if (isNumberArray(data) && data[0] === 0x1f && data[1] === 0x8b) {
    return decompressGzip<T>(new Uint8Array(data));
  }

  let bytes: Uint8Array;
  try {
    bytes = toBytes(data);
  } catch {
    console.error(
      `[decompressJson] unexpected data type: ${typeof data}, constructor: ${
        (data as object)?.constructor?.name
      }, value preview: ${String(data).slice(0, 100)}`
    );
    return JSON.parse(String(data)) as T;
  }

  // Check gzip magic bytes (0x1f 0x8b)
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return decompressGzip<T>(bytes);
  }

  // Not gzip — raw UTF-8 JSON bytes
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text) as T;
}

async function decompressGzip<T>(bytes: Uint8Array): Promise<T> {
  try {
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(stream).text();
    return JSON.parse(text) as T;
  } catch (e) {
    // The BLOB looks like gzip (magic bytes match) but the stream is corrupt.
    // Try interpreting the raw bytes as UTF-8 JSON as a last resort.
    const text = new TextDecoder().decode(bytes);
    try {
      return JSON.parse(text) as T;
    } catch {
      // Neither gzip nor valid UTF-8 JSON — surface the original error
      // with diagnostic info so we can identify the bad row.
      const preview = Array.from(bytes.slice(0, 20)).join(',');
      throw new Error(
        `Decompression failed (${
          bytes.length
        } bytes, first 20: [${preview}]): ${e instanceof Error ? e.message : e}`
      );
    }
  }
}
