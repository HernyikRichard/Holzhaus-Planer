import { createDefaultPlan } from '../../src/model/defaults';
import { calcRoofLayers, calcRoofStructure } from '../../src/calc/roof';
import type { ModuleResult } from '../../src/calc/types';

const q = (r: ModuleResult, id: string) => r.lines.find(l => l.id === id)?.quantity;

test('gable 30° structure', () => {
  const r = calcRoofStructure(createDefaultPlan());
  expect(r.pieces.filter(p => p.label === 'szarufa')).toHaveLength(18);
  expect(r.pieces.filter(p => p.label === 'fogópár')).toHaveLength(10);
  expect(r.pieces.find(p => p.label === 'gerincpalló')!.length).toBe(4600);
  expect(r.warnings).toEqual([]);
  expect(r.stats.rafters).toBe(18);
  expect(r.stats.collarPairs).toBe(5);
});
test('span warning', () => {
  const p = createDefaultPlan(); p.roof.shape = 'mono'; p.roof.pitch = 10; p.building.width = 4000;
  expect(calcRoofStructure(p).warnings.join()).toMatch(/nem statikai méretezés/);
});
test('gable tile layers', () => {
  const r = calcRoofLayers(createDefaultPlan());
  expect(q(r, 'roof.decking')).toBeCloseTo(21.1);
  expect(q(r, 'roof.underlay')).toBe(1);
  expect(q(r, 'roof.tiles')).toBe(201);
  expect(r.pieces.filter(p => p.label === 'tetőléc')).toHaveLength(16);
  expect(r.pieces.filter(p => p.label === 'ellenléc')).toHaveLength(18);
  expect(r.lines.every(l => l.category === 'Tető')).toBe(true);
  expect(r.stats.battenCrossings).toBe(144); // 8 sor × 9 szarufa × 2 sík
  expect(r.stats.counterBattenLength).toBe(Math.round(18 * 2078.461)); // 18 × szarufahossz
  expect(r.stats.tileClips).toBe(56); // 2×4600/300 + 4×2078,46/330 = 30,67 + 25,19 = 55,86
});
test('shingle forces decking and drops battens', () => {
  const p = createDefaultPlan(); p.roof.covering = 'shingle';
  p.roof.layers.find(l => l.kind === 'decking')!.enabled = false;
  const r = calcRoofLayers(p);
  expect(q(r, 'roof.decking')).toBeDefined();
  expect(r.lines.find(l => l.id === 'roof.decking')!.warnings?.length).toBeGreaterThan(0);
  expect(r.pieces.some(x => x.label === 'tetőléc')).toBe(false);
  expect(r.pieces.some(x => x.label === 'ellenléc')).toBe(false);
  expect(q(r, 'roof.shingles')).toBe(8);
});
test('trapezoid sheets', () => {
  const p = createDefaultPlan(); p.roof.covering = 'trapezoid';
  const r = calcRoofLayers(p);
  expect(q(r, 'roof.trapezoid')).toBe(10);
  expect(r.lines.find(l => l.id === 'roof.trapezoid')!.secondary).toBe('táblahossz 2,08 m, 19,1 m²');
});
test('osb decking and epdm', () => {
  const p = createDefaultPlan(); p.roof.covering = 'epdm';
  p.roof.layers.find(l => l.kind === 'decking')!.material = 'osb';
  const r = calcRoofLayers(p);
  expect(r.stats.osbSheets).toBe(q(r, 'roof.decking'));
  // (19,1218 + 14 m × 0,2 m) × 1,1 = 24,114 → 24,2
  expect(q(r, 'roof.epdm')).toBeCloseTo(24.2);
});
