import { describe, expect, it } from 'vitest';

import {
  breakdownViewFromSearch,
  buildCardPath,
  buildCardUrl,
  cardQuery,
  parseCardPath,
} from './card-url';

describe('buildCardPath / parseCardPath', () => {
  it.each(['nx', '@nx/devkit', 'lodash.merge', 'JSONStream'])(
    'round-trips %s',
    (name) => {
      expect(parseCardPath(buildCardPath(name))).toBe(name);
    }
  );

  it('keeps the scope separator literal', () => {
    expect(buildCardPath('@nx/devkit')).toBe('/og/package/@nx/devkit.png');
  });

  it.each([
    ['/og/package/nx', 'no extension'],
    ['/og/package/.png', 'empty name'],
    ['/og/package/@nx.png', 'bare scope'],
    ['/og/package/a/b/c.png', 'too many segments'],
    ['/og/package/nx/health.png', 'unscoped name with a slash'],
    ['/og/package/%3Cscript%3E.png', 'characters npm forbids'],
    ['/og/package/%E0%A4%A.png', 'malformed encoding'],
    ['/package/nx.png', 'wrong prefix'],
  ])('rejects %s (%s)', (path) => {
    expect(parseCardPath(path)).toBeNull();
  });

  it('rejects names longer than npm allows', () => {
    expect(parseCardPath(`/og/package/${'a'.repeat(215)}.png`)).toBeNull();
  });
});

describe('cardQuery', () => {
  it('keeps only the params the card draws, in table order', () => {
    expect(
      cardQuery('?selectedVersion=v21&window=1y&utm_source=x&sortBy=downloads')
    ).toBe('?sortBy=downloads&selectedVersion=v21');
  });

  it('drops defaults so equivalent views share a URL', () => {
    expect(cardQuery('?sortBy=version&lpf=2.00&table=1')).toBe('');
  });

  it('normalizes how a value is written', () => {
    expect(cardQuery('?lpf=5')).toBe('?lpf=5.00');
  });

  it('drops values the page would not accept', () => {
    expect(cardQuery('?lpf=500&sortBy=sideways')).toBe('');
  });
});

describe('buildCardUrl', () => {
  it('is absolute and carries the canonical card query', () => {
    expect(buildCardUrl('nx', '?window=1y&selectedVersion=v21')).toBe(
      'https://npm-burst.com/og/package/nx.png?selectedVersion=v21'
    );
  });
});

describe('breakdownViewFromSearch', () => {
  it('fills defaults for an empty query', () => {
    expect(breakdownViewFromSearch('')).toEqual({
      lowPassFilter: 0.02,
      expandedNodes: [],
      versionFilter: '',
      sortByVersion: true,
      selectedVersion: null,
    });
  });

  it('reads the view the page would show', () => {
    expect(
      breakdownViewFromSearch(
        '?lpf=5.00&expanded=Other,v21.?&filter=^21&sortBy=downloads&selectedVersion=v21'
      )
    ).toEqual({
      lowPassFilter: 0.05,
      expandedNodes: ['Other', 'v21.?'],
      versionFilter: '^21',
      sortByVersion: false,
      selectedVersion: 'v21',
    });
  });
});
