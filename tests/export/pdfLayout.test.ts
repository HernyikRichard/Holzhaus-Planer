import { calculate } from '../../src/calc';
import { supplyFromPriceList } from '../../src/pricing/supply';
import { costOf, orderList } from '../../src/pricing/cost';
import { MATCH_FIXTURE } from '../fixtures/priceList';
import { formatFt } from '../../src/ui/format';
import { buildScene } from '../../src/scene/build';
import { createDefaultPlan } from '../../src/model/defaults';
import { cutSticks } from '../../src/app/lineElements';
import { costPageRows, CUT_PLAN_HEADER, cutPlanRows, DEFAULT_PALETTE, substituteCssVars, fitRect, paginateRows, type TableItem } from '../../src/export/pdfLayout';

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
  expect(rows.every(r => /^\d+(,\d)? cm$/.test(r[3]))).toBe(true);
  expect(rows.every(r => /^[\d,.]+ m × \d+$/.test(r[1]))).toBe(true);
  expect(rows.every(r => /^\d+(,\d)?( \+ \d+(,\d)?)* cm$/.test(r[2]))).toBe(true);
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

describe('costPageRows', () => {
  const pl = MATCH_FIXTURE;
  const plan = createDefaultPlan();
  const summary = costOf(plan, calculate(plan, supplyFromPriceList(pl)), pl);
  const ctx = { pickup: false, feeSet: false, freeAbove: pl.shipping.freeAbove };

  test('összesítő: végösszeg, Káplár/egyéb, szállítás, hiányzók', () => {
    const r = costPageRows(summary, ctx);
    const flat = r.summary.map(x => x.join(' ')).join('\n');
    expect(flat).toContain(formatFt(summary.total));
    expect(flat).toContain(`Káplár: ${formatFt(summary.kaplarSubtotal)}`);
    expect(flat).toContain('Szállítás');
    expect(r.missingNote).toBe(summary.missingCount > 0 ? `${summary.missingCount} tétel ára hiányzik, a végösszeg ezek nélkül értendő.` : null);
    expect(r.summary[r.summary.length - 1][0]).toBe('Végösszeg');
  });
  test('szállítás indoklása', () => {
    const ship = (c: typeof ctx, s = summary) => costPageRows(s, c).summary.find(x => x[0] === 'Szállítás')![1];
    expect(ship({ ...ctx, pickup: true })).toBe('személyes átvétel: 0 Ft');
    expect(ship({ ...ctx, feeSet: true })).toBe(formatFt(summary.shipping));
    expect(ship(ctx, { ...summary, shipping: 0, kaplarSubtotal: 600000 })).toBe(`ingyenes (${formatFt(500000)} felett)`);
    expect(ship(ctx, { ...summary, shipping: 14990, kaplarSubtotal: 1000 })).toBe(formatFt(14990));
  });
  test('kosár: sorok az orderList szerint, linkkel', () => {
    const r = costPageRows(summary, ctx);
    expect(r.cart.length).toBe(orderList(summary).length);
    for (const c of r.cart) {
      expect(c.url).toMatch(/^https:\/\//);
      expect(c.cells).toHaveLength(5);
      expect(c.cells[4]).toMatch(/\sFt$/);
    }
  });
  test('máshonnan: tájékoztató ár nélkül, hiányzó "nincs ár"', () => {
    const r = costPageRows(summary, ctx);
    const info = summary.lines.find(l => l.informational)!;
    const row = r.others.find(o => o.cells[0] === info.name)!;
    expect(row.cells[3]).toBe('tájékoztató');
    expect(row.cells[4]).toBe('');
    const miss = summary.lines.find(l => !l.informational && l.source === 'missing' && l.otherSource)!;
    expect(r.others.find(o => o.cells[0] === miss.name)!.cells[3]).toBe('nincs ár');
  });
  test('lábjegyzet: forrás és dátum', () => {
    expect(costPageRows(summary, ctx).footnote).toContain('Káplár Fatelep, 2026. 10. 01.');
  });
});
