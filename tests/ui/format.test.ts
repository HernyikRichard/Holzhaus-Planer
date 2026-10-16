import { parseNumberInput, formatQty, formatFt, formatCm } from '../../src/ui/format';

test('parseNumberInput accepts comma', () => {
  expect(parseNumberInput('3,5')).toBe(3.5);
  expect(parseNumberInput(' 3.5 ')).toBe(3.5);
  expect(parseNumberInput('')).toBeNull();
  expect(parseNumberInput('3,5,1')).toBeNull();
});
test('parseNumberInput accepts Hungarian thousands spacing (space, NBSP, narrow NBSP)', () => {
  expect(parseNumberInput('2 390')).toBe(2390);
  expect(parseNumberInput('2' + String.fromCharCode(0xa0) + '390')).toBe(2390);
  expect(parseNumberInput('1' + String.fromCharCode(0x202f) + '234' + String.fromCharCode(0x202f) + '567,5')).toBe(1234567.5);
  expect(parseNumberInput(' 14 990 ')).toBe(14990);
  expect(parseNumberInput('3,5,1')).toBeNull();
  expect(parseNumberInput('3 5,1 2')).toBeNull();
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
test('formatCm: whole cm stays whole, otherwise one decimal with comma', () => {
  expect(formatCm(600)).toBe('60 cm');
  expect(formatCm(1525)).toBe('152,5 cm');
  expect(formatCm(1526)).toBe('152,6 cm');
  expect(formatCm(4)).toBe('0,4 cm');
  expect(formatCm(1000.04)).toBe('100 cm');
});

test('formatCm negatives and half-mm rounding', () => {
  expect(formatCm(-4)).toBe('-0,4 cm');
  expect(formatCm(-0.4)).toBe('0 cm');
  expect(formatCm(1000.5)).toBe('100,1 cm');
});
