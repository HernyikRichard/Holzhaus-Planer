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
    const c = plain.lines.find(l => l.lineId === 'foundation.cementBags')!;
    expect(c).toMatchObject({ source: 'missing', otherSource: true });
    expect(c.reason).toContain('máshonnan');
    const priced = cost(withPricing(createDefaultPlan(), { custom: { 'foundation.cementBags': 100 } }));
    const c2 = priced.lines.find(l => l.lineId === 'foundation.cementBags')!;
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

  it('a kézi áras Káplár-termék is a kosárban és a Káplár-részösszegben van', () => {
    const id = 'timber.Fal.50x100.4000';
    const base = cost(createDefaultPlan());
    const s = cost(withPricing(createDefaultPlan(), { overrides: { [id]: 1 } }));
    const l = s.lines.find(x => x.lineId === id)!;
    expect(l.source).toBe('override');
    expect(l.productId).toBe('pallo-50x100-4000');
    const row = orderList(s).find(r => r.productId === 'pallo-50x100-4000')!;
    expect(row).toMatchObject({ qty: l.qty, unitPrice: 1, total: l.qty });
    const old = base.lines.find(x => x.lineId === id)!;
    expect(s.kaplarSubtotal).toBe(base.kaplarSubtotal - old.total! + l.total!);
    expect(s.otherSubtotal).toBe(base.otherSubtotal);
  });

  it('azonos termék különböző egységáron: mennyiség és összeg összeadva, az egységár súlyozott átlag', () => {
    const plan = withPricing(createDefaultPlan(), { overrides: { 'wall.osb': 5000 } });
    const s = cost(plan);
    const a = s.lines.find(l => l.lineId === 'wall.osb')!;
    const b = s.lines.find(l => l.lineId === 'wall.interiorCladding')!;
    expect(a.unitPrice).toBe(5000);
    expect(b.unitPrice).toBe(1000);
    const row = orderList(s).find(r => r.productId === 'osb-12')!;
    expect(row.qty).toBe(a.qty + b.qty);
    expect(row.total).toBe(a.total! + b.total!);
    expect(row.unitPrice).toBe(Math.round(row.total / row.qty));
    expect(row.unitPrice).not.toBe(1000);
  });

  it('szállítás: határ, személyes átvétel, átírt díj', () => {
    const sh = { fee: 14990, freeAbove: 500000 };
    expect(shippingCost(499999, { pickup: false }, sh)).toBe(14990);
    expect(shippingCost(500000, { pickup: false }, sh)).toBe(0);
    expect(shippingCost(499999, { pickup: true }, sh)).toBe(0);
    expect(shippingCost(499999, { pickup: false, shippingFee: 9000 }, sh)).toBe(9000);
    expect(shippingCost(600000, { pickup: false, shippingFee: 9000 }, sh)).toBe(9000);
    expect(shippingCost(100, { pickup: true, shippingFee: 9000 }, sh)).toBe(0);
    expect(shippingCost(0, { pickup: false }, sh)).toBe(0);
    expect(shippingCost(0, { pickup: false, shippingFee: 9000 }, sh)).toBe(0);
    expect(shippingCost(1, { pickup: false }, sh)).toBe(14990);
    expect(shippingCost(1, { pickup: false, shippingFee: 9000 }, sh)).toBe(9000);
  });

  it('a végösszeg egész forint, a hiányzók száma stimmel', () => {
    const s = cost(createDefaultPlan());
    expect(Number.isInteger(s.total)).toBe(true);
    expect(s.missingCount).toBe(s.lines.filter(l => l.source === 'missing' && !l.informational).length);
    expect(s.missingCount).toBeGreaterThan(0);
    const sum = s.lines.reduce((a, l) => a + (l.total ?? 0), 0);
    expect(s.kaplarSubtotal + s.otherSubtotal).toBe(sum);
    expect(s.total).toBe(sum + s.shipping);
    expect(Object.values(s.byCategory).reduce((a, b) => a + b, 0)).toBe(sum);
    expect(s.priceDate).toBe('2026-10-01');
    for (const l of s.lines) if (l.total !== undefined) expect(Number.isInteger(l.total)).toBe(true);
  });

  it('tört forintos kézi ár is egész sorösszeget ad', () => {
    const s = cost(withPricing(createDefaultPlan(), { custom: { 'foundation.cementBags': 12.5 } }));
    const c = s.lines.find(l => l.lineId === 'foundation.cementBags')!;
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

describe('helyettesítő termék és tetődeszka a költségsorban', () => {
  it('a helyettesítő figyelmeztetés és a deszka-átváltás a költségsoron is látszik', () => {
    const pl = BUNDLED_PRICE_LIST!;
    const plan = createDefaultPlan();
    const s = costOf(plan, calculate(plan, supplyFromPriceList(pl)), pl);
    const lec = s.lines.find(l => l.lineId.startsWith('timber.Fal.24x48.'))!;
    expect(lec.source).toBe('kaplar');
    expect(lec.warning).toBe('Helyettesítő termék: 23×48 (a tervezett 24×48 helyett)');
    const deck = s.lines.find(l => l.lineId === 'roof.decking')!;
    expect(deck).toMatchObject({ source: 'kaplar', unit: 'szál' });
    expect(deck.note).toMatch(/^Deszka: 21,1 m² \/ \(0,15 m × 6 m\) = [\d,]+ → \d+ szál$/);
  });
});

describe('nem szükséges toldó', () => {
  it('tájékoztató sor: nem hiányzó, nem máshonnan beszerzendő, az okkal', () => {
    const pl = BUNDLED_PRICE_LIST!;
    const plan = createDefaultPlan();
    const s = costOf(plan, calculate(plan, supplyFromPriceList(pl)), pl);
    const j = s.lines.find(l => l.lineId === 'acc.gutterJoiners')!;
    expect(j).toMatchObject({ informational: true, otherSource: false, source: 'missing', reason: 'A választott 6 m-es ereszcsatornához nem kell toldó' });
    expect(j.total).toBeUndefined();
    expect(s.lines.filter(l => !l.informational && l.source === 'missing').length).toBe(s.missingCount);
  });
});

describe('informational foundation lines', () => {
  const ids = ['foundation.concrete', 'foundation.cement', 'foundation.water'];
  it('beton, cement és víz tájékoztató: nincs ár, nem hiányzó, nincs a végösszegben', () => {
    const plan = createDefaultPlan();
    const base = cost(plan);
    for (const id of ids) {
      const l = base.lines.find(x => x.lineId === id)!;
      expect(l.informational).toBe(true);
      expect(l.total).toBeUndefined();
      expect(l.unitPrice).toBeUndefined();
    }
    const out = calculate(plan, supply);
    const foundationIds = out.lines.filter(l => l.id.startsWith('foundation.')).map(l => l.id);
    const custom = Object.fromEntries(foundationIds.map(id => [id, 100]));
    const priced = cost(withPricing(plan, { custom }));
    const counted = priced.lines.filter(l => l.lineId.startsWith('foundation.') && l.total !== undefined).map(l => l.lineId).sort();
    const expected = foundationIds.filter(id => !ids.includes(id)).sort();
    expect(counted).toEqual(expected);
    expect(priced.byCategory.Alap).toBe(priced.lines.filter(l => l.category === 'Alap').reduce((a, l) => a + (l.total ?? 0), 0));
    // elavult kézi ár a tájékoztató soron sem számít
    expect(priced.lines.find(l => l.lineId === 'foundation.concrete')!.total).toBeUndefined();
  });
  it('az alapértelmezett terv hiányzó darabszáma 3-mal kevesebb', () => {
    const plan = createDefaultPlan();
    const s = cost(plan);
    const infoMissing = s.lines.filter(l => l.informational).length;
    expect(infoMissing).toBe(3);
    expect(s.missingCount).toBe(s.lines.filter(l => l.total === undefined).length - 3);
  });
});

describe('állókorcos alumíniumlemez ára', () => {
  it('ár nélkül hiányzó, kézi árral custom', () => {
    const seam = (x: Partial<NonNullable<Plan['pricing']>> = {}): Plan => {
      const p = withPricing(createDefaultPlan(), x); p.roof = { ...p.roof, covering: 'standingSeam' }; return p;
    };
    const miss = cost(seam()).lines.find(l => l.lineId === 'roof.standingSeam')!;
    expect(miss.source).toBe('missing');
    const priced = cost(seam({ custom: { 'roof.standingSeam': 12000 } })).lines.find(l => l.lineId === 'roof.standingSeam')!;
    expect(priced).toMatchObject({ source: 'custom', unitPrice: 12000, total: 20 * 12000 });
  });
});
