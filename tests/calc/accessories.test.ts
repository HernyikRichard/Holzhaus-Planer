import { createDefaultPlan } from '../../src/model/defaults';
import { calcAccessories } from '../../src/calc/accessories';

test('gable accessories 3×4', () => {
  const r = calcAccessories(createDefaultPlan());
  const q = (id: string) => r.lines.find(l => l.id === id)?.quantity;
  expect(q('acc.gutter')).toBeCloseTo(9.2);
  expect(q('acc.gutterBrackets')).toBe(18);
  expect(q('acc.downpipe')).toBe(2);
  expect(q('acc.downpipeElbows')).toBe(4);
  expect(q('acc.downpipeClips')).toBe(6);      // 2 × ⌈2700/1000⌉
  expect(q('acc.ridgeTiles')).toBe(12);        // 4,6 × 2,5 = 11,5
  expect(r.pieces.filter(p => p.label === 'oromdeszka')).toHaveLength(4);
});
test('mono has one eave and no ridge', () => {
  const p = createDefaultPlan(); p.roof.shape = 'mono'; p.roof.pitch = 10;
  const r = calcAccessories(p);
  expect(r.lines.find(l => l.id === 'acc.ridgeTiles')).toBeUndefined();
  expect(r.lines.find(l => l.id === 'acc.downpipe')!.quantity).toBe(1);
});

test('gutter joiners: default plan has 2, none when gutter off', () => {
  const p = createDefaultPlan();
  expect(calcAccessories(p).lines.find(l => l.id === 'acc.gutterJoiners')?.quantity).toBe(2);
  p.accessories.gutter = false;
  expect(calcAccessories(p).lines.some(l => l.id === 'acc.gutterJoiners')).toBe(false);
});

test('fascia runs along both eaves (low and high) for mono and flat roofs', async () => {
  const { createDefaultPlan } = await import('../../src/model/defaults');
  const { calcAccessories } = await import('../../src/calc/accessories');
  for (const [shape, pitch] of [['mono', 10], ['flat', 3], ['gable', 30]] as const) {
    const p = createDefaultPlan(); p.roof.shape = shape; p.roof.pitch = pitch;
    p.accessories.bargeBoard = false;
    expect(calcAccessories(p).pieces.filter(x => x.label === 'homlokdeszka'), shape).toHaveLength(2);
  }
});
