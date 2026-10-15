import { createDefaultPlan } from '../../src/model/defaults';
import { roofGeometry } from '../../src/calc/geometry';
import { roofElements } from '../../src/scene/roofFrame';
import { floorElements, foundationElements, accessoryElements } from '../../src/scene/misc';
import { mono4x6Plan } from '../fixtures';

test('gable rafters per plane', () => {
  const r = roofElements(createDefaultPlan());
  expect(r.elements.filter(e => e.group === 'roof.L' && e.kind === 'rafter')).toHaveLength(9);
  expect(r.fasteners.filter(f => f.kind === 'hurricaneTie')).toHaveLength(36);
});
test('rafter labels and positions', () => {
  const r = roofElements(createDefaultPlan());
  const raf = r.elements.filter(e => e.group === 'roof.L' && e.kind === 'rafter');
  expect(raf[0]).toMatchObject({ id: 'roof.L.rafter.1', label: 'Szarufa #1', pieceLabel: 'szarufa' });
  expect(raf[0].geom.u).toBe(0);
  const last = raf[raf.length - 1];
  expect(last.geom.u + last.geom.w).toBeCloseTo(roofGeometry(createDefaultPlan()).roofLengthAlongRidge, 6);
  expect(r.elements.some(e => e.kind === 'ridge' && e.label === 'Gerincpalló')).toBe(true);
  const collars = r.elements.filter(e => e.kind === 'collar');
  expect(collars.length).toBe(10);
  expect(collars[0].label).toBe('Fogópár #1');
  expect(r.fasteners.filter(f => f.kind === 'frameScrew').every(f => f.count === 2)).toBe(true);
});
test('mono roof is a single group', () => {
  const r = roofElements(mono4x6Plan());
  expect(new Set(r.elements.filter(e => e.kind === 'rafter').map(e => e.group))).toEqual(new Set(['roof.M']));
  expect(r.elements.some(e => e.kind === 'ridge')).toBe(false);
});
test('floor, foundation, accessories', () => {
  const p = mono4x6Plan();
  const f = floorElements(p);
  expect(f.length).toBeGreaterThan(0);
  expect(f[0]).toMatchObject({ kind: 'joist', group: 'floor', label: 'Párnafa #1', pieceLabel: 'párnafa' });
  expect(foundationElements(p).every(e => e.kind === 'meshSheet' && e.group === 'foundation')).toBe(true);
  expect(foundationElements(p)[0].label).toBe('Hálótábla #1');
  const a = accessoryElements(createDefaultPlan());
  expect(a.every(e => e.kind === 'fascia' || e.kind === 'barge')).toBe(true);
});
