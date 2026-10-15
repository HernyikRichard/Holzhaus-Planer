import { createDefaultPlan } from '../../src/model/defaults';
import { validatePlan } from '../../src/model/validate';
import { mono4x6Plan } from '../fixtures';
import { calculate, CATEGORY_ORDER } from '../../src/calc';

test('reference: 3×4 gable tile (default)', () => {
  expect(calculate(createDefaultPlan()).lines.map(l => [l.id, l.quantity, l.unit])).toMatchSnapshot();
});
test('reference: 4×6 mono trapezoid with floor', () => {
  const p = mono4x6Plan();
  expect(validatePlan(p)).toEqual([]);
  expect(calculate(p).lines.map(l => [l.id, l.quantity, l.unit])).toMatchSnapshot();
});
test('all layers off', () => {
  const p = createDefaultPlan();
  p.walls.layers.forEach(l => l.enabled = false);
  p.roof.layers.forEach(l => l.enabled = false);
  Object.keys(p.accessories).forEach(k => (p.accessories as any)[k] = false);
  const out = calculate(p);
  expect(out.lines.every(l => l.quantity > 0)).toBe(true);
  expect(out.lines.some(l => l.id.startsWith('acc.'))).toBe(false);
  expect(out.lines.some(l => ['fix.osbScrews', 'fix.claddingNails', 'fix.counterBattenNails', 'fix.battenNails'].includes(l.id))).toBe(false);
});
test('lines are ordered by category', () => {
  const cats = calculate(createDefaultPlan()).lines.map(l => CATEGORY_ORDER.indexOf(l.category));
  expect(cats).toEqual([...cats].sort((a, b) => a - b));
});

test('4×6 mono plan: span and splice warnings appear exactly once', () => {
  const p = mono4x6Plan();
  const w = calculate(p).warnings;
  expect(w.filter(x => x.includes('nem statikai méretezés'))).toHaveLength(1);
  expect(w.filter(x => x.includes('toldással'))).toHaveLength(1);
});
