import { renderToString } from 'react-dom/server';
import { Sunburst } from './sunburst';
import type { SunburstData } from './sunburst-model';

vi.mock('../../context/theme-context', () => ({
  useTheme: () => ({ theme: 'dark' }),
}));

const tree: SunburstData = {
  name: 'versions',
  children: [
    {
      name: 'v2',
      children: [
        { name: 'v2.0', children: [{ name: 'v2.0.0', value: 40 }] },
        { name: 'v2.1', children: [{ name: 'v2.1.0', value: 20 }] },
      ],
    },
    {
      name: 'v1',
      children: [{ name: 'v1.0', children: [{ name: 'v1.0.0', value: 30 }] }],
    },
  ],
};

function render(selectedVersion: string | null) {
  return renderToString(
    <Sunburst
      data={tree}
      sortByVersion={false}
      selectedVersion={selectedVersion}
      onVersionChange={() => undefined}
    />
  );
}

function sectorCount(html: string) {
  return (html.match(/<path/g) ?? []).length;
}

describe('Sunburst', () => {
  it('server-renders the top two rings', () => {
    const html = render(null);
    // v2, v1 + v2.0, v2.1, v1.0
    expect(sectorCount(html)).toBe(5);
    expect(html).toContain('All versions');
  });

  it('labels sectors along their radius', () => {
    const html = render(null);
    expect(html).toMatch(/<text[^>]*transform="rotate\([^"]*"[^>]*>v2</);
    expect(html).toMatch(/>v2\.1</);
  });

  it('drills into the selected version', () => {
    const html = render('v2');
    // v2.0, v2.1 + v2.0.0, v2.1.0
    expect(sectorCount(html)).toBe(4);
    expect(html).toContain('Back to versions');
  });
});
