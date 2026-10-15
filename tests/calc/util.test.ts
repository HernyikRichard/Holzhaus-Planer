import { ceilTo, sectionKey, sectionLabel } from '../../src/calc/util';

test('ceilTo', () => {
  expect(ceilTo(483.84, 1)).toBe(484);
  expect(ceilTo(0.1 + 0.2, 0.1)).toBeCloseTo(0.3);
  expect(ceilTo(1.6128, 0.01)).toBeCloseTo(1.62);
});
test('section helpers', () => {
  expect(sectionKey({ t: 50, w: 100 })).toBe('50x100');
  expect(sectionLabel({ t: 50, w: 100 })).toBe('50×100');
});

test('ceilTo returns clean values without float noise', () => {
  expect(ceilTo(3.0643, 0.01)).toBe(3.07);
  expect(ceilTo(9.2, 0.1)).toBe(9.2);
});
