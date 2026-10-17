import { createDefaultPlan } from '../../src/model/defaults';
import type { FoundationType, PierKind, Plan } from '../../src/model/types';
import { calculate } from '../../src/calc';
import { frameLayout } from '../../src/calc/frame';
import { supportQuantities, supportSpec } from '../../src/calc/supports';
import { buildScene } from '../../src/scene/build';
import { buildAssembly, stepIdOfLine } from '../../src/assembly/steps';
import { matchLine } from '../../src/pricing/match';
import { MATCH_FIXTURE as PL } from '../fixtures/priceList';

function mk(type: FoundationType, w = 3000, l = 4000, pier?: PierKind, clearance?: number): Plan {
  const p = createDefaultPlan();
  p.building.width = w; p.building.length = l;
  p.foundation.type = type;
  if (pier) p.foundation.pier.kind = pier;
  if (clearance !== undefined) p.foundation.frame.groundClearance = clearance;
  return p;
}
const lineOf = (p: Plan, id: string) => calculate(p).lines.find(x => x.id === id);
const ids = (p: Plan) => calculate(p).lines.filter(x => x.id.startsWith('foundation.')).map(x => x.id);

describe('pontalap 3×4 m, alapértékek', () => {
  const p = mk('padFooting');
  test('mennyiségek', () => {
    const q = supportQuantities(p);
    expect(q.count).toBe(12);
    expect(q.longBarMm).toBe(700);
    expect(q.stirrupsPerSupport).toBe(4);
    expect(q.pierRows).toBe(0);
    expect(q.tubeMm).toBe(0);
    expect(q.rebar10Mm).toBe(12 * 4 * 700);
    expect(q.rebar6Mm).toBe(12 * 4 * 1300);
    expect(q.footingM3).toBeCloseTo(1.536, 9);
  });
  test('sorok', () => {
    expect(lineOf(p, 'foundation.concrete')!.quantity).toBe(1.54);
    expect(lineOf(p, 'foundation.concrete')!.explanation).toContain('12 talp');
    expect(lineOf(p, 'foundation.rebar10')!.quantity).toBe(6);
    expect(lineOf(p, 'foundation.rebar10')!.secondary).toBe('33,6 fm, 20,73 kg');
    expect(lineOf(p, 'foundation.rebar6')!.quantity).toBe(11);
    expect(lineOf(p, 'foundation.rebar6')!.explanation).toContain('12 támasz × 4 kengyel (0,2 m-enként) × 1,3 m = 62,4 m');
    expect(lineOf(p, 'foundation.postBase')!.quantity).toBe(12);
    expect(lineOf(p, 'foundation.excavation')!.quantity).toBe(1.54);
    for (const id of ['foundation.groundScrew', 'foundation.screwHead', 'foundation.pierBlock', 'foundation.pierTube', 'foundation.pierBracket']) {
      expect(lineOf(p, id), id).toBeUndefined();
    }
    for (const id of ['cement', 'cementBags', 'gravel', 'water', 'beamBolts', 'joistHangers']) expect(lineOf(p, `foundation.${id}`), id).toBeDefined();
  });
  test('leíró', () => {
    const s = supportSpec(p);
    expect(s.label).toBe('Pontalap');
    expect(s.stepTitle).toBe('Pontalapok');
    expect(supportSpec(mk('groundScrew')).label).toBe('Talajcsavar');
    expect(supportSpec(mk('groundScrew')).stepTitle).toBe('Támaszok');
    expect(supportSpec(mk('concretePier')).stepTitle).toBe('Betonpillérek');
  });
});

describe('betonpillér', () => {
  test('block250, 300 mm', () => {
    const p = mk('concretePier', 3000, 4000, 'block250', 300);
    const q = supportQuantities(p);
    expect(q.pierRows).toBe(2);
    expect(q.longBarMm).toBe(1000);
    expect(lineOf(p, 'foundation.pierBlock')!.quantity).toBe(24);
    expect(lineOf(p, 'foundation.concrete')!.quantity).toBe(1.71);
    expect(lineOf(p, 'foundation.pierBracket')!.quantity).toBe(12);
    expect(lineOf(p, 'foundation.postBase')).toBeUndefined();
    expect(lineOf(p, 'foundation.excavation')!.quantity).toBe(1.54);
  });
  test('tube200, 300 mm', () => {
    const p = mk('concretePier', 3000, 4000, 'tube200', 300);
    const q = supportQuantities(p);
    expect(q.tubeMm).toBe(4800);
    expect(lineOf(p, 'foundation.pierTube')!.quantity).toBe(4.8);
    expect(lineOf(p, 'foundation.pierTube')!.unit).toBe('m');
    expect(lineOf(p, 'foundation.pierBlock')).toBeUndefined();
    // pillér-kengyel: a belső oldal min. 100 mm → 4·100+100 = 500 mm; 1 pillér-kengyel + 5 talp-kengyel (1300 mm)
    expect(q.rebar6Mm).toBe(12 * (5 * 1300 + 1 * 500));
    const ex = lineOf(p, 'foundation.rebar6')!.explanation;
    expect(ex).toContain('12 támasz × (5 talp-kengyel × 1,3 m + 1 pillér-kengyel × 0,5 m)');
    expect(ex).toContain('= 84 m');
  });
});

describe.each(['padFooting', 'concretePier'] as const)('%s mátrix', type => {
  const piers: PierKind[] = type === 'concretePier' ? ['block200', 'block250', 'tube200'] : ['block250'];
  for (const pier of piers) {
    test.each([[2000, 2000], [3000, 4000], [6000, 8000], [12000, 12000]])(`${pier} %i×%i`, (w, l) => {
      const p = mk(type, w, l, pier, 300);
      const f = frameLayout(p);
      const expected = f.beamAxes.length * f.supportAxes.length;
      const scene = buildScene(p);
      expect(scene.elements.filter(e => e.kind === 'support')).toHaveLength(expected);
      expect(supportQuantities(p).count).toBe(expected);
      const out = calculate(p);
      expect(JSON.stringify(out.lines)).not.toMatch(/NaN|Infinity/);
      const steps = buildAssembly(p, scene, out);
      for (const line of out.lines.filter(x => !x.id.startsWith('timber.'))) {
        const n = steps.filter(s => s.lines.some(m => m.lineId === line.id)).length;
        expect(n, line.id).toBe(1);
      }
      const stepOf = (id: string) => steps.find(s => s.lines.some(m => m.lineId === id))!.id;
      for (const id of ['foundation.concrete', 'foundation.cement']) expect(stepOf(id)).toBe('supports');
      for (const id of ['concrete', 'cement', 'cementBags', 'gravel', 'water', 'rebar10', 'rebar6', 'excavation']) {
        expect(stepIdOfLine({ id: `foundation.${id}` }, p), id).toBe('supports');
      }
      expect(stepIdOfLine({ id: 'foundation.beamBolts' }, p)).toBe('beamFrame');
      expect(stepIdOfLine({ id: 'foundation.joistHangers' }, p)).toBe('floor');
      const label = scene.elements.find(e => e.kind === 'support')!.label;
      expect(label).toBe(`${supportSpec(p).label} #1`);
    });
  }
});

test('betonlemezen a beton marad a foundation lépésben', () => {
  const p = mk('slab');
  expect(stepIdOfLine({ id: 'foundation.concrete' }, p)).toBe('foundation');
  expect(ids(p)).not.toContain('foundation.rebar10');
});

describe('árazás', () => {
  test('a pontalap cement sora ugyanúgy párosodik, mint a betonlemezé', () => {
    const slab = mk('slab'); const pad = mk('padFooting');
    const a = matchLine(lineOf(slab, 'foundation.cement')!, PL, slab);
    const b = matchLine(lineOf(pad, 'foundation.cement')!, PL, pad);
    expect(b).toEqual(a);
  });
  test('az új id-k ár nélkül, kivétel nélkül', () => {
    for (const [type, pier] of [['padFooting', 'block250'], ['concretePier', 'block250'], ['concretePier', 'tube200']] as const) {
      const p = mk(type, 3000, 4000, pier, 300);
      for (const id of ['rebar10', 'rebar6', 'postBase', 'pierBlock', 'pierTube', 'pierBracket', 'excavation']) {
        const l = lineOf(p, `foundation.${id}`);
        if (!l) continue;
        expect(matchLine(l, PL, p), id).toMatchObject({ missing: true });
      }
    }
  });
});
