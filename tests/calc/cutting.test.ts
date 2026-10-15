import { packPieces, cutTimber, assignCuts } from '../../src/calc/cutting';

test('two per 6 m stock', () => {
  const r = packPieces([2400, 2400, 2400, 2400], [3000, 6000], 10);
  expect(r.bins.map(b => b.stock)).toEqual([6000, 6000]);
});
test('shrinks to shortest fitting stock', () => {
  expect(packPieces([2900], [3000, 4000, 6000], 10).bins).toEqual([{ stock: 3000, pieces: [2900] }]);
});
test('splices overlong piece with warning', () => {
  const r = packPieces([6500], [3000, 6000], 10);
  expect(r.bins.map(b => b.stock).sort()).toEqual([3000, 6000]);
  expect(r.warnings).toHaveLength(1);
});
test('cutTimber groups by category+section and applies waste', () => {
  const s = { t: 50, w: 100 };
  const lines = cutTimber([
    { category: 'Fal', section: s, length: 2250, label: 'oszlop' },
    { category: 'Fal', section: s, length: 2250, label: 'oszlop' },
    { category: 'Tető', section: s, length: 2250, label: 'x' },
  ], [3000], 0.10);
  expect(lines.map(l => [l.id, l.quantity])).toEqual([
    ['timber.Fal.50x100.3000', 3], ['timber.Tető.50x100.3000', 2] ]);
});
test('line name, secondary and ordering by stock length', () => {
  const lines = cutTimber([
    { category: 'Fal', section: { t: 50, w: 100 }, length: 4400, label: 'a' },
    { category: 'Fal', section: { t: 50, w: 100 }, length: 2900, label: 'b' },
    { category: 'Fal', section: { t: 20, w: 100 }, length: 1000, label: 'c' },
  ], [3000, 4500], 0);
  expect(lines.map(l => l.name)).toEqual([
    'Fenyő palló 50×100, 3 m', 'Fenyő palló 50×100, 4,5 m', 'Fenyő deszka 20×100, 3 m']);
  expect(lines[0].secondary).toBe('3,0 fm, 0,015 m³');
  expect(lines[0].unit).toBe('szál');
  expect(lines[0].explanation).toContain('b (2900 mm) × 1');
});
test('explanation labels spliced parts from their source piece', () => {
  const lines = cutTimber([
    { category: 'Fal', section: { t: 50, w: 100 }, length: 6500, label: 'a' },
    { category: 'Fal', section: { t: 50, w: 100 }, length: 500, label: 'x' },
  ], [3000, 6000], 0);
  const text = lines.map(l => l.explanation).join(' ');
  expect(text).toContain('a (toldott rész, 6000 mm) × 1');
  expect(text).toContain('a (toldott rész, 500 mm) × 1');
  expect(text).toContain('x (500 mm) × 1');
});
test('kerf boundary', () => {
  expect(packPieces([2995, 2995], [6000], 10).bins).toHaveLength(1);
  expect(packPieces([2996, 2995], [6000], 10).bins).toHaveLength(2);
});
test('waste is applied once per group, extra sticks go to the longest stock', () => {
  const s = { t: 50, w: 100 };
  const lines = cutTimber([
    { category: 'Fal', section: s, length: 2900, label: 'a' },
    { category: 'Fal', section: s, length: 4400, label: 'b' },
    { category: 'Fal', section: s, length: 4400, label: 'b' },
  ], [3000, 4500], 0.10);
  // 3 bins -> ceil(3.3) = 4 -> 1 extra, on the 4.5 m stock only
  expect(lines.map(l => [l.id, l.quantity])).toEqual([
    ['timber.Fal.50x100.3000', 1], ['timber.Fal.50x100.4500', 3]]);
});
test('single piece in a group gets 1 extra stick only once', () => {
  const lines = cutTimber([{ category: 'Tető', section: { t: 50, w: 150 }, length: 4600, label: 'gerinc' }], [3000, 5000, 6000], 0.10);
  expect(lines.map(l => [l.id, l.quantity])).toEqual([['timber.Tető.50x150.5000', 2]]);
});
test('warnings are deduplicated within a line and mm are rounded', () => {
  const lines = cutTimber([
    { category: 'Fal', section: { t: 50, w: 100 }, length: 6500.4, label: 'a' },
    { category: 'Fal', section: { t: 50, w: 100 }, length: 6500.4, label: 'a' },
  ], [3000, 6000], 0);
  for (const l of lines) expect(new Set(l.warnings).size).toBe(l.warnings!.length);
  expect(lines.map(l => l.explanation).join(' ')).not.toMatch(/\d\.\d+ mm/);
});
test('non-positive lengths are ignored', () => {
  const r = packPieces([-50, 0, 1000], [3000, 6000], 10);
  expect(r.bins).toEqual([{ stock: 3000, pieces: [1000] }]);
});
test('wide thin sections are boards, narrow thin ones battens', () => {
  const mk = (s: { t: number; w: number }) =>
    cutTimber([{ category: 'Fal', section: s, length: 2000, label: 'x' }], [3000], 0)[0].name;
  expect(mk({ t: 24, w: 48 })).toContain('léc');
  expect(mk({ t: 25, w: 150 })).toContain('deszka');
  expect(mk({ t: 50, w: 100 })).toContain('palló');
});

test('assignCuts mirrors packing', () => {
  const s = { t: 50, w: 100 };
  const pieces = [2400, 2400, 2400].map((length, i) => ({ id: `p${i}`, category: 'Fal' as const, section: s, length, label: 'x' }));
  const a = assignCuts(pieces, [3000, 6000]);
  expect(a.p0).toMatchObject({ stockLength: 6000, stockIndex: 1, offset: 0 });
  expect(a.p1).toMatchObject({ stockLength: 6000, stockIndex: 1, offset: 2410 });
  expect(a.p0.siblings).toEqual(['p1']);
  expect(a.p2).toMatchObject({ stockLength: 3000, stockIndex: 1, offset: 0, siblings: [] });
});

test('assignCuts accumulates kerf offsets over 3+ pieces', () => {
  const s = { t: 50, w: 100 };
  const pieces = [1000, 1500, 2000].map((length, i) => ({ id: `q${i}`, category: 'Fal' as const, section: s, length, label: 'x' }));
  const a = assignCuts(pieces, [6000]);
  expect(a.q2.offset).toBe(0);
  expect(a.q1.offset).toBe(2010);
  expect(a.q0.offset).toBe(2010 + 1500 + 10);
  expect(a.q0.siblings).toEqual(['q2', 'q1']);
});
