import { buildScene } from '../../src/scene/build';
import { createDefaultPlan } from '../../src/model/defaults';
import { cutSticks } from '../../src/app/lineElements';
import { CUT_PLAN_HEADER, cutPlanRows, DEFAULT_PALETTE, substituteCssVars, fitRect, paginateRows, type TableItem } from '../../src/export/pdfLayout';

test('substituteCssVars replaces known variables with palette values', () => {
  const svg = '<rect fill="var(--fill-wood)" stroke="var(--line)"/><text fill="var(--line)">x</text>';
  const out = substituteCssVars(svg, { '--line': '#000000', '--fill-wood': '#d9b27c' });
  expect(out).toBe('<rect fill="#d9b27c" stroke="#000000"/><text fill="#000000">x</text>');
});

test('substituteCssVars falls back to the default palette for missing values', () => {
  const out = substituteCssVars('<rect fill="var(--opening)"/>', {});
  expect(out).toContain(DEFAULT_PALETTE['--opening']);
  expect(out).not.toContain('var(');
});

test('substituteCssVars uses the css fallback or black for unknown variables', () => {
  expect(substituteCssVars('fill="var(--nope, #123456)"', {})).toBe('fill="#123456"');
  expect(substituteCssVars('fill="var(--nope)"', {})).toBe('fill="#000000"');
});

test('substituteCssVars replaces the generic sans-serif font family', () => {
  const out = substituteCssVars('<svg font-family="sans-serif"></svg>', {}, 'DejaVuSans');
  expect(out).toBe('<svg font-family="DejaVuSans"></svg>');
});

test('fitRect scales proportionally into the box and centres it', () => {
  expect(fitRect(200, 100, 100, 100, 10, 20)).toEqual({ x: 10, y: 45, width: 100, height: 50 });
  expect(fitRect(100, 200, 100, 100, 0, 0)).toEqual({ x: 25, y: 0, width: 50, height: 100 });
});

const sub = (h: number): TableItem => ({ kind: 'subtitle', height: h });
const row = (h: number): TableItem => ({ kind: 'row', height: h });

test('paginateRows puts everything on one page when it fits', () => {
  expect(paginateRows([sub(5), row(5), row(5)], 100, 10)).toEqual([[0, 1, 2]]);
});

test('paginateRows breaks pages by capacity (header height is reserved on every page)', () => {
  // kapacitás 30, fejléc 10 -> 20 hely/oldal
  const items = [row(8), row(8), row(8), row(8), row(8)];
  expect(paginateRows(items, 30, 10)).toEqual([[0, 1], [2, 3], [4]]);
});

test('paginateRows keeps a subtitle together with its first row', () => {
  const items = [row(8), row(8), sub(5), row(8), row(8)];
  // 1. oldal: 8+8=16, az alcím (5) + első sor (8) nem fér (16+13>20) -> az alcím is átkerül
  expect(paginateRows(items, 30, 10)).toEqual([[0, 1], [2, 3], [4]]);
});

test('paginateRows allows an oversize row on its own page without looping forever', () => {
  expect(paginateRows([row(50), row(5)], 30, 10)).toEqual([[0], [1]]);
});

test('paginateRows returns no pages for no items', () => {
  expect(paginateRows([], 100, 10)).toEqual([]);
});

test('cutPlanRows: 4 columns, grouped identical sticks, remainder in cm', () => {
  const scene = buildScene(createDefaultPlan());
  expect(CUT_PLAN_HEADER).toEqual(['Keresztmetszet', 'Szál', 'Darabok', 'Maradék']);
  const rows = cutPlanRows(scene);
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every(r => r.length === 4)).toBe(true);
  expect(rows.every(r => /^\d+ cm$/.test(r[3]))).toBe(true);
  expect(rows.every(r => /^[\d,.]+ m × \d+$/.test(r[1]))).toBe(true);
  expect(rows.every(r => /^\d+( \+ \d+)* cm$/.test(r[2]))).toBe(true);
  const keys = rows.map(r => [r[0], r[1].split(" × ")[0], r[2], r[3]].join("|"));
  expect(new Set(keys).size).toBe(keys.length);
  expect(rows[0][0]).toMatch(/ (mm|cm)$/);
  // a szálak összege egyezik a vágási terv szálszámával
  const total = rows.reduce((a, r) => a + Number(r[1].split('×')[1]), 0);
  expect(total).toBe(cutSticks(scene).length);
});

test('substituteCssVars maps the standalone SVG font family too', () => {
  const out = substituteCssVars('<svg font-family="DejaVu Sans, sans-serif"></svg>', {}, 'DejaVuSans');
  expect(out).toBe('<svg font-family="DejaVuSans"></svg>');
});
