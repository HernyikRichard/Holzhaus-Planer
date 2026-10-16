import { createDefaultPlan } from '../../src/model/defaults';
import type { Plan } from '../../src/model/types';
import { calculate } from '../../src/calc';
import { calcRoofLayers } from '../../src/calc/roof';
import { roofElements } from '../../src/scene/roofFrame';
import { pitchWarning } from '../../src/calc/roof';

function plan(shape: Plan['roof']['shape'] = 'gable'): Plan {
  const p = createDefaultPlan();
  p.roof.shape = shape;
  p.roof.pitch = shape === 'gable' ? 30 : shape === 'mono' ? 10 : 3;
  p.roof.covering = 'standingSeam';
  return p;
}
const line = (p: Plan, id: string) => calculate(p).lines.find(l => l.id === id);

describe('állókorcos alumíniumlemez', () => {
  // [alak, sáv db, sávhossz szöveg, klipsz, csavar, ereszszegély m, oromszegély m, gerincfedő m]
  const CASES: Array<[Plan['roof']['shape'], number, string, number, number, number, number, number | undefined]> = [
    ['gable', 20, '2,08 m', 132, 264, 9.2, 8.4, 4.6],
    ['mono', 10, '3,66 m', 110, 220, 4.6, 7.4, undefined],
    ['flat', 10, '3,61 m', 110, 220, 4.6, 7.3, undefined],
  ];
  test.each(CASES)('%s: sávok, klipszek, csavarok, szegélyek', (shape, strips, len, clips, screws, eave, rake, ridge) => {
    const p = plan(shape);
    const s = line(p, 'roof.standingSeam')!;
    expect(s).toMatchObject({ quantity: strips, unit: 'db', category: 'Tető' });
    expect(s.name).toBe(`Állókorcos alumíniumlemez, 500 mm sáv, ${len}`);
    expect(s.explanation).toContain('m²');
    expect(line(p, 'fix.seamClips')).toMatchObject({ quantity: clips, unit: 'db', category: 'Kötőelemek' });
    expect(line(p, 'fix.seamClipScrews')).toMatchObject({ quantity: screws, unit: 'db', category: 'Kötőelemek' });
    expect(line(p, 'roof.seamEaveFlashing')).toMatchObject({ name: 'Ereszszegély', unit: 'm' });
    expect(line(p, 'roof.seamEaveFlashing')!.quantity).toBeCloseTo(eave, 6);
    expect(line(p, 'roof.seamRakeFlashing')!.quantity).toBeCloseTo(rake, 6);
    if (ridge === undefined) expect(line(p, 'acc.ridgeCap')).toBeUndefined();
    else expect(line(p, 'acc.ridgeCap')).toMatchObject({ name: 'Gerincfedő', unit: 'm', quantity: ridge });
    expect(line(p, 'acc.ridgeTiles')).toBeUndefined();
  });
  test('gable: m² a magyarázatban, lemez-ráhagyással', () => {
    const s = line(plan(), 'roof.standingSeam')!;
    expect(s.explanation).toContain('20,8 m²');
    expect(s.explanation).toContain('22,88 m²');
    expect(s.needM2).toBeCloseTo(22.88, 6);
  });
  test('gerincfedő csak bekapcsolt gerinccseréppel', () => {
    const p = plan(); p.accessories.ridgeTiles = false;
    expect(line(p, 'acc.ridgeCap')).toBeUndefined();
  });
  test.each(['gable', 'mono', 'flat'] as const)('%s: nincs léc / ellenléc, a deszkázat kötelező', shape => {
    const p = plan(shape);
    p.roof.layers.find(l => l.kind === 'decking')!.enabled = false;
    const r = calcRoofLayers(p);
    expect(r.pieces.some(x => x.label === 'tetőléc' || x.label === 'ellenléc')).toBe(false);
    expect(roofElements(p).elements.some(e => e.kind === 'roofBatten' || e.kind === 'counterBatten')).toBe(false);
    const d = r.lines.find(l => l.id === 'roof.decking')!;
    expect(d.warnings).toEqual(['Az állókorcos alumíniumlemez alá kötelező a deszkázat, ezért automatikusan bekapcsoltuk.']);
    const out = calculate(p);
    expect(out.lines.some(l => l.id === 'fix.battenNails' || l.id === 'fix.counterBattenNails' || l.id === 'fix.tileClips')).toBe(false);
  });
  test('az alátét elválasztó (szellőző) alátétrétegként jelenik meg, a többi héjazatnál nem', () => {
    expect(line(plan(), 'roof.underlay')).toMatchObject({ name: 'Elválasztó (szellőző) alátétréteg', unit: 'tekercs' });
    expect(line(createDefaultPlan(), 'roof.underlay')!.name).toBe('Alátétfólia');
  });
  test('hajlás: 3° alatt figyelmeztet, 3°-on nem', () => {
    const p = plan('flat');
    expect(pitchWarning(p)).toBeNull();
    p.roof.pitch = 2.5;
    expect(pitchWarning(p)).toBe('Az állókorcos alumíniumlemez legalább 3°-os tetőhajlást igényel (most 2,5°). Válassz EPDM-et, vagy növeld a hajlást.');
  });
  test('a cserép-figyelmeztetés már az állókorcos lemezt is ajánlja', () => {
    const p = createDefaultPlan(); p.roof.shape = 'flat'; p.roof.pitch = 3;
    expect(pitchWarning(p)).toBe('A cserép legalább 22°-os tetőhajlást igényel (most 3°). Válassz EPDM-et vagy állókorcos lemezt, vagy növeld a hajlást.');
  });
});
