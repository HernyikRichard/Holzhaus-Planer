import { createDefaultPlan, DEFAULT_PRICING } from '../../src/model/defaults';
import { CURRENT_VERSION, MIGRATIONS, parsePlan, serializePlan } from '../../src/model/serialize';

test('roundtrip', () => {
  const p = createDefaultPlan(); p.name = 'Kerti ház';
  const r = parsePlan(serializePlan(p));
  expect(r).toEqual({ ok: true, plan: p });
});
test('serializePlan uses 2-space indentation', () => {
  expect(serializePlan(createDefaultPlan())).toContain('\n  "version": 2');
});
test('garbage and future versions are rejected with Hungarian messages', () => {
  expect(parsePlan('nem json')).toEqual({ ok: false, error: 'A fájl nem érvényes JSON.' });
  expect(parsePlan(JSON.stringify({ ...createDefaultPlan(), version: 99 }))).toEqual({
    ok: false,
    error: 'A fájl egy újabb programverzióval készült (v99), ezt a verziót nem tudom betölteni.',
  });
  expect(CURRENT_VERSION).toBe(2);
});
test('missing or invalid version is rejected', () => {
  const p: any = createDefaultPlan(); delete p.version;
  expect(parsePlan(JSON.stringify(p))).toEqual({ ok: false, error: 'A fájlból hiányzik a verziószám.' });
  expect(parsePlan(JSON.stringify({ ...createDefaultPlan(), version: 'x' })).ok).toBe(false);
  expect(parsePlan('[1]').ok).toBe(false);
  expect(parsePlan('null').ok).toBe(false);
});
test('missing fields are filled from defaults', () => {
  const p: any = createDefaultPlan(); delete p.accessories;
  const r = parsePlan(JSON.stringify(p));
  expect(r.ok && r.plan.accessories.gutter).toBe(true);
});
test('nested missing fields are filled and unknown keys dropped', () => {
  const p: any = createDefaultPlan(); delete p.building.wallHeight; p.extra = 1; p.building.zzz = 2;
  const r = parsePlan(JSON.stringify(p));
  expect(r.ok && r.plan.building).toEqual({ width: 3000, length: 4000, wallHeight: 2400 });
  expect(r.ok && (r.plan as any).extra).toBeUndefined();
});
test('arrays are taken from the file as-is', () => {
  const p = createDefaultPlan(); p.openings = []; p.settings.stockLengths = [2500];
  const r = parsePlan(serializePlan(p));
  expect(r.ok && r.plan.openings).toEqual([]);
  expect(r.ok && r.plan.settings.stockLengths).toEqual([2500]);
});
test('wrong types are rejected naming the field path', () => {
  const p: any = createDefaultPlan(); p.building.width = 'sok';
  const r = parsePlan(JSON.stringify(p));
  expect(r.ok).toBe(false);
  expect(!r.ok && r.error).toContain('building.width');
});
test('MIGRATIONS has exactly the v1 -> v2 step', () => {
  expect(Object.keys(MIGRATIONS)).toEqual(['1']);
});
test('v1 file migrates to v2 with default pricing', () => {
  const v1: any = createDefaultPlan(); delete v1.pricing; v1.version = 1; v1.name = 'Régi';
  const r = parsePlan(JSON.stringify(v1));
  expect(r.ok).toBe(true);
  if (r.ok) {
    expect(r.plan.version).toBe(2);
    expect(r.plan.pricing).toEqual(DEFAULT_PRICING);
    expect(r.plan.pricing).not.toBe(DEFAULT_PRICING);
    expect(r.plan.name).toBe('Régi');
  }
});
test('createDefaultPlan pricing is a fresh copy', () => {
  const a = createDefaultPlan(), b = createDefaultPlan();
  expect(a.pricing).toEqual(DEFAULT_PRICING);
  expect(a.pricing).not.toBe(DEFAULT_PRICING);
  expect(a.pricing.overrides).not.toBe(b.pricing.overrides);
});
test('pricing roundtrip keeps open-map keys and shippingFee', () => {
  const p = createDefaultPlan();
  p.pricing = { useSupply: false, overrides: { 'wall.osb': 1234 }, custom: { 'x.y': 0 },
    productChoice: { 'wall.osb': 'osb-12-b' }, pickup: true, shippingFee: 9000 };
  expect(parsePlan(serializePlan(p))).toEqual({ ok: true, plan: p });
});

describe('shape validation', () => {
  const bad = (mut: (p: any) => void, path: string) => {
    const p: any = createDefaultPlan(); mut(p);
    const r = parsePlan(JSON.stringify(p));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe(`Hibás érték: ${path}`);
  };
  test('openings with null element', () => bad(p => { p.openings = [null]; }, 'openings[0]'));
  test('opening missing wall', () => bad(p => { delete p.openings[0].wall; }, 'openings[0].wall'));
  test('unknown roof shape', () => bad(p => { p.roof.shape = 'foo'; }, 'roof.shape'));
  test('stockLengths zero', () => bad(p => { p.settings.stockLengths = [0]; }, 'settings.stockLengths'));
  test('empty stockLengths', () => bad(p => { p.settings.stockLengths = []; }, 'settings.stockLengths'));
  test('wall layer list missing a kind', () => bad(p => { p.walls.layers.pop(); }, 'walls.layers'));
  test('roof layer null', () => bad(p => { p.roof.layers = [null]; }, 'roof.layers[0]'));
  test('bad layer material', () => bad(p => { p.roof.layers[0].material = 'x'; }, 'roof.layers[0].material'));
  test('negative override', () => bad(p => { p.pricing.overrides = { abc: -1 }; }, 'pricing.overrides.abc'));
  test('string override', () => bad(p => { p.pricing.overrides = { abc: '5' }; }, 'pricing.overrides.abc'));
  test('negative custom', () => bad(p => { p.pricing.custom = { q: -5 }; }, 'pricing.custom.q'));
  test('non-string productChoice', () => bad(p => { p.pricing.productChoice = { q: 3 }; }, 'pricing.productChoice.q'));
  test('negative shippingFee', () => bad(p => { p.pricing.shippingFee = -1; }, 'pricing.shippingFee'));
  test('string shippingFee', () => bad(p => { p.pricing.shippingFee = 'x'; }, 'pricing.shippingFee'));
  test('non-boolean pickup', () => {
    const p: any = createDefaultPlan(); p.pricing.pickup = 'igen';
    expect(parsePlan(JSON.stringify(p)).ok).toBe(false);
  });
  test('layers are reordered to default order', () => {
    const p: any = createDefaultPlan(); p.walls.layers.reverse();
    expect(parsePlan(JSON.stringify(p))).toEqual({ ok: true, plan: createDefaultPlan() });
  });
});
