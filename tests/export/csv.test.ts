import { toCsv } from '../../src/export/csv';
import { planFileSlug } from '../../src/export/filename';

test('toCsv', () => {
  const csv = toCsv([{ id: 'a', category: 'Alap', name: 'Cement; zsákos', quantity: 483.5, unit: 'kg',
    explanation: '1,6 m³ × 300 kg/m³' }]);
  expect(csv.startsWith('\uFEFFKategória;Anyag;Mennyiség;Egység;Kiegészítő;Számítás\r\n')).toBe(true);
  expect(csv).toContain('Alap;"Cement; zsákos";483,5;kg;;1,6 m³ × 300 kg/m³');
});
test('toCsv number formatting, quoting and secondary', () => {
  const csv = toCsv([
    { id: 'a', category: 'Fal', name: 'Léc "A"', quantity: 12, unit: 'db', secondary: '3 szál', explanation: 'x' },
    { id: 'b', category: 'Fal', name: 'Szög', quantity: 0.03, unit: 'kg', explanation: 'y' },
    { id: 'c', category: 'Fal', name: 'Nagy', quantity: 12345.6, unit: 'm', explanation: 'z' },
  ]);
  const rows = csv.split('\r\n');
  expect(rows[1]).toBe('Fal;"Léc ""A""";12;db;3 szál;x');
  expect(rows[2]).toBe('Fal;Szög;0,03;kg;;y');
  expect(rows[3]).toBe('Fal;Nagy;12345,6;m;;z');
});
test('planFileSlug', () => {
  expect(planFileSlug('Új terv')).toBe('uj-terv');
  expect(planFileSlug('  Kerti ház / árvíztűrő  ')).toBe('kerti-haz-arvizturo');
  expect(planFileSlug('!!!')).toBe('terv');
});
