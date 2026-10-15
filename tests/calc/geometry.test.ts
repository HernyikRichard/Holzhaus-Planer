import { createDefaultPlan } from '../../src/model/defaults';
import { roofGeometry, studLengthAt, wallGeometry } from '../../src/calc/geometry';

test('gable 3×4, ridge y: walls', () => {
  const p = createDefaultPlan();
  const w = Object.fromEntries(wallGeometry(p).map(g => [g.side, g]));
  expect(w.E.length).toBe(4000); expect(w.E.full).toBe(true);
  expect(w.N.length).toBe(2800); expect(w.N.full).toBe(false);
  expect(w.N.gableRise).toBeCloseTo(1500 * Math.tan(Math.PI / 6));
  expect(w.E.gableRise).toBe(0);
  expect(w.E.hStart).toBe(2400);
});
test('gable roof geometry', () => {
  const r = roofGeometry(createDefaultPlan());
  expect(r.W).toBe(3000); expect(r.L).toBe(4000); expect(r.planes).toBe(2);
  expect(r.rafterLength).toBeCloseTo(2078.46, 1);
  expect(r.raftersPerPlane).toBe(9);
  expect(r.planeArea).toBeCloseTo(2.07846 * 4.6, 3);
  expect(r.ridgeLength).toBe(4600); expect(r.eaveCount).toBe(2); expect(r.rakeEdges).toBe(4);
});
test('mono roof raises the high wall', () => {
  const p = createDefaultPlan(); p.roof.shape = 'mono'; p.roof.pitch = 10;
  const w = Object.fromEntries(wallGeometry(p).map(g => [g.side, g]));
  const rise = 3000 * Math.tan(10 * Math.PI / 180);
  expect(w.W.hStart).toBeCloseTo(2400 + rise); expect(w.E.hStart).toBe(2400);
  expect(w.N.hStart).toBeCloseTo(2400 + rise); expect(w.N.hEnd).toBeCloseTo(2400);
  expect(roofGeometry(p).rafterLength).toBeCloseTo(3600 / Math.cos(10 * Math.PI / 180), 1);
});
test('studLengthAt subtracts plates', () => {
  const p = createDefaultPlan(); const e = wallGeometry(p)[1];
  expect(studLengthAt(p, e, 1000)).toBe(2250);
});
