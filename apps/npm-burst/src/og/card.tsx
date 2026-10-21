/**
 * The social cards, as Satori JSX.
 *
 * Satori supports a flexbox subset only. Every element with more than one
 * child needs `display: flex`, and there are no class names or CSS variables,
 * so the dark theme's values are inlined from `styles.scss`.
 */

import { formatDownloads } from '../app/utils/package-seo';
import { buildPackagePath } from '../app/utils/package-route';
import { CARD_BACKGROUND, type BreakdownCard } from './card-model';
import { CARD_HEIGHT, CARD_WIDTH } from './card-url';

export const CHART_RADIUS = 245;

export const CARD_SANS_FONT = 'Archivo';
export const CARD_MONO_FONT = 'IBM Plex Mono';

const TEXT_PRIMARY = '#e6edf3';
const TEXT_SECONDARY = '#7d8590';
const TEXT_TERTIARY = '#6e7681';
const BORDER = '#30363d';
const BRAND = '#cb3837';

const NAME_WIDTH = 540;

/** Shrink long names to one line, down to a floor where they may wrap. */
function nameFontSize(name: string): number {
  return Math.round(
    Math.max(40, Math.min(76, NAME_WIDTH / (name.length * 0.56)))
  );
}

function percent(share: number): string {
  const value = share * 100;
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}%`;
}

function BrandMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill={BRAND}>
      <path d="M15.48 1.01A15.0 15.0 0 0 1 24.39 28.44L20.25 22.30A7.6 7.6 0 0 0 15.73 8.40Z" />
      <path d="M19.31 27.54A12.0 12.0 0 0 1 4.12 17.67L8.47 17.06A7.6 7.6 0 0 0 18.09 23.31Z" />
      <path d="M4.18 13.92A12.0 12.0 0 0 1 11.50 4.87L13.15 8.95A7.6 7.6 0 0 0 8.52 14.68Z" />
    </svg>
  );
}

/** Drill root and version filter, the view state worth stating in words. */
function viewLine(card: BreakdownCard): string | null {
  const parts: string[] = [];
  if (card.drillRoot) {
    parts.push(
      `${card.drillRoot.name} · ${percent(card.drillRoot.share)} of downloads`
    );
  }
  if (card.versionFilter) parts.push(`filter ${card.versionFilter}`);
  return parts.length > 0 ? parts.join('  ·  ') : null;
}

export function BreakdownCardView({ card }: { card: BreakdownCard }) {
  const size = card.radius * 2;
  const view = viewLine(card);

  return (
    <div
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        display: 'flex',
        background: CARD_BACKGROUND,
        color: TEXT_PRIMARY,
        fontFamily: CARD_SANS_FONT,
        padding: '52px 56px 52px 64px',
      }}
    >
      <div
        style={{
          width: NAME_WIDTH,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <BrandMark size={36} />
          <div style={{ fontSize: 28, fontWeight: 600 }}>Npm Burst</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              fontSize: nameFontSize(card.packageName),
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -1,
            }}
          >
            {card.packageName}
          </div>
          <div
            style={{
              fontFamily: CARD_MONO_FONT,
              fontSize: 22,
              color: TEXT_SECONDARY,
            }}
          >
            {`${formatDownloads(card.totalDownloads)} weekly downloads · ${
              card.versionCount
            } versions`}
          </div>
          {view ? (
            <div
              style={{
                fontFamily: CARD_MONO_FONT,
                fontSize: 22,
                color: TEXT_PRIMARY,
              }}
            >
              {view}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            borderTop: `1px solid ${BORDER}`,
            paddingTop: 22,
          }}
        >
          {card.legend.map((entry) => (
            <div
              key={entry.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                fontFamily: CARD_MONO_FONT,
                fontSize: 22,
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  background: entry.color,
                  marginRight: 14,
                }}
              />
              <div style={{ flexGrow: 1 }}>{entry.name}</div>
              <div style={{ color: TEXT_SECONDARY }}>
                {percent(entry.share)}
              </div>
            </div>
          ))}
          {card.legendOverflow > 0 ? (
            <div
              style={{
                fontFamily: CARD_MONO_FONT,
                fontSize: 18,
                color: TEXT_TERTIARY,
              }}
            >
              {`+${card.legendOverflow} more`}
            </div>
          ) : null}
        </div>

        <div
          style={{
            fontFamily: CARD_MONO_FONT,
            fontSize: 18,
            color: TEXT_TERTIARY,
          }}
        >
          {`npm-burst.com${buildPackagePath(card.packageName)}`}
        </div>
      </div>

      <div
        style={{
          flexGrow: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: size,
            height: size,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            width={size}
            height={size}
            viewBox={`${-card.radius} ${-card.radius} ${size} ${size}`}
            style={{ position: 'absolute', top: 0, left: 0 }}
          >
            {card.arcs.map((a) => (
              <path
                key={a.key}
                d={a.path}
                fill={a.fill}
                stroke={CARD_BACKGROUND}
                strokeWidth={1.5}
              />
            ))}
          </svg>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              fontFamily: CARD_MONO_FONT,
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 500 }}>
              {card.drillRoot ? card.drillRoot.name : 'All versions'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface SiteCard {
  title: string;
  subtitle: string;
  /** Path shown in the footer. */
  path: string;
}

/**
 * The card for the landing page, and for packages with no snapshot to chart.
 * The brand mark takes the chart's place.
 */
export function SiteCardView({ card }: { card: SiteCard }) {
  return (
    <div
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        display: 'flex',
        background: CARD_BACKGROUND,
        color: TEXT_PRIMARY,
        fontFamily: CARD_SANS_FONT,
        padding: '52px 56px 52px 64px',
      }}
    >
      <div
        style={{
          width: NAME_WIDTH,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <BrandMark size={36} />
          <div style={{ fontSize: 28, fontWeight: 600 }}>Npm Burst</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div
            style={{
              fontSize: nameFontSize(card.title),
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -1,
            }}
          >
            {card.title}
          </div>
          <div
            style={{ fontSize: 28, lineHeight: 1.35, color: TEXT_SECONDARY }}
          >
            {card.subtitle}
          </div>
        </div>

        <div
          style={{
            fontFamily: CARD_MONO_FONT,
            fontSize: 18,
            color: TEXT_TERTIARY,
          }}
        >
          {`npm-burst.com${card.path}`}
        </div>
      </div>

      <div
        style={{
          flexGrow: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        <BrandMark size={CHART_RADIUS * 2} />
      </div>
    </div>
  );
}
