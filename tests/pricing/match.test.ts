import { calculate } from '../../src/calc';
import type { MaterialLine } from '../../src/calc/types';
import { createDefaultPlan, DEFAULT_PRICING } from '../../src/model/defaults';
import type { Plan } from '../../src/model/types';
import { BUNDLED_PRICE_LIST } from '../../src/prices';
import { matchLine } from '../../src/pricing/match';
import { supplyFromPriceList } from '../../src/pricing/supply';
import { MATCH_FIXTURE as PL } from '../fixtures/priceList';

const supply = supplyFromPriceList(PL);
function setup(mut?: (p: Plan) => void): { plan: Plan; line: (id: string) => MaterialLine } {
  const plan = createDefaultPlan();
  mut?.(plan);
  const out = calculate(plan, supply);
  return { plan, line: id => out.lines.find(l => l.id === id)! };
}

describe('matchLine', () => {
  it('faanyag: azonos szelvény és hossz, mennyiség szálban', () => {
    const { plan, line } = setup();
    const l = line('timber.Fal.50x100.4000');
    expect(l).toBeDefined();
    expect(matchLine(l, PL, plan)).toEqual({ productId: 'pallo-50x100-4000', qtyInProductUnit: l.quantity });
  });
  it('faanyag: nincs ilyen szelvény a listában -> hiányzó', () => {
    const { plan, line } = setup();
    const l = line('timber.Fal.24x48.3000');
    expect(l).toBeDefined();
    const m = matchLine(l, PL, plan);
    expect(m).toMatchObject({ missing: true });
    expect((m as { reason: string }).reason).toContain('kézi ár szükséges');
  });
  it('alapozás: mindig máshonnan', () => {
    const { plan, line } = setup();
    for (const id of ['foundation.cement', 'foundation.gravel', 'foundation.mesh', 'foundation.water', 'foundation.bed', 'foundation.peFoil', 'foundation.formwork']) {
      const m = matchLine(line(id), PL, plan);
      expect(m, id).toMatchObject({ missing: true, otherSource: true });
      expect((m as { reason: string }).reason).toContain('máshonnan');
    }
  });
  it('fali és belső OSB: vastagság szerint, 1:1 tábla', () => {
    const { plan, line } = setup();
    expect(matchLine(line('wall.osb'), PL, plan)).toEqual({ productId: 'osb-12', qtyInProductUnit: line('wall.osb').quantity });
    expect(matchLine(line('wall.interiorCladding'), PL, plan)).toEqual({ productId: 'osb-12', qtyInProductUnit: line('wall.interiorCladding').quantity });
  });
  it('padló OSB: csak nútféderes, a tervezett vastagságban', () => {
    const { plan, line } = setup(p => { p.floor.enabled = true; });
    expect(matchLine(line('floor.osb'), PL, plan)).toEqual({ productId: 'osb-18-nutfeder', qtyInProductUnit: line('floor.osb').quantity });
  });
  it('tető OSB: nem nútféderes tábla', () => {
    const { plan, line } = setup(p => { p.roof.layers.find(l => l.kind === 'decking')!.material = 'osb'; });
    expect(matchLine(line('roof.decking'), PL, plan)).toEqual({ productId: 'osb-12', qtyInProductUnit: line('roof.decking').quantity });
  });
  it('szigetelés: a kínálatból jött csomagméretnél 1:1', () => {
    const { plan, line } = setup();
    const l = line('wall.insulation');
    expect(l.unitM2).toBe(5.4);
    expect(matchLine(l, PL, plan)).toEqual({ productId: 'kozetgyapot-100', qtyInProductUnit: l.quantity });
  });
  it('szigetelés: más csomagméretű (kézzel választott) termék -> ⌈m² / csomag⌉', () => {
    const { plan, line } = setup(p => { p.pricing = { ...DEFAULT_PRICING, productChoice: { 'wall.insulation': 'kozetgyapot-100-b' } }; });
    const l = line('wall.insulation');
    expect(matchLine(l, PL, plan)).toEqual({ productId: 'kozetgyapot-100-b', qtyInProductUnit: Math.ceil(l.needM2! / 6 - 1e-9) });
  });
  it('fóliák: csak tekercsméretes termék, a takarófólia kizárva; páraáteresztő nincs -> hiányzó', () => {
    const { plan, line } = setup(p => { p.floor.enabled = true; });
    expect(matchLine(line('wall.vaporBarrier'), PL, plan)).toMatchObject({ productId: 'foil-parazaro-60' });
    expect(matchLine(line('floor.vaporBarrier'), PL, plan)).toMatchObject({ productId: 'foil-parazaro-60' });
    expect(matchLine(line('wall.breatherMembrane'), PL, plan)).toMatchObject({ missing: true });
  });
  it('trapézlemez: a polikarbonát kizárva, db = ⌈m² / lemezterület⌉', () => {
    const { plan, line } = setup(p => { p.roof.covering = 'trapezoid'; });
    const l = line('roof.trapezoid');
    expect(matchLine(l, PL, plan)).toEqual({ productId: 'trapez-t18', qtyInProductUnit: Math.ceil(l.needM2! / 2.36 - 1e-9) });
  });
  it('zsindely: a kezdőelem és a ragasztó kizárva, csomag 1:1 azonos méretnél', () => {
    const { plan, line } = setup(p => { p.roof.covering = 'shingle'; });
    const l = line('roof.shingles');
    expect(matchLine(l, PL, plan)).toEqual({ productId: 'zsindely-3', qtyInProductUnit: l.quantity });
  });
  it('cserép: nincs a listában -> hiányzó', () => {
    const { plan, line } = setup();
    expect(matchLine(line('roof.tiles'), PL, plan)).toMatchObject({ missing: true });
  });
  it('doboz sor: a secondary-ból kiolvasott darabszámból, boxQty szerint', () => {
    const pl = { ...PL, products: [...PL.products, {
      id: 'csavar-5x90', name: 'Reisser facsavar 5x90mm (200db/doboz)', url: 'u', kind: 'fastener' as const, unit: 'doboz' as const, price: 5000, boxQty: 200,
    }] };
    const { plan } = setup();
    const l: MaterialLine = { id: 'fix.frameScrews', category: 'Kötőelemek', name: 'Vázszerkezeti csavar', quantity: 3, unit: 'doboz', secondary: '450 db', explanation: '' };
    expect(matchLine(l, pl, plan)).toEqual({ productId: 'csavar-5x90', qtyInProductUnit: 3 });
    expect(matchLine({ ...l, secondary: '401 db' }, pl, plan)).toEqual({ productId: 'csavar-5x90', qtyInProductUnit: 3 });
    expect(matchLine({ ...l, secondary: undefined }, pl, plan)).toMatchObject({ missing: true });
  });
  it('kézi termékválasztás felülírja a szabályt', () => {
    const { plan, line } = setup(p => { p.pricing = { ...DEFAULT_PRICING, productChoice: { 'wall.osb': 'osb-12-b' } }; });
    expect(matchLine(line('wall.osb'), PL, plan)).toMatchObject({ productId: 'osb-12-b' });
  });
  it('eltűnt kézi termék: szabály szerinti párosítás, jelzővel', () => {
    const { plan, line } = setup(p => { p.pricing = { ...DEFAULT_PRICING, productChoice: { 'wall.osb': 'nincs-ilyen' } }; });
    expect(matchLine(line('wall.osb'), PL, plan)).toMatchObject({ productId: 'osb-12', choiceGone: true });
  });
});

describe('beépített árlista', () => {
  it('a 50×100, 50×150 és 30×50 faanyag-sorok mind kapnak Káplár-terméket', () => {
    const pl = BUNDLED_PRICE_LIST!;
    const plan = createDefaultPlan();
    const out = calculate(plan, supplyFromPriceList(pl));
    const timber = out.lines.filter(l => /^timber\.[^.]+\.(50x100|50x150|30x50)\./.test(l.id));
    expect(timber.length).toBeGreaterThan(0);
    for (const l of timber) expect(matchLine(l, pl, plan), l.id).toHaveProperty('productId');
  });
});
