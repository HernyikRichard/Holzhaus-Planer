import { createDefaultPlan } from '../../src/model/defaults';
import { calcFoundation } from '../../src/calc/foundation';
import { assignCuts } from '../../src/calc/cutting';
import { frameElements } from '../../src/scene/frame';
import { validatePlan } from '../../src/model/validate';
import { mono4x6Plan } from '../fixtures';
import { calculate, CATEGORY_ORDER } from '../../src/calc';

test('reference: 3×4 gable tile (default)', () => {
  expect(calculate(createDefaultPlan()).lines.map(l => [l.id, l.quantity, l.unit])).toMatchSnapshot();
});
test('reference: 4×6 mono trapezoid with floor', () => {
  const p = mono4x6Plan();
  expect(validatePlan(p)).toEqual([]);
  expect(calculate(p).lines.map(l => [l.id, l.quantity, l.unit])).toMatchSnapshot();
});
test('all layers off', () => {
  const p = createDefaultPlan();
  p.walls.layers.forEach(l => l.enabled = false);
  p.roof.layers.forEach(l => l.enabled = false);
  Object.keys(p.accessories).forEach(k => (p.accessories as any)[k] = false);
  const out = calculate(p);
  expect(out.lines.every(l => l.quantity > 0)).toBe(true);
  expect(out.lines.some(l => l.id.startsWith('acc.'))).toBe(false);
  expect(out.lines.some(l => ['fix.osbScrews', 'fix.claddingNails', 'fix.counterBattenNails', 'fix.battenNails'].includes(l.id))).toBe(false);
});
test('lines are ordered by category', () => {
  const cats = calculate(createDefaultPlan()).lines.map(l => CATEGORY_ORDER.indexOf(l.category));
  expect(cats).toEqual([...cats].sort((a, b) => a - b));
});

test('4×6 mono plan: span and splice warnings appear exactly once', () => {
  const p = mono4x6Plan();
  const w = calculate(p).warnings;
  expect(w.filter(x => x.includes('nem statikai méretezés'))).toHaveLength(1);
  expect(w.filter(x => x.includes('toldással'))).toHaveLength(1);
});

describe('talajcsavaros terv', () => {
  const mk = (en = false) => {
    const p = createDefaultPlan(); p.foundation.type = 'groundScrew'; p.floor.enabled = en; return p;
  };
  const get = (o: { lines: { id: string }[] }, id: string) => o.lines.find(l => l.id === id) as any;
  test('sorok és mennyiségek, padló kényszerítve', () => {
    for (const en of [false, true]) {
      const o = calculate(mk(en));
      const ids = o.lines.map(l => l.id);
      expect(ids.some(i => /^foundation\.(concrete|cement|cementBags|gravel|water|mesh|bed|peFoil|formwork|stakes)$/.test(i))).toBe(false);
      expect(get(o, 'foundation.groundScrew').quantity).toBe(12);
      expect(get(o, 'foundation.screwHead').quantity).toBe(12);
      expect(get(o, 'foundation.beamBolts').quantity).toBe(24);
      expect(get(o, 'foundation.joistHangers').quantity).toBe(24);
      expect(get(o, 'fix.connectorScrews').secondary).toBe('192 db');
      expect(ids.some(i => i.startsWith('timber.Alap.100x150.'))).toBe(true);
      expect(get(o, 'floor.osb').explanation).toContain('12 m² × 1,1 = 13,2 m²');
    }
  });
  test('túllépett támaszköz figyelmeztetése', () => {
    const p = mk(); p.foundation.frame.beamSection = 'b120x120'; p.foundation.frame.supportSpacing = 2400;
    expect(calculate(p).warnings.some(w => w.includes('támaszköz'))).toBe(true);
  });
  test('darabra egyezés: támasz = csavar = U-fej; a vágás darabjai = a gerendák', () => {
    const p = mk();
    const els = frameElements(p).elements;
    const sup = els.filter(e => e.kind === 'support').length;
    const o = calculate(p);
    expect(get(o, 'foundation.groundScrew').quantity).toBe(sup);
    expect(get(o, 'foundation.screwHead').quantity).toBe(sup);
    const beams = els.filter(e => e.kind === 'beam');
    const pieces = calcFoundation(p).pieces;
    expect(pieces).toHaveLength(beams.length);
    const cuts = assignCuts(pieces, p.settings.stockLengths);
    expect(Object.keys(cuts).sort()).toEqual(beams.map(b => b.id).sort());
    expect(pieces.every(x => x.section.t === 100 && x.section.w === 150 && x.category === 'Alap')).toBe(true);
  });
  test('betonlemezen nincsenek talajcsavaros sorok', () => {
    const o = calculate(createDefaultPlan());
    expect(o.lines.some(l => /^(foundation\.(groundScrew|screwHead|beamBolts|joistHangers)|fix\.connectorScrews)$/.test(l.id))).toBe(false);
    expect(o.lines.find(l => l.id === 'fix.anchors')?.name).toBe('Talpgerenda-rögzítő (dübel / ászokcsavar)');
  });
});
