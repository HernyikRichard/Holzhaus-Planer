import { calculate } from '../../src/calc';
import type { MaterialLine } from '../../src/calc/types';
import { createDefaultPlan, DEFAULT_PRICING } from '../../src/model/defaults';
import type { Plan } from '../../src/model/types';
import { BUNDLED_PRICE_LIST } from '../../src/prices';
import { gutterSystemKey, matchLine } from '../../src/pricing/match';
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
  it('trapézlemez: a polikarbonát kizárva, tábla = síkok × ⌈ereszhossz / hasznos szélesség⌉ × ⌈szarufahossz / (táblahossz − 150)⌉', () => {
    const { plan, line } = setup(p => { p.roof.covering = 'trapezoid'; });
    const l = line('roof.trapezoid');
    // 2 × ⌈4600 / 1127⌉ × ⌈2078 / 1850⌉ = 2 × 5 × 2
    expect(matchLine(l, PL, plan)).toEqual({ productId: 'trapez-t18', qtyInProductUnit: 20 });
  });
  it('trapézlemez: hasznos szélesség hiányában táblaszélesség − 53 mm; a méret a névből is jöhet', () => {
    const { plan, line } = setup(p => {
      p.roof.covering = 'trapezoid';
      p.pricing = { ...DEFAULT_PRICING, productChoice: { 'roof.trapezoid': 'trapez-polikarbonat' } };
    });
    const pl = { ...PL, products: PL.products.map(x => x.id === 'trapez-polikarbonat' ? { ...x, name: 'Trapéz Polikarbonát lemez 0,8mm (126x200cm)' } : x) };
    // 2 × ⌈4600 / (1260 − 53)⌉ × ⌈2078 / 1850⌉ = 2 × 4 × 2
    expect(matchLine(line('roof.trapezoid'), pl, plan)).toEqual({ productId: 'trapez-polikarbonat', qtyInProductUnit: 16 });
  });
  it('trapézlemez: ismeretlen táblaméret -> hiányzó, nem területből becsült', () => {
    const { plan, line } = setup(p => { p.roof.covering = 'trapezoid'; });
    const pl = { ...PL, products: PL.products.map(x => x.id === 'trapez-t18' ? { ...x, sheet: undefined, usefulWidth: undefined } : x) };
    const m = matchLine(line('roof.trapezoid'), pl, plan);
    expect(m).toMatchObject({ missing: true });
    expect((m as { reason: string }).reason).toBe('A trapézlemez táblamérete ismeretlen – kézi ár szükséges');
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

describe('csatornarendszer', () => {
  const g = (id: string, name: string, price: number) =>
    ({ id, name, url: 'u', kind: 'gutter' as const, unit: 'db' as const, price });
  const sysPl = {
    ...PL,
    products: [
      ...PL.products,
      // A rendszer: olcsóbb csatorna, de nincs végeleme
      g('a-cso', 'Ereszcsatorna 2m-es (25-ös)', 2000), g('a-tarto', 'Csatornatartó (25-ös)', 100),
      // B rendszer: kicsit drágább, teljes
      g('b-cso', 'Ereszcsatorna 2m-es (33-as)', 3000), g('b-veg', 'Ereszcsatorna véglemez (33)', 300),
      g('b-tarto', 'Csatornatartó (33-as)', 900), g('b-lefolyo', 'Lefolyócső 4m-es (33-as)', 4000),
      // C rendszer: Galeco PVC, az olcsó tartó nem keveredhet
      g('c-tarto', 'Galeco PVC (100) csatornatartó', 50), g('c-cso', 'Galeco PVC (100) ereszcsatorna 3fm/szál', 3600),
    ],
  };
  it('egy rendszerből választ: a teljes (végelemmel és tartóval) rendszer a legolcsóbb m-árú közül', () => {
    const plan = createDefaultPlan();
    plan.accessories.gutter = true; plan.accessories.downpipe = true;
    const out = calculate(plan, supply);
    const pick = (id: string) => matchLine(out.lines.find(l => l.id === id)!, sysPl, plan);
    expect(pick('acc.gutter')).toMatchObject({ productId: 'b-cso' });
    expect(pick('acc.gutterEnds')).toMatchObject({ productId: 'b-veg' });
    expect(pick('acc.gutterBrackets')).toMatchObject({ productId: 'b-tarto' });
    expect(pick('acc.downpipe')).toMatchObject({ productId: 'b-lefolyo' });
    const joiner = pick('acc.gutterJoiners');
    expect(joiner).toMatchObject({ missing: true });
    expect((joiner as { reason: string }).reason).toContain('A választott csatornarendszerben nincs ilyen elem');
    expect(pick('acc.downpipeClips')).toMatchObject({ missing: true });
  });
  it('csatornaszál: azonos m-árnál a leghosszabb; ereszenként ⌈ereszhossz / szálhossz⌉ szál, a toldó a választott szálhosszból', () => {
    const pl = { ...PL, products: [...PL.products,
      g('d-1', 'Ereszcsatorna 1m-es (33-as)', 1500), g('d-2', 'Ereszcsatorna 2m-es (33-as)', 3000),
      g('d-veg', 'Ereszcsatorna véglemez (33)', 300), g('d-tarto', 'Csatornatartó (33-as)', 900),
      g('d-toldo', 'Ereszcsatorna toldó (33-as)', 500)] };
    const plan = createDefaultPlan();
    const out = calculate(plan, supply);
    const pick = (id: string) => matchLine(out.lines.find(l => l.id === id)!, pl, plan);
    expect(pick('acc.gutter')).toEqual({ productId: 'd-2', qtyInProductUnit: 6, note: 'Ereszenként ⌈4,6 m / 2 m⌉ = 3 szál × 2 eresz = 6 szál' });
    expect(pick('acc.gutterJoiners')).toEqual({ productId: 'd-toldo', qtyInProductUnit: 4, note: 'Ereszenként ⌈4,6 m / 2 m⌉ − 1 = 2 toldó × 2 eresz = 4 db' });
    // kézzel választott 1 m-es csatornához a toldó is ehhez igazodik
    const chosen = { ...plan, pricing: { ...DEFAULT_PRICING, productChoice: { 'acc.gutter': 'd-1' } } };
    expect(matchLine(out.lines.find(l => l.id === 'acc.gutterJoiners')!, pl, chosen)).toMatchObject({ productId: 'd-toldo', qtyInProductUnit: 8 });
    expect(matchLine(out.lines.find(l => l.id === 'acc.gutter')!, pl, chosen)).toMatchObject({ productId: 'd-1', qtyInProductUnit: 10 });
  });
  it('rendszerkulcs: hazai sorozat és Galeco család', () => {
    expect(gutterSystemKey(g('x', 'Csatornatartó horganyzott egyenes (25-ös)', 1))).toBe('horg-25');
    expect(gutterSystemKey(g('x', 'Ereszcsatorna véglemez széles peremmel (33)', 1))).toBe('horg-33');
    expect(gutterSystemKey(g('x', 'Galeco PVC (125/80) lefolyócső 4fm/szál', 1))).toBe('galeco-pvc-125');
    expect(gutterSystemKey(g('x', 'Galeco Stal (150) ereszcsatorna 3fm/szál', 1))).toBe('galeco-stal');
    expect(gutterSystemKey(g('x', 'Galeco Stal, Metál (150) lefolyócső 1fm/szál', 1))).toBe('galeco-stal-metál');
  });
});

describe('bitumenes alátét', () => {
  it('Zsindely alátétlemezre párosítható, ha van az árlistában', () => {
    const pl = { ...PL, products: [...PL.products, { id: 'alatet-30', name: 'Zsindely alátétlemez (X)', url: 'u', kind: 'roofing' as const, unit: 'm²' as const, price: 1690, packM2: 30 }] };
    const plan = createDefaultPlan();
    plan.roof.layers.find(l => l.kind === 'underlay')!.material = 'bitumen';
    const l = calculate(plan, supply).lines.find(x => x.id === 'roof.underlay')!;
    const m = matchLine(l, pl, plan);
    expect(m).toMatchObject({ productId: 'alatet-30' });
    expect((m as { qtyInProductUnit: number }).qtyInProductUnit).toBe(Math.ceil(l.needM2! * 10 - 1e-9) / 10);
    expect(matchLine(l, PL, plan)).toMatchObject({ missing: true });
  });
});

describe('helyettesítő szelvény és tetődeszka', () => {
  const t = (id: string, t: number, w: number, length: number, price = 1000) =>
    ({ id, name: id, url: 'u', kind: 'timber' as const, unit: 'db' as const, price, section: { t, w }, length });
  it('faanyag: legközelebbi szelvény (≤ 2 mm), figyelmeztetéssel; pontos egyezés nyer', () => {
    const pl = { ...PL, products: [...PL.products, t('lec-23x48-4000', 23, 48, 4000), t('lec-28x48-4000', 28, 48, 4000)] };
    const { plan } = setup();
    const l: MaterialLine = { id: 'timber.Fal.24x48.4000', category: 'Fal', name: 'léc', quantity: 7, unit: 'szál', explanation: '' };
    expect(matchLine(l, pl, plan)).toEqual({
      productId: 'lec-23x48-4000', qtyInProductUnit: 7, warning: 'Helyettesítő termék: 23×48 (a tervezett 24×48 helyett)',
    });
    const exact = { ...pl, products: [...pl.products, t('lec-24x48-4000', 24, 48, 4000)] };
    expect(matchLine(l, exact, plan)).toEqual({ productId: 'lec-24x48-4000', qtyInProductUnit: 7 });
    expect(matchLine({ ...l, id: 'timber.Fal.24x48.5000' }, pl, plan)).toMatchObject({ missing: true });
  });
  it('tetődeszkázat (m²): deszka a leghosszabb hosszból, szál = ⌈m² / (szélesség × hossz)⌉', () => {
    const pl = { ...PL, products: [...PL.products, t('deszka-25x150-6000', 25, 150, 6000, 4000),
      t('deszka-25x150-4000', 25, 150, 4000, 2000), t('deszka-18x96-6000', 18, 96, 6000, 10)] };
    const { plan } = setup();
    const l: MaterialLine = { id: 'roof.decking', category: 'Tető', name: 'Tetődeszkázat', quantity: 21.1, unit: 'm²', explanation: '' };
    expect(matchLine(l, pl, plan)).toEqual({
      productId: 'deszka-25x150-6000', qtyInProductUnit: 24,
      note: 'Deszka: 21,1 m² / (0,15 m × 6 m) = 23,44 → 24 szál',
    });
    expect(matchLine(l, PL, plan)).toMatchObject({ missing: true });
  });
});

describe('beépített árlista', () => {
  it('ereszcsatorna az alaptervhez: 6 m-es szál ereszenként 1, toldó nem kell (tájékoztató)', () => {
    const pl = BUNDLED_PRICE_LIST!;
    const plan = createDefaultPlan();
    const out = calculate(plan, supplyFromPriceList(pl));
    const pick = (id: string) => matchLine(out.lines.find(l => l.id === id)!, pl, plan);
    expect(pick('acc.gutter')).toMatchObject({ productId: 'gutter-ereszcsatorna-6-meter-es-33-as', qtyInProductUnit: 2 });
    expect(pick('acc.gutterJoiners')).toEqual({ missing: true, informational: true, reason: 'A választott 6 m-es ereszcsatornához nem kell toldó' });
  });
  it('alapterv: a 24×48, 50×50, 24×150 és a tetődeszkázat is árazott, helyettesítő figyelmeztetéssel', () => {
    const pl = BUNDLED_PRICE_LIST!;
    const plan = createDefaultPlan();
    const out = calculate(plan, supplyFromPriceList(pl));
    const ids = out.lines.filter(l => /^timber\.[^.]+\.(24x48|50x50|24x150)\./.test(l.id) || l.id === 'roof.decking');
    expect(ids.length).toBeGreaterThanOrEqual(4);
    for (const l of ids) {
      const m = matchLine(l, pl, plan);
      expect(m, l.id).toHaveProperty('productId');
      if (l.id.startsWith('timber.')) expect((m as { warning?: string }).warning, l.id).toMatch(/^Helyettesítő termék: /);
    }
    const wall = out.lines.find(l => l.id.startsWith('timber.Fal.24x48.'))!;
    expect((matchLine(wall, pl, plan) as { warning: string }).warning).toBe('Helyettesítő termék: 23×48 (a tervezett 24×48 helyett)');
  });
  it('trapézlemez az alaptervhez: 1180×2000-es tábla, 20 db', () => {
    const pl = BUNDLED_PRICE_LIST!;
    const plan = createDefaultPlan();
    plan.roof.covering = 'trapezoid';
    const l = calculate(plan, supplyFromPriceList(pl)).lines.find(x => x.id === 'roof.trapezoid')!;
    const m = matchLine(l, pl, plan) as { productId: string; qtyInProductUnit: number };
    expect(pl.products.find(p => p.id === m.productId)).toMatchObject({ sheet: { w: 1180, l: 2000 }, usefulWidth: 1127 });
    expect(m.qtyInProductUnit).toBe(20);
  });
  it('a 50×100, 50×150 és 30×50 faanyag-sorok mind kapnak Káplár-terméket', () => {
    const pl = BUNDLED_PRICE_LIST!;
    const plan = createDefaultPlan();
    const out = calculate(plan, supplyFromPriceList(pl));
    const timber = out.lines.filter(l => /^timber\.[^.]+\.(50x100|50x150|30x50)\./.test(l.id));
    expect(timber.length).toBeGreaterThan(0);
    for (const l of timber) expect(matchLine(l, pl, plan), l.id).toHaveProperty('productId');
  });
});
