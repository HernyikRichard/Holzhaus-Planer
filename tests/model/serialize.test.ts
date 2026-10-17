import { createDefaultPlan, DEFAULT_PRICING } from '../../src/model/defaults';
import { CURRENT_VERSION, MIGRATIONS, parsePlan, serializePlan } from '../../src/model/serialize';

test('roundtrip', () => {
  const p = createDefaultPlan(); p.name = 'Kerti ház';
  const r = parsePlan(serializePlan(p));
  expect(r).toEqual({ ok: true, plan: p });
});
test('serializePlan uses 2-space indentation', () => {
  expect(serializePlan(createDefaultPlan())).toContain('\n  "version": 3');
});
test('garbage and future versions are rejected with Hungarian messages', () => {
  expect(parsePlan('nem json')).toEqual({ ok: false, error: 'A fájl nem érvényes JSON.' });
  expect(parsePlan(JSON.stringify({ ...createDefaultPlan(), version: 99 }))).toEqual({
    ok: false,
    error: 'A fájl egy újabb programverzióval készült (v99), ezt a verziót nem tudom betölteni.',
  });
  expect(CURRENT_VERSION).toBe(3);
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
test('MIGRATIONS has the v1 -> v2 and v2 -> v3 steps', () => {
  expect(Object.keys(MIGRATIONS)).toEqual(['1', '2']);
});
test('v1 file migrates to v2 with default pricing', () => {
  const v1: any = createDefaultPlan(); delete v1.pricing; v1.version = 1; v1.name = 'Régi';
  const r = parsePlan(JSON.stringify(v1));
  expect(r.ok).toBe(true);
  if (r.ok) {
    expect(r.plan.version).toBe(3);
    expect(r.plan.foundation.type).toBe('slab');
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
test('standingSeam covering round-trips; old covering values still load', () => {
  const p = createDefaultPlan(); p.roof.covering = 'standingSeam';
  expect(parsePlan(serializePlan(p))).toEqual({ ok: true, plan: p });
  for (const c of ['tile', 'trapezoid', 'shingle', 'epdm'] as const) {
    const q = createDefaultPlan(); q.roof.covering = c;
    expect(parsePlan(serializePlan(q))).toEqual({ ok: true, plan: q });
  }
  const v1: any = createDefaultPlan(); delete v1.pricing; v1.version = 1; v1.roof.covering = 'standingSeam';
  const r = parsePlan(JSON.stringify(v1));
  expect(r.ok && r.plan.roof.covering).toBe('standingSeam');
  const bad: any = createDefaultPlan(); bad.roof.covering = 'slate';
  expect(parsePlan(JSON.stringify(bad))).toEqual({ ok: false, error: 'Hibás érték: roof.covering' });
});

test('v2 file migrates to v3 as slab with default frame', () => {
  const v2: any = createDefaultPlan(); v2.version = 2;
  delete v2.foundation.type; delete v2.foundation.frame; delete v2.foundation.groundScrew;
  const r = parsePlan(JSON.stringify(v2));
  expect(r.ok).toBe(true);
  if (r.ok) {
    expect(r.plan.version).toBe(3);
    expect(r.plan).toEqual(createDefaultPlan());
  }
});
test('v1 -> v3 chain works', () => {
  const v1: any = createDefaultPlan(); delete v1.pricing; v1.version = 1;
  delete v1.foundation.type; delete v1.foundation.frame; delete v1.foundation.groundScrew;
  const r = parsePlan(JSON.stringify(v1));
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.plan.foundation.frame).toEqual({ beamSection: 'b100x150', supportSpacing: 'auto', groundClearance: 300 });
});
test.each([1200, 'auto'] as const)('groundScrew round-trip with supportSpacing %s', sp => {
  const p = createDefaultPlan();
  p.foundation.type = 'groundScrew'; p.foundation.frame.supportSpacing = sp;
  p.foundation.frame.beamSection = 'b2x50x150'; p.foundation.groundScrew.length = 1200;
  expect(parsePlan(serializePlan(p))).toEqual({ ok: true, plan: p });
});
test.each([
  ['foundation.type', (p: any) => { p.foundation.type = 'pile'; }],
  ['foundation.frame.beamSection', (p: any) => { p.foundation.frame.beamSection = 'b80'; }],
  ['foundation.groundScrew.length', (p: any) => { p.foundation.groundScrew.length = 900; }],
  ['foundation.frame.supportSpacing', (p: any) => { p.foundation.frame.supportSpacing = 'kicsi'; }],
])('invalid %s is rejected with its path', (path, mutate) => {
  const p: any = createDefaultPlan(); mutate(p);
  const r = parsePlan(JSON.stringify(p));
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error).toContain(path);
});
