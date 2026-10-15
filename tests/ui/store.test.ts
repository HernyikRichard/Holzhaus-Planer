import { createStore } from '../../src/ui/store';
import { createDefaultPlan } from '../../src/model/defaults';

test('invalid update keeps last valid output', () => {
  const s = createStore(createDefaultPlan());
  const before = s.get().output;
  s.update(p => { p.building.width = 500; });
  expect(s.get().errors.length).toBeGreaterThan(0);
  expect(s.get().plan.building.width).toBe(500);
  expect(s.get().output).toBe(before);
});
test('valid update recalculates and notifies', () => {
  const s = createStore(createDefaultPlan()); const fn = vi.fn(); s.subscribe(fn);
  s.update(p => { p.building.length = 6000; });
  expect(fn).toHaveBeenCalledOnce();
  expect(s.get().lastValidPlan.building.length).toBe(6000);
});

test('state is frozen: mutating get().plan cannot corrupt lastValidPlan', () => {
  const s = createStore(createDefaultPlan());
  expect(() => { s.get().plan.building.width = 500; }).toThrow();
  expect(s.get().lastValidPlan).not.toBe(s.get().plan);
  expect(s.get().lastValidPlan.building.width).not.toBe(500);
});
test('createStore clones the initial plan', () => {
  const init = createDefaultPlan();
  const w = init.building.width;
  const s = createStore(init);
  init.building.width = 1;
  expect(s.get().plan.building.width).toBe(w);
});
test('replace: valid recalculates and notifies, invalid keeps output', () => {
  const s = createStore(createDefaultPlan()); const fn = vi.fn(); s.subscribe(fn);
  const next = createDefaultPlan(); next.building.length = 6000;
  const before = s.get().output;
  s.replace(next);
  expect(fn).toHaveBeenCalledOnce();
  expect(s.get().output).not.toBe(before);
  expect(s.get().plan).not.toBe(next);
  const kept = s.get().output;
  const bad = createDefaultPlan(); bad.building.width = 500;
  s.replace(bad);
  expect(s.get().errors.length).toBeGreaterThan(0);
  expect(s.get().output).toBe(kept);
});
test('unsubscribe stops notifications', () => {
  const s = createStore(createDefaultPlan()); const fn = vi.fn();
  const off = s.subscribe(fn); off();
  s.update(p => { p.building.length = 6000; });
  expect(fn).not.toHaveBeenCalled();
});
test('invalid to valid recovery updates lastValidPlan', () => {
  const s = createStore(createDefaultPlan());
  s.update(p => { p.building.width = 500; });
  s.update(p => { p.building.width = 3000; });
  expect(s.get().errors).toHaveLength(0);
  expect(s.get().lastValidPlan.building.width).toBe(3000);
});
