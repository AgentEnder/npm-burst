import { describe, expect, it } from 'vitest';

import { cardImageContent, withCardQuery } from './og-image-meta';

const CARD = 'https://npm-burst.com/og/package/nx.png';

describe('cardImageContent', () => {
  it('appends the canonical card query', () => {
    expect(cardImageContent(CARD, '?window=1y&selectedVersion=v21')).toBe(
      `${CARD}?selectedVersion=v21`
    );
  });

  it('leaves the tag alone when the query has nothing for the card', () => {
    expect(cardImageContent(CARD, '?window=1y')).toBeNull();
    expect(cardImageContent(CARD, '')).toBeNull();
  });

  it('only touches package card URLs', () => {
    expect(
      cardImageContent('https://npm-burst.com/og/site.png', '?lpf=5.00')
    ).toBeNull();
    expect(cardImageContent(null, '?lpf=5.00')).toBeNull();
  });

  it('never appends a second query', () => {
    expect(
      cardImageContent(`${CARD}?selectedVersion=v20`, '?lpf=5.00')
    ).toBeNull();
  });
});

describe('withCardQuery', () => {
  it('passes responses through where HTMLRewriter does not exist', () => {
    const response = new Response('<html></html>', {
      headers: { 'Content-Type': 'text/html' },
    });
    expect(
      withCardQuery(response, 'https://npm-burst.com/package/nx?lpf=5.00')
    ).toBe(response);
  });
});
