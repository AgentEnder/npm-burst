/**
 * Card → PNG, via Satori (JSX → SVG) and resvg (SVG → PNG).
 *
 * Both wasm modules are injected rather than imported. The Worker entry
 * imports them as compiled `WebAssembly.Module`s, and Node scripts read the
 * bytes off disk, so the same code runs in both. `satori/standalone` is the
 * bring-your-own-yoga build; the default entry fetches its wasm at runtime,
 * which a Worker cannot do.
 */

import { Resvg, initWasm } from '@resvg/resvg-wasm';
import satori, { init as initSatoriWasm } from 'satori/standalone';

import type { ReactElement } from 'react';

import {
  BreakdownCardView,
  CARD_MONO_FONT,
  CARD_SANS_FONT,
  SiteCardView,
  type SiteCard,
} from './card';
import { CARD_HEIGHT, CARD_WIDTH } from './card-url';
import type { BreakdownCard } from './card-model';

/**
 * Google picks the font format from the User-Agent, and Satori reads
 * TTF/OTF/WOFF but not WOFF2. A pre-WOFF2 Safari gets WOFF.
 */
const LEGACY_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/534.30 (KHTML, like Gecko) Version/5.1 Safari/534.30';

/**
 * Package names are lowercase ASCII, so printable ASCII plus the two
 * separators the card draws covers every card. A fixed subset also means the
 * font fetch URLs never vary, so Cloudflare's fetch cache serves them warm.
 */
const CARD_CHARSET =
  Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('') +
  '·…';

const CARD_FONTS = [
  { name: CARD_SANS_FONT, weight: 400 },
  { name: CARD_SANS_FONT, weight: 600 },
  { name: CARD_SANS_FONT, weight: 700 },
  { name: CARD_MONO_FONT, weight: 400 },
  { name: CARD_MONO_FONT, weight: 500 },
] as const;

/** The font CDN could not be reached. The request must fail, not degrade. */
export class FontSourceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FontSourceUnavailableError';
  }
}

export type WasmInput = WebAssembly.Module | ArrayBuffer | Uint8Array;

let resvgReady: Promise<void> | undefined;
let satoriReady: Promise<void> | undefined;

/**
 * Run `start` once per isolate, but forget a failure so the next request can
 * retry. A cached rejection would wedge the isolate for good.
 */
function initOnce(
  read: () => Promise<void> | undefined,
  write: (p: Promise<void> | undefined) => void,
  start: () => Promise<void>
): Promise<void> {
  const existing = read();
  if (existing) return existing;

  const pending = start().catch((err: unknown) => {
    // resvg throws this when the module is already live, which is success.
    if (err instanceof Error && err.message.includes('Already initialized')) {
      return;
    }
    write(undefined);
    throw err;
  });
  write(pending);
  return pending;
}

export function initResvg(wasm: WasmInput): Promise<void> {
  return initOnce(
    () => resvgReady,
    (p) => (resvgReady = p),
    () => initWasm(wasm as WebAssembly.Module)
  );
}

export function initSatori(wasm: WasmInput): Promise<void> {
  return initOnce(
    () => satoriReady,
    (p) => (satoriReady = p),
    () => initSatoriWasm(wasm as WebAssembly.Module)
  );
}

async function fetchFont(family: string, weight: number): Promise<ArrayBuffer> {
  const params = new URLSearchParams({
    family: `${family}:wght@${weight}`,
    text: CARD_CHARSET,
  });
  const headers = { 'User-Agent': LEGACY_UA };

  const cssRes = await fetch(`https://fonts.googleapis.com/css2?${params}`, {
    headers,
  });
  if (!cssRes.ok) {
    throw new FontSourceUnavailableError(
      `Google Fonts CSS for ${family} ${weight} returned ${cssRes.status}`
    );
  }

  const match = (await cssRes.text()).match(
    /src:\s*url\(([^)]+)\)\s*format\('(woff|truetype|opentype)'\)/
  );
  if (!match) {
    throw new FontSourceUnavailableError(
      `No WOFF/TTF source for ${family} ${weight}`
    );
  }

  const fontRes = await fetch(match[1], { headers });
  if (!fontRes.ok) {
    throw new FontSourceUnavailableError(
      `Font file for ${family} ${weight} returned ${fontRes.status}`
    );
  }
  return fontRes.arrayBuffer();
}

async function renderSvg(element: ReactElement): Promise<string> {
  const fonts = await Promise.all(
    CARD_FONTS.map(async ({ name, weight }) => ({
      name,
      weight,
      style: 'normal' as const,
      data: await fetchFont(name, weight),
    }))
  );

  // Satori bundles its own React types, which do not structurally match
  // React 19's. The runtime element is the same object.
  return satori(element as Parameters<typeof satori>[0], {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts,
  });
}

/** `initSatori` and `initResvg` must have resolved first. */
async function renderPng(
  element: ReactElement
): Promise<Uint8Array<ArrayBuffer>> {
  const svg = await renderSvg(element);
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: CARD_WIDTH } });
  // A fresh copy out of wasm memory, so it is backed by a plain ArrayBuffer.
  return resvg.render().asPng() as Uint8Array<ArrayBuffer>;
}

export function renderBreakdownCard(
  card: BreakdownCard
): Promise<Uint8Array<ArrayBuffer>> {
  return renderPng(BreakdownCardView({ card }));
}

export function renderSiteCard(
  card: SiteCard
): Promise<Uint8Array<ArrayBuffer>> {
  return renderPng(SiteCardView({ card }));
}
