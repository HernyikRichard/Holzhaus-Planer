import { createDefaultPlan } from '../../src/model/defaults';
import { wallGeometry, studLengthAt } from '../../src/calc/geometry';
import { calcWallFraming } from '../../src/calc/walls';

test('default plan framing totals', () => {
  const r = calcWallFraming(createDefaultPlan());
  expect(r.lines).toEqual([]);
  expect(r.pieces.filter(x => x.label === 'sarokoszlop')).toHaveLength(8);
  expect(r.pieces.filter(x => x.label === 'koszorú').reduce((s, x) => s + x.length, 0)).toBe(2 * (4000 * 2 + 2800 * 2));
  expect(r.pieces.some(x => x.label === 'oromoszlop')).toBe(true);
  expect(r.stats.headers).toBe(2);
});
test('mono wall studs get taller toward high side', () => {
  const p = createDefaultPlan(); p.roof.shape = 'mono'; p.roof.pitch = 10; p.openings = [];
  const n = wallGeometry(p).find(w => w.side === 'N')!;
  expect(studLengthAt(p, n, 0)).toBeGreaterThan(studLengthAt(p, n, n.length));
});

test('gable studs are not filtered by openings', () => {
  const count = (p: ReturnType<typeof createDefaultPlan>) =>
    calcWallFraming(p).pieces.filter(x => x.label === 'oromoszlop').length;
  const p = createDefaultPlan(); p.openings = [];
  const base = count(p);
  expect(base).toBeGreaterThan(0);
  p.openings = (['N', 'E', 'S', 'W'] as const).map((wall, i) => ({
    id: `o${i}`, type: 'window' as const, wall, offset: 300, width: 2000, height: 1000, sillHeight: 900, swing: 'left' as const,
  }));
  expect(count(p)).toBe(base);
});
