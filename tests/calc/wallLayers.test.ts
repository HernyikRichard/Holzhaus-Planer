import { createDefaultPlan } from '../../src/model/defaults';
import { calcWallLayers, wallAreas } from '../../src/calc/walls';

test('wall areas', () => {
  const a = wallAreas(createDefaultPlan());
  expect(a.gross).toBeCloseTo(35.065, 2);
  expect(a.net).toBeCloseTo(32.905, 2);
});
test('layer quantities', () => {
  const r = calcWallLayers(createDefaultPlan());
  const q = (id: string) => r.lines.find(l => l.id === id)?.quantity;
  expect(q('wall.osb')).toBe(12);
  expect(q('wall.vaporBarrier')).toBe(1);
  expect(q('wall.insulation')).toBe(10);
  expect(q('wall.interiorCladding')).toBe(12);
  expect(q('wall.exteriorCladding')).toBeCloseTo(36.2);
  expect(r.stats.osbSheets).toBe(12); // csak a rajzon nem szereplő (belső) OSB táblák
  expect(r.stats.osbScrewCount).toBeGreaterThan(0);
  expect(r.stats.claddingArea).toBeCloseTo(36.2);
});
test('disabled layer produces no line', () => {
  const p = createDefaultPlan(); p.walls.layers.find(l => l.kind === 'osb')!.enabled = false;
  expect(calcWallLayers(p).lines.find(l => l.id === 'wall.osb')).toBeUndefined();
});
// A fali lécek pozíció nélküli darabok: nincs hozzájuk Element, az id-jük wall.batten.<n>.
test('battens become 2400 mm pieces', () => {
  const r = calcWallLayers(createDefaultPlan());
  const total = r.pieces.reduce((s, x) => s + x.length, 0);
  expect(total).toBe(Math.ceil(32.905 / 0.6) * 1000);
  expect(r.pieces.every(x => x.label === 'léc' && x.length <= 2400)).toBe(true);
});
test('missing insulation thickness uses next larger with warning', () => {
  const p = createDefaultPlan(); p.walls.studSection = { t: 50, w: 120 };
  const l = calcWallLayers(p).lines.find(x => x.id === 'wall.insulation')!;
  expect(l.warnings?.length).toBeGreaterThan(0);
  const need = wallAreas(p).net * (1 - 50 / 600) * 1.1;
  expect(l.quantity).toBe(Math.ceil(need / 2.4 - 1e-9));
});
test('unknown insulation material falls back with warning', () => {
  const p = createDefaultPlan(); p.walls.layers.find(x => x.kind === 'insulation')!.material = 'foo';
  const l = calcWallLayers(p).lines.find(x => x.id === 'wall.insulation')!;
  expect(l.warnings?.length).toBeGreaterThan(0);
});
test('exterior cladding name is Hungarian', () => {
  const l = calcWallLayers(createDefaultPlan()).lines.find(x => x.id === 'wall.exteriorCladding')!;
  expect(l.name).toContain('lambéria');
  expect(l.name).not.toContain('paneling');
});
