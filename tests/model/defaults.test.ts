import { createDefaultPlan } from '../../src/model/defaults';

test('default plan is 3×4 gable with tile', () => {
  const p = createDefaultPlan();
  expect(p.building).toEqual({ width: 3000, length: 4000, wallHeight: 2400 });
  expect(p.roof.shape).toBe('gable');
  expect(p.roof.ridgeDirection).toBe('y');
  expect(p.walls.layers.map(l => l.kind)).toEqual(['interiorCladding','vaporBarrier','insulation','osb','breatherMembrane','battens','exteriorCladding']);
  expect(p.openings).toHaveLength(2);
});
test('createDefaultPlan returns independent copies', () => {
  const a = createDefaultPlan(); a.openings.pop();
  expect(createDefaultPlan().openings).toHaveLength(2);
});

test('default plan is v4 slab with default frame, screw, footing and pier', () => {
  const p = createDefaultPlan();
  expect(p.version).toBe(4);
  expect(p.foundation.footing).toEqual({ size: 400, depth: 800 });
  expect(p.foundation.pier).toEqual({ kind: 'block250' });
  expect(p.foundation.type).toBe('slab');
  expect(p.foundation.frame).toEqual({ beamSection: 'b100x150', supportSpacing: 'auto', groundClearance: 300 });
  expect(p.foundation.groundScrew).toEqual({ length: 1000, diameter: 76 });
});
