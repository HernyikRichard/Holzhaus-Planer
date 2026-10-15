import { createDefaultPlan } from '../../src/model/defaults';
import { calcFloor } from '../../src/calc/floor';
import type { ModuleResult } from '../../src/calc/types';

const q = (r: ModuleResult, id: string) => r.lines.find(l => l.id === id)?.quantity;
test('floor 3×4: joists and sheets', () => {
  const p = createDefaultPlan(); p.floor.enabled = true;
  const r = calcFloor(p);
  expect(r.pieces.filter(x => x.label === 'párnafa')).toHaveLength(6);
  expect(r.pieces[0].length).toBe(3800);
  expect(q(r, 'floor.osb')).toBe(7);
  expect(q(r, 'floor.insulation')).toBe(3);
  expect(r.stats.osbSheets).toBe(7);
  expect(calcFloor(createDefaultPlan()).lines).toEqual([]);
});
test('floor without insulation has no insulation line', () => {
  const p = createDefaultPlan(); p.floor.enabled = true; p.floor.insulation = null;
  expect(q(calcFloor(p), 'floor.insulation')).toBeUndefined();
});
test('no joist summary line (pieces only)', () => {
  const p = createDefaultPlan(); p.floor.enabled = true;
  expect(calcFloor(p).lines.find(l => l.id === 'floor.joist')).toBeUndefined();
});
test('vapour barrier line follows the setting', () => {
  const p = createDefaultPlan(); p.floor.enabled = true;
  expect(q(calcFloor(p), 'floor.vaporBarrier')).toBe(1);
  p.floor.vaporBarrier = false;
  expect(q(calcFloor(p), 'floor.vaporBarrier')).toBeUndefined();
});
