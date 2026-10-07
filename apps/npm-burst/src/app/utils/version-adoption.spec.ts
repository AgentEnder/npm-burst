import { getVersionAdoptionData } from './version-adoption';

function dailyTotals(from: string, days: number, downloads: number) {
  const start = new Date(`${from}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(start.getTime() + i * 86_400_000);
    return { day: day.toISOString().slice(0, 10), downloads };
  });
}

describe('getVersionAdoptionData', () => {
  it('keeps every series in date order when padding pre-snapshot dates', () => {
    const series = getVersionAdoptionData(
      [{ date: '2026-03-01', downloads: { '1.0.0': 300, '2.0.0': 400 } }],
      null,
      'major',
      0,
      dailyTotals('2026-01-01', 70, 100)
    );

    expect(series.map((s) => s.label)).toContain('unknown');
    for (const s of series) {
      const dates = s.points.map((p) => p.date);
      expect(dates, s.label).toEqual([...dates].sort());
    }
  });

  it('gives known versions zero share before the first snapshot', () => {
    const series = getVersionAdoptionData(
      [{ date: '2026-03-01', downloads: { '1.0.0': 300 } }],
      null,
      'major',
      0,
      dailyTotals('2026-01-01', 70, 100)
    );
    const v1 = series.find((s) => s.label === 'v1')!;
    const unknown = series.find((s) => s.label === 'unknown')!;
    const before = (p: { date: string }) => p.date < '2026-03-01';

    expect(v1.points.filter(before).every((p) => p.percent === 0)).toBe(true);
    expect(unknown.points.filter(before).every((p) => p.percent === 100)).toBe(
      true
    );
  });
});
