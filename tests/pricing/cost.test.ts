import { calculate } from '../../src/calc';
import { createDefaultPlan, DEFAULT_PRICING } from '../../src/model/defaults';
import type { Plan } from '../../src/model/types';
import { BUNDLED_PRICE_LIST } from '../../src/prices';
import { costOf, orderList, shippingCost } from '../../src/pricing/cost';
import { supplyFromPriceList } from '../../src/pricing/supply';
import { MATCH_FIXTURE as PL } from '../fixtures/priceList';

const supply = supplyFromPriceList(PL);
const cost = (plan: Plan) => costOf(plan, calculate(plan, supply), PL);
const withPricing = (p: Plan, x: Partial<NonNullable<Plan['pricing']>>): Plan => ({ ...p, pricing: { ...DEFAULT_PRICING, ...x } });

describe('costOf', () => {
  it('faanyag-sor: pontos termék, mennyiség a sor darabszáma, sorösszeg kerekítve', () => {
    const s = cost(createDefaultPlan());
    const l = s.lines.find(x => x.lineId === 'timber.Fal.50x100.4000')!;
    expect(l).toMatchObject({ productId: 'pallo-50x100-4000', source: 'kaplar', unit: 'szál', unitPrice: 1000 });
    expect(l.total).toBe(Math.round(l.qty * 1000));
    expect(l.url).toBe('https://kaplarfatelep.hu/pallo-50x100-4000');
  });

  it('alapozási sorok máshonnan: nincs ár -> missing, kézi ár -> custom, mindkettő otherSource', () => {
    const plain = cost(createDefaultPlan());
    const c = plain.lines.find(l => l.lineId === 'foundation.cement')!;
    expect(c).toMatchObject({ source: 'missing', otherSource: true });
    expect(c.reason).toContain('máshonnan');
    const priced = cost(withPricing(createDefaultPlan(), { custom: { 'foundation.cement': 100 } }));
    const c2 = priced.lines.find(l => l.lineId === 'foundation.cement')!;
    expect(c2).toMatchObject({ source: 'custom', otherSource: true, unitPrice: 100, total: Math.round(c2.qty * 100) });
  });

  it('ár elsőbbsége: override > káplár > custom > hiányzó', () => {
    const id = 'timber.Fal.50x100.4000';
    const get = (plan: Plan, lineId = id) => cost(plan).lines.find(l => l.lineId === lineId)!;
    expect(get(withPricing(createDefaultPlan(), { overrides: { [id]: 777 }, custom: { [id]: 555 } }))).toMatchObject({ source: 'override', unitPrice: 777 });
    expect(get(withPricing(createDefaultPlan(), { custom: { [id]: 555 } }))).toMatchObject({ source: 'kaplar', unitPrice: 1000 });
    const tid = 'timber.Fal.24x48.3000'; // nincs Káplár-termék
    expect(get(withPricing(createDefaultPlan(), { custom: { [tid]: 555 } }), tid)).toMatchObject({ source: 'custom', unitPrice: 555 });
    const miss = get(createDefaultPlan(), tid);
    expect(miss.source).toBe('missing');
    expect(miss.unitPrice).toBeUndefined();
    expect(miss.total).toBeUndefined();
  });

  it('a kosár összevonja az azonos terméket (fali OSB + belső OSB + tető OSB)', () => {
    const plan = createDefaultPlan();
    plan.roof.layers.find(l => l.kind === 'decking')!.material = 'osb';
    const s = cost(plan);
    const wall = s.lines.find(l => l.lineId === 'wall.osb')!;
    const inner = s.lines.find(l => l.lineId === 'wall.interiorCladding')!;
    const roof = s.lines.find(l => l.lineId === 'roof.decking')!;
    const rows = orderList(s).filter(r => r.productId === 'osb-12');
    expect(rows).toHaveLength(1);
    expect(rows[0].qty).toBe(wall.qty + inner.qty + roof.qty);
    expect(rows[0].total).toBe(wall.total! + inner.total! + roof.total!);
    expect(new Set(orderList(s).map(r => r.productId)).size).toBe(orderList(s).length);
  });

  it('a kosárba csak a Káplár-áras sorok kerülnek', () => {
    const id = 'timber.Fal.50x100.4000';
    const s = cost(withPricing(createDefaultPlan(), { overrides: { [id]: 1 } }));
    expect(s.lines.find(l => l.lineId === id)!.source).toBe('override');
    expect(orderList(s).some(r => r.productId === 'pallo-50x100-4000' && r.total === 1)).toBe(false);
  });

  it('szállítás: határ, személyes átvétel, átírt díj', () => {
    const sh = { fee: 14990, freeAbove: 500000 };
    expect(shippingCost(499999, { pickup: false }, sh)).toBe(14990);
    expect(shippingCost(500000, { pickup: false }, sh)).toBe(0);
    expect(shippingCost(499999, { pickup: true }, sh)).toBe(0);
    expect(shippingCost(499999, { pickup: false, shippingFee: 9000 }, sh)).toBe(9000);
    expect(shippingCost(600000, { pickup: false, shippingFee: 9000 }, sh)).toBe(9000);
    expect(shippingCost(100, { pickup: true, shippingFee: 9000 }, sh)).toBe(0);
  });

  it('a végösszeg egész forint, a hiányzók száma stimmel', () => {
    const s = cost(createDefaultPlan());
    expect(Number.isInteger(s.total)).toBe(true);
    expect(s.missingCount).toBe(s.lines.filter(l => l.source === 'missing').length);
    expect(s.missingCount).toBeGreaterThan(0);
    const sum = s.lines.reduce((a, l) => a + (l.total ?? 0), 0);
    expect(s.kaplarSubtotal + s.otherSubtotal).toBe(sum);
    expect(s.total).toBe(sum + s.shipping);
    expect(Object.values(s.byCategory).reduce((a, b) => a + b, 0)).toBe(sum);
    expect(s.priceDate).toBe('2026-10-01');
    for (const l of s.lines) if (l.total !== undefined) expect(Number.isInteger(l.total)).toBe(true);
  });

  it('tört forintos kézi ár is egész sorösszeget ad', () => {
    const s = cost(withPricing(createDefaultPlan(), { custom: { 'foundation.cement': 12.5 } }));
    const c = s.lines.find(l => l.lineId === 'foundation.cement')!;
    expect(c.total).toBe(Math.round(c.qty * 12.5));
  });

  it('a személyes átvétel és a kézi díj a végösszegben', () => {
    const base = cost(createDefaultPlan());
    expect(base.shipping).toBe(14990);
    expect(cost(withPricing(createDefaultPlan(), { pickup: true })).total).toBe(base.total - 14990);
    expect(cost(withPricing(createDefaultPlan(), { shippingFee: 9000 })).total).toBe(base.total - 14990 + 9000);
  });

  it('eltűnt kézi termék jelzője a költségsoron', () => {
    const s = cost(withPricing(createDefaultPlan(), { productChoice: { 'wall.osb': 'nincs' } }));
    expect(s.lines.find(l => l.lineId === 'wall.osb')).toMatchObject({ productId: 'osb-12', choiceGone: true });
  });
});

describe('beépített árlista, alaptervvel', () => {
  it('pozitív egész végösszeg, alapozás máshonnan', () => {
    const pl = BUNDLED_PRICE_LIST!;
    const plan = createDefaultPlan();
    const s = costOf(plan, calculate(plan, supplyFromPriceList(pl)), pl);
    expect(Number.isInteger(s.total)).toBe(true);
    expect(s.total).toBeGreaterThan(0);
    const timber = s.lines.filter(x => /^timber\.[^.]+\.(50x100|50x150|30x50)\./.test(x.lineId));
    expect(timber.length).toBeGreaterThan(0);
    for (const l of timber) expect(l.source, l.lineId).toBe('kaplar');
    const f = s.lines.filter(l => l.lineId.startsWith('foundation.'));
    expect(f.length).toBeGreaterThan(0);
    for (const l of f) expect(l.otherSource).toBe(true);
    expect(orderList(s).length).toBeGreaterThan(0);
  });
});
