import { createDefaultPlan } from '../../src/model/defaults';
import { calcFoundation } from '../../src/calc/foundation';
import type { ModuleResult } from '../../src/calc/types';

const q = (r: ModuleResult, id: string) => r.lines.find(l => l.id === id)?.quantity;
test('foundation 3×4, 120 mm, C16', () => {
  const r = calcFoundation(createDefaultPlan());
  expect(q(r, 'foundation.concrete')).toBeCloseTo(1.62);
  expect(q(r, 'foundation.cement')).toBe(484);
  expect(q(r, 'foundation.cementBags')).toBe(20);
  expect(r.lines.find(l => l.id === 'foundation.cement')?.secondary).toBe('20 zsák (25 kg)');
  expect(q(r, 'foundation.gravel')).toBeCloseTo(3.07);
  expect(q(r, 'foundation.water')).toBe(291);
  expect(q(r, 'foundation.mesh')).toBe(6);
  expect(q(r, 'foundation.bed')).toBeCloseTo(2.52);
  expect(q(r, 'foundation.peFoil')).toBe(1);
  expect(q(r, 'foundation.formwork')).toBeCloseTo(2.6);
  expect(q(r, 'foundation.stakes')).toBe(15);
  r.lines.forEach(l => expect(l.explanation.length).toBeGreaterThan(0));
});
test('C20 uses 340 kg/m³', () => {
  const p = createDefaultPlan(); p.foundation.concreteGrade = 'C20';
  expect(q(calcFoundation(p), 'foundation.cement')).toBe(549);
});
test('no PE foil when disabled', () => {
  const p = createDefaultPlan(); p.foundation.peFoil = false;
  expect(q(calcFoundation(p), 'foundation.peFoil')).toBeUndefined();
});

describe('talajcsavaros alap', () => {
  const gs = (mut?: (p: ReturnType<typeof createDefaultPlan>) => void) => {
    const p = createDefaultPlan(); p.foundation.type = 'groundScrew'; mut?.(p); return p;
  };
  test('a betonlemez sorai nincsenek, a csavaros sorok igen', () => {
    const r = calcFoundation(gs());
    const ids = r.lines.map(l => l.id);
    for (const x of ['concrete', 'cement', 'cementBags', 'gravel', 'water', 'mesh', 'bed', 'peFoil', 'formwork', 'stakes']) {
      expect(ids).not.toContain(`foundation.${x}`);
    }
    expect(ids).toEqual(['foundation.groundScrew', 'foundation.screwHead', 'foundation.beamBolts', 'foundation.joistHangers']);
    expect(q(r, 'foundation.groundScrew')).toBe(12);
    expect(q(r, 'foundation.screwHead')).toBe(12);
    expect(q(r, 'foundation.beamBolts')).toBe(24);
    expect(q(r, 'foundation.joistHangers')).toBe(24);
    r.lines.forEach(l => { expect(l.category).toBe('Alap'); expect(l.unit).toBe('db'); expect(l.explanation.length).toBeGreaterThan(0); });
    const l = (id: string) => r.lines.find(x => x.id === id)!;
    expect(l('foundation.groundScrew').name).toBe('Talajcsavar Ø76 × 100 cm');
    expect(l('foundation.groundScrew').explanation).toBe('3 főgerenda × 4 támasz = 12 db');
    expect(l('foundation.screwHead').name).toBe('Állítható U-fej 100 mm-es gerendához');
    expect(l('foundation.beamBolts').name).toBe('M12 menetes szár anyával, alátéttel');
    expect(l('foundation.beamBolts').explanation).toBe('12 támasz × 2 db = 24 db');
    expect(l('foundation.joistHangers').name).toBe('Gerendasaru (párnafa–főgerenda)');
    expect(l('foundation.joistHangers').explanation).toBe('8 párnafa × 3 főgerenda = 24 db; csavar: 24 × 8 db');
    expect(r.stats.connectorScrewCount).toBe(192);
  });
  test('a főgerendák darabjai Alap kategóriában, a figyelmeztetések átjönnek', () => {
    const r = calcFoundation(gs(p => { p.foundation.frame.supportSpacing = 2400; p.foundation.frame.beamSection = 'b120x120'; }));
    expect(r.pieces.length).toBeGreaterThan(0);
    r.pieces.forEach(x => { expect(x.category).toBe('Alap'); expect(x.label).toBe('főgerenda'); });
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.lines.find(l => l.id === 'foundation.screwHead')!.name).toBe('Állítható U-fej 120 mm-es gerendához');
  });
  test('2 rétegű gerendánál a magyarázat a főgerendák számát írja', () => {
    const r = calcFoundation(gs(p => { p.foundation.frame.beamSection = 'b2x50x150'; }));
    expect(r.lines.find(l => l.id === 'foundation.groundScrew')!.explanation).toBe('3 főgerenda × 4 támasz = 12 db');
  });
});
