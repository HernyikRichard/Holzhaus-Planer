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
