import { calculate } from '../../src/calc';
import { buildScene } from '../../src/scene/build';
import { createDefaultPlan, DEFAULT_PRICING } from '../../src/model/defaults';
import { supplyFor, supplyFromPriceList } from '../../src/pricing/supply';
import { BUNDLED_PRICE_LIST } from '../../src/prices';
import { FIXTURE } from '../fixtures/priceList';

describe('supplyFromPriceList', () => {
  const s = supplyFromPriceList(FIXTURE);
  it('szálhosszak rendezve, hiányzó keresztmetszet null', () => {
    expect(s.stockLengths('Fal', { t: 50, w: 100 })).toEqual([4000, 6000]);
    expect(s.stockLengths('Tető', { t: 100, w: 50 })).toEqual([4000, 6000]);
    expect(s.stockLengths('Fal', { t: 24, w: 48 })).toBeNull();
  });
  it('OSB, nútféderes OSB, szigetelés, fólia, kötőelem', () => {
    expect(s.osbSheet(12)).toEqual({ w: 1250, l: 2500 });
    expect(s.osbSheet(18)).toBeNull();
    expect(s.osbTgSheet(18)).toEqual({ w: 675, l: 2500 });
    expect(s.osbTgSheet(12)).toBeNull();
    expect(s.insulationPack('mineralWool', 100)).toBe(5.4);
    expect(s.insulationPack('xps', 100)).toBeNull();
    expect(s.foilRoll('vapor')).toBe(60);
    expect(s.foilRoll('breather')).toBeNull();
    expect(s.fastenerBox('frameScrew')).toBeNull();
  });
  it('a beépített árlistából is ad szálhosszat és csomagméretet', () => {
    const b = supplyFromPriceList(BUNDLED_PRICE_LIST!);
    expect(b.stockLengths('Fal', { t: 50, w: 100 })).toEqual([2000, 3000, 4000, 5000, 6000]);
    expect(b.foilRoll('breather')).toBe(75);
  });
  it('pontos szelvény hiányában a legközelebbi (oldalanként ≤ 2 mm) helyettesítő hosszai', () => {
    const b = supplyFromPriceList(BUNDLED_PRICE_LIST!);
    expect(b.stockLengths('Fal', { t: 24, w: 48 })).toEqual([4000]); // 23×48
    expect(b.stockLengths('Tető', { t: 50, w: 50 })).toEqual([4000]); // 48×48
    expect(b.stockLengths('Kiegészítők', { t: 24, w: 150 })).toEqual([4000, 5000, 6000]); // 25×150 (több hossz, mint 23×150)
    expect(b.stockLengths('Fal', { t: 24, w: 60 })).toBeNull();
  });
  it('a pontos szelvény mindig nyer a helyettesítővel szemben', () => {
    const pl = { ...FIXTURE, products: [...FIXTURE.products,
      { id: 'x-49x100-5000', name: 'x', url: 'u', kind: 'timber' as const, unit: 'db' as const, price: 1, section: { t: 49, w: 100 }, length: 5000 }] };
    expect(supplyFromPriceList(pl).stockLengths('Fal', { t: 50, w: 100 })).toEqual([4000, 6000]);
    expect(supplyFromPriceList(pl).stockLengths('Fal', { t: 51, w: 100 })).toEqual([4000, 6000]); // 50×100: 1 mm, 49×100: 2 mm
  });
});

describe('supplyFor', () => {
  it('useSupply hamis vagy nincs árlista esetén undefined', () => {
    const p = { ...createDefaultPlan(), pricing: { ...DEFAULT_PRICING, useSupply: false } };
    expect(supplyFor(p, FIXTURE)).toBeUndefined();
    expect(supplyFor(createDefaultPlan(), null)).toBeUndefined();
    expect(supplyFor(createDefaultPlan(), FIXTURE)).toBeDefined();
    expect(supplyFor(createDefaultPlan())).toBeDefined();
  });
});

describe('calculate kínálattal', () => {
  test('timber lines use supplied lengths', () => {
    const out = calculate(createDefaultPlan(), supplyFromPriceList(FIXTURE));
    const lines = out.lines.filter(l => l.id.startsWith('timber.Fal.50x100.'));
    expect(lines.length).toBeGreaterThan(0);
    const lens = lines.map(l => Number(l.id.split('.').pop()));
    expect(lens.every(x => x === 4000 || x === 6000)).toBe(true);
  });
  test('missing section warns', () => {
    const out = calculate(createDefaultPlan(), supplyFromPriceList(FIXTURE));
    expect(out.lines.find(l => l.id.startsWith('timber.Fal.24x48'))!.warnings!.join())
      .toBe('Nincs Káplár-termék ilyen méretben (24×48), katalógusértékkel számoltunk.');
  });
  test('insulation pack from supply', () => {
    const out = calculate(createDefaultPlan(), supplyFromPriceList(FIXTURE));
    expect(out.lines.find(l => l.id === 'wall.insulation')!.explanation).toContain('5,4');
  });
  test('missing supply warns on the affected non-timber line, keeps catalog value', () => {
    const plan = createDefaultPlan();
    const out = calculate(plan, supplyFromPriceList(FIXTURE));
    const osb = out.lines.find(l => l.id === 'wall.osb')!;
    expect(osb.warnings ?? []).toEqual([]); // 12 mm OSB van a fixture-ben
    const breather = out.lines.find(l => l.id === 'wall.breatherMembrane')!;
    expect(breather.warnings!.join()).toMatch(/Nincs Káplár-termék ilyen méretben \(páraáteresztő fólia\)/);
    expect(breather.explanation).toContain('75 m²');
    const vapor = out.lines.find(l => l.id === 'wall.vaporBarrier')!;
    expect(vapor.explanation).toContain('60 m²');
  });
  test('a szálhosszak a beállítás hosszaival metszve (alapból 3–6 m: nincs 7 m-es szál)', () => {
    const plan = createDefaultPlan();
    const out = calculate(plan, supplyFromPriceList(BUNDLED_PRICE_LIST!));
    const lens = out.lines.filter(l => l.id.startsWith('timber.')).map(l => Number(l.id.split('.').pop()));
    expect(lens.length).toBeGreaterThan(0);
    for (const x of lens) expect(plan.settings.stockLengths).toContain(x);
    expect(out.lines.some(l => /^timber\.[^.]+\.50x150\.6000$/.test(l.id))).toBe(true);
  });
  test('üres metszetnél a kínálat hosszai maradnak', () => {
    const plan = createDefaultPlan();
    plan.settings.stockLengths = [2500];
    const out = calculate(plan, supplyFromPriceList(FIXTURE));
    const lens = out.lines.filter(l => l.id.startsWith('timber.Fal.50x100.')).map(l => Number(l.id.split('.').pop()));
    expect(lens.length).toBeGreaterThan(0);
    for (const x of lens) expect([4000, 6000]).toContain(x);
  });
  test('useSupply false keeps snapshots', () => {
    const p = { ...createDefaultPlan(), pricing: { ...DEFAULT_PRICING, useSupply: false } };
    expect(calculate(p, supplyFor(p, FIXTURE))).toEqual(calculate(createDefaultPlan()));
  });
  test('no supply equals today', () => {
    expect(calculate(createDefaultPlan(), undefined)).toEqual(calculate(createDefaultPlan()));
  });
});

describe('buildScene kínálattal', () => {
  test('scene cut uses supplied lengths', () => {
    const sc = buildScene(createDefaultPlan(), supplyFromPriceList(FIXTURE));
    expect(Object.values(sc.cut).filter(c => [4000, 6000, 3000, 5000].includes(c.stockLength)).length).toBeGreaterThan(0);
  });
  test('50x100 cuts use only supplied lengths', () => {
    const plan = createDefaultPlan();
    const sc = buildScene(plan, supplyFromPriceList(FIXTURE));
    const ids50x100 = sc.elements.filter(e => e.group.startsWith('wall') && e.section?.t === 50 && e.section?.w === 100).map(e => e.id);
    expect(ids50x100.length).toBeGreaterThan(0);
    for (const id of ids50x100) if (sc.cut[id]) expect([4000, 6000]).toContain(sc.cut[id].stockLength);
  });
  test('the scene cut plan uses the same intersected lengths as the material list', () => {
    const plan = createDefaultPlan();
    const sc = buildScene(plan, supplyFromPriceList(BUNDLED_PRICE_LIST!));
    const stocks = Object.values(sc.cut).map(c => c.stockLength);
    expect(stocks.length).toBeGreaterThan(0);
    for (const x of stocks) expect(plan.settings.stockLengths).toContain(x);
  });
});
