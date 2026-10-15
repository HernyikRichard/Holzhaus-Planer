import { calculate } from '../../src/calc';
import { createDefaultPlan } from '../../src/model/defaults';
import { supplyFromPriceList } from '../../src/pricing/supply';
import { costOf, orderList } from '../../src/pricing/cost';
import { MATCH_FIXTURE } from '../fixtures/priceList';
import { toCsv, toOrderCsv } from '../../src/export/csv';
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

describe('költséges CSV', () => {
  const pl = MATCH_FIXTURE;
  const plan = createDefaultPlan();
  const output = calculate(plan, supplyFromPriceList(pl));
  const summary = costOf(plan, output, pl);

  test('toCsv a költségoszlopokkal: fejléc és egész Ft-os sor', () => {
    const csv = toCsv(output.lines, summary);
    const rows = csv.split('\r\n');
    expect(rows[0]).toBe('﻿Kategória;Anyag;Mennyiség;Egység;Kiegészítő;Számítás;Egységár;Összeg;Forrás;Káplár-termék');
    const cl = summary.lines.find(l => l.source === 'kaplar')!;
    const row = rows.find(r => r.includes(`;${cl.unitPrice};${cl.total};Káplár;`))!;
    expect(row).toBeDefined();
    expect(row.endsWith(`;${cl.productName}`) || row.endsWith(`;"${cl.productName}"`)).toBe(true);
    expect(csv).not.toMatch(/;\d+,\d+;(Káplár|kézi|egyéni);/);
  });
  test('forrásértékek: nincs ár és tájékoztató üres árral', () => {
    const csv = toCsv(output.lines, summary);
    const info = summary.lines.find(l => l.informational)!;
    const missing = summary.lines.find(l => !l.informational && l.source === 'missing')!;
    const rowOf = (id: string) => csv.split('\r\n')[1 + output.lines.findIndex(l => l.id === id)];
    expect(rowOf(info.lineId)).toMatch(/;;;tájékoztató;$/);
    expect(rowOf(missing.lineId)).toMatch(/;;;nincs ár;$/);
  });
  test('forrás: kézi és egyéni', () => {
    const p = createDefaultPlan();
    const base = costOf(p, calculate(p, supplyFromPriceList(pl)), pl);
    const kap = base.lines.find(l => l.source === 'kaplar')!;
    const miss = base.lines.find(l => !l.informational && l.source === 'missing')!;
    const p2 = { ...p, pricing: { ...p.pricing, overrides: { [kap.lineId]: 1234 }, custom: { [miss.lineId]: 99 } } };
    const out2 = calculate(p2, supplyFromPriceList(pl));
    const csv = toCsv(out2.lines, costOf(p2, out2, pl));
    expect(csv).toContain(';1234;');
    expect(csv).toMatch(/;kézi;/);
    expect(csv).toMatch(/;99;\d+;egyéni;;?/);
  });
  test('toCsv költség nélkül változatlan', () => {
    expect(toCsv(output.lines).split('\r\n')[0]).toBe('﻿Kategória;Anyag;Mennyiség;Egység;Kiegészítő;Számítás');
  });
  test('toOrderCsv: fejléc, sorok száma, összesen sor', () => {
    const csv = toOrderCsv(summary);
    const rows = csv.split('\r\n');
    expect(rows[0]).toBe('﻿Termék;Mennyiség;Egység;Egységár;Összeg;Link');
    expect(csv.endsWith('\r\n')).toBe(true);
    const n = orderList(summary).length;
    expect(rows.length).toBe(1 + n + 1 + 1); // fejléc + sorok + összesen + záró üres
    expect(rows[1 + n]).toBe(`Összesen;;;;${summary.kaplarSubtotal};`);
    const first = orderList(summary)[0];
    expect(rows[1]).toContain(`;${first.unitPrice};${first.total};${first.url}`);
  });
});
