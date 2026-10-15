import { parseProduct, parseHuNumber } from '../../scripts/parse';
import { KAPLAR_NAMES } from '../fixtures/kaplarNames';

test('Padló 5x15x400cm', () => {
  expect(parseProduct({ name: 'Padló 5x15x400cm (0,03m3)', url: 'https://kaplarfatelep.hu/x', price: 5670, unitText: 'db' }))
    .toMatchObject({ kind: 'timber', section: { t: 50, w: 150 }, length: 4000, price: 5670, unit: 'db' });
});

test.each(KAPLAR_NAMES.map((c) => [c.name, c] as const))('%s', (_n, c) => {
  expect(parseProduct(c)).toMatchObject(c.expected);
});

test('fixture covers every kind with at least two real names', () => {
  const kinds = KAPLAR_NAMES.map((c) => c.expected.kind);
  for (const k of ['timber', 'osb', 'insulation', 'foil', 'cladding', 'roofing', 'gutter', 'fastener'])
    expect(kinds.filter((x) => x === k).length).toBeGreaterThanOrEqual(2);
  expect(KAPLAR_NAMES.length).toBeGreaterThanOrEqual(15);
});

test('parseProduct returns null for unknown', () => {
  expect(parseProduct({ name: 'Ajándékutalvány', url: 'u', price: 1000, unitText: 'db' })).toBeNull();
});

test('parseProduct returns null for timber without dimensions', () => {
  expect(parseProduct({ name: 'Szarufa', url: 'u', price: 1000, unitText: 'db' })).toBeNull();
});

test('parseHuNumber', () => {
  expect(parseHuNumber('5 670')).toBe(5670);
  expect(parseHuNumber('5,4')).toBe(5.4);
  expect(parseHuNumber('1 396')).toBe(1396);
  expect(parseHuNumber('14.500')).toBe(14500);
  expect(parseHuNumber('abc')).toBeNaN();
});

test('ids are stable', () => {
  const a = parseProduct({ name: 'Padló 5x15x400cm', url: 'u', price: 1, unitText: 'db' })!;
  expect(a.id).toBe('timber-50x150-4000');
  expect(parseProduct({ name: 'Padló 5x15x400cm', url: 'other', price: 99, unitText: 'db' })!.id).toBe(a.id);
});

test('unit rules: Ft / db pattern, default db, mm and unmarked sizes', () => {
  const p = (name: string, unitText: string) => parseProduct({ name, url: 'u', price: 1, unitText })!;
  expect(p('Gerenda 10x10x400cm', 'Ft / db').unit).toBe('db');
  expect(p('Gerenda 10x10x400cm', '').unit).toBe('db');
  expect(p('Lambéria 14x121x4000mm', 'Ft / csomag').unit).toBe('csomag');
  expect(p('Bramac tetőléc 3x5x400', 'méter').unit).toBe('fm');
  expect(p('Gerenda 100x100x4000mm', 'db')).toMatchObject({ section: { t: 100, w: 100 }, length: 4000 });
  expect(p('Léc 5x10x400', 'db')).toMatchObject({ section: { t: 50, w: 100 }, length: 4000 });
});

test('slash notation from the spec: tetőléc 3/5 4m', () => {
  expect(parseProduct({ name: 'Bramac Plus tetőléc 3/5 4m', url: 'u', price: 1, unitText: 'db' }))
    .toMatchObject({ kind: 'timber', section: { t: 30, w: 50 }, length: 4000 });
});

test('OSB with sheet size and spec insulation example', () => {
  expect(parseProduct({ name: 'OSB lap 12 mm 1250x2500', url: 'u', price: 7000, unitText: 'db' }))
    .toMatchObject({ id: 'osb-12-1250x2500', kind: 'osb', thickness: 12, sheet: { w: 1250, l: 2500 }, unit: 'tábla' });
  expect(parseProduct({ name: 'Kőzetgyapot 10 cm tekercs 5,4 m²/csomag', url: 'u', price: 9000, unitText: 'csomag' }))
    .toMatchObject({ id: 'insulation-kozetgyapot-100', kind: 'insulation', material: 'kőzetgyapot', thickness: 100, packM2: 5.4, unit: 'csomag' });
});

test('name is cleaned of site suffix, entities and whitespace', () => {
  const p = parseProduct({ name: '  Lambéria 14x121x4000mm &quot;A/B&quot; - Országos kiszállítás ! - Káplár Fatelep', url: 'u', price: 1, unitText: 'm²' })!;
  expect(p.name).toBe('Lambéria 14x121x4000mm "A/B"');
});

test('fastener is not mistaken for roofing (zsindelyszeg)', () => {
  expect(parseProduct({ name: 'Zsindelyszeg 25 mm 5kg', url: 'u', price: 1, unitText: 'db' })!.kind).toBe('fastener');
});

test('non-lumber "padló"/"gerenda" products are rejected', () => {
  const p = (name: string) => parseProduct({ name, url: 'u', price: 1000, unitText: 'db' });
  expect(p('Laminált padló 1285x192x8 mm')).toBeNull();
  expect(p('Padlólap 60x60x1 cm')).toBeNull();
  expect(p('Gerendatartó 10x10x4 cm')).toBeNull();
});

test('unmarked sizes: both section numbers >= 20 means mm', () => {
  expect(parseProduct({ name: 'Szarufa 45x95x4000', url: 'u', price: 1000, unitText: 'db' }))
    .toMatchObject({ kind: 'timber', section: { t: 45, w: 95 }, length: 4000, id: 'timber-45x95-4000' });
});

test('implausible timber sizes are rejected', () => {
  const p = (name: string) => parseProduct({ name, url: 'u', price: 1000, unitText: 'db' });
  expect(p('Gerenda 10x10x4000 cm')).toBeNull();  // hossz 40000 mm
  expect(p('Gerenda 10x10x20 cm')).toBeNull();    // hossz 200 mm
  expect(p('Léc 1x1x400 cm')).toBeNull();         // vastagság 10 mm
});

test('"m" suffix scales only the length', () => {
  expect(parseProduct({ name: 'Gerenda 10x10x4 m', url: 'u', price: 1000, unitText: 'db' }))
    .toMatchObject({ section: { t: 100, w: 100 }, length: 4000 });
});

test('unknown units and non-positive prices are rejected', () => {
  const p = (price: number, unitText: string) => parseProduct({ name: 'Huzalszeg 100mm 1kg', url: 'u', price, unitText });
  expect(p(1990, 'kg')).toBeNull();
  expect(p(1990, 'liter')).toBeNull();
  expect(p(0, 'db')).toBeNull();
  expect(p(-5, 'db')).toBeNull();
  expect(p(1990, 'szál')).toMatchObject({ unit: 'db' });
});
