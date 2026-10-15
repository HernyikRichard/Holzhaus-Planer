import { createDefaultPlan } from '../../src/model/defaults';
import { calcFoundation } from '../../src/calc/foundation';
import type { ModuleResult } from '../../src/calc/types';

const q = (r: ModuleResult, id: string) => r.lines.find(l => l.id === id)?.quantity;
test('foundation 3×4, 120 mm, C16', () => {
  const r = calcFoundation(createDefaultPlan());
  expect(q(r, 'foundation.concrete')).toBeCloseTo(1.62);
  expect(q(r, 'foundation.cement')).toBe(484);
  expect(q(r, 'foundation.cementBags')).toBe(20);
  expect(r.lines.find(l => l.id === 'foundation.cement')?.secondary).toBe('20 zsák (25 kg)');
  expect(q(r, 'foundation.gravel')).toBeCloseTo(3.07);
  expect(q(r, 'foundation.water')).toBe(291);
  expect(q(r, 'foundation.mesh')).toBe(6);
  expect(q(r, 'foundation.bed')).toBeCloseTo(2.52);
  expect(q(r, 'foundation.peFoil')).toBe(1);
  expect(q(r, 'foundation.formwork')).toBeCloseTo(2.6);
  expect(q(r, 'foundation.stakes')).toBe(15);
  r.lines.forEach(l => expect(l.explanation.length).toBeGreaterThan(0));
});
test('C20 uses 340 kg/m³', () => {
  const p = createDefaultPlan(); p.foundation.concreteGrade = 'C20';
  expect(q(calcFoundation(p), 'foundation.cement')).toBe(549);
});
test('no PE foil when disabled', () => {
  const p = createDefaultPlan(); p.foundation.peFoil = false;
  expect(q(calcFoundation(p), 'foundation.peFoil')).toBeUndefined();
});
