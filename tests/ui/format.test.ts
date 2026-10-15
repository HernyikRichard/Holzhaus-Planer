import { parseNumberInput, formatQty, formatFt } from '../../src/ui/format';

test('parseNumberInput accepts comma', () => {
  expect(parseNumberInput('3,5')).toBe(3.5);
  expect(parseNumberInput(' 3.5 ')).toBe(3.5);
  expect(parseNumberInput('')).toBeNull();
  expect(parseNumberInput('3,5,1')).toBeNull();
});
test('parseNumberInput rejects junk', () => {
  expect(parseNumberInput('1e3')).toBeNull();
  expect(parseNumberInput('abc')).toBeNull();
  expect(parseNumberInput('-2')).toBe(-2);
});
test('formatQty', () => {
  expect(formatQty(1234.5)).toBe('1 234,5');
  expect(formatQty(2, 2)).toBe('2');
});
test('formatFt groups thousands with non-breaking spaces', () => {
  expect(formatFt(12490)).toBe('12 490 Ft');
  expect(formatFt(0)).toBe('0 Ft');
  expect(formatFt(1234567.6)).toBe('1 234 568 Ft');
});
