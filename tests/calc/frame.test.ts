import { createDefaultPlan } from '../../src/model/defaults';
import type { BeamSectionId, Plan } from '../../src/model/types';
import { wallGeometry } from '../../src/calc/geometry';
import { floorOn, frameLayout, framePt, hasFrame } from '../../src/calc/frame';
import { floorTopZ } from '../../src/scene/layerStack';
import { BEAM_MAX_SPAN, JOIST_MAX_SPAN } from '../../src/catalog';

function mk(width: number, length: number, beam: BeamSectionId = 'b100x150', sp: 'auto' | number = 'auto'): Plan {
  const p = createDefaultPlan();
  p.building.width = width; p.building.length = length;
  p.foundation.type = 'groundScrew';
  p.foundation.frame.beamSection = beam; p.foundation.frame.supportSpacing = sp;
  return p;
}

const sizes: [number, number][] = [[2000, 2000], [3000, 4000], [4000, 3000], [3000, 3000], [4000, 6000], [6000, 8000], [8000, 6000]];
const beams: BeamSectionId[] = ['b100x150', 'b120x120', 'b2x50x150'];
const cases = sizes.flatMap(([w, l]) => beams.flatMap(b => (['auto', 1200] as const).map(s => [w, l, b, s] as const)));

describe.each(cases)('keret %i×%i %s %s', (w, l, b, s) => {
  const p = mk(w, l, b, s);
  const f = frameLayout(p);
  const even = (a: number[]) => a.every((v, i) => i === 0 || Math.abs((v - a[i - 1]) - (a[1] - a[0])) <= 1);
  const sym = (a: number[], tot: number) => a.every((v, i) => Math.abs(v + a[a.length - 1 - i] - tot) <= 1);

  test('irány a full falpárhoz igazodik', () => {
    const full = wallGeometry(p).find(g => g.full)!;
    expect(f.along).toBe(full.side === 'N' || full.side === 'S' ? 'x' : 'y');
  });
  test('főgerenda-tengelyek', () => {
    const a = f.beamAxes;
    expect(a[0]).toBe(f.beam.width / 2);
    expect(a[a.length - 1]).toBe(f.W - f.beam.width / 2);
    expect(even(a)).toBe(true); expect(sym(a, f.W)).toBe(true);
    for (let i = 1; i < a.length; i++) expect(a[i] - a[i - 1]).toBeLessThanOrEqual(JOIST_MAX_SPAN['50x100']);
  });
  test('támasz-tengelyek', () => {
    const a = f.supportAxes;
    const lim = s === 'auto' ? BEAM_MAX_SPAN[b] : s;
    expect(a[0]).toBe(150); expect(a[a.length - 1]).toBe(f.L - 150);
    for (let i = 1; i < a.length; i++) expect(a[i] - a[i - 1]).toBeLessThanOrEqual(lim);
    expect(sym(a, f.L)).toBe(true);
  });
  test('párnafák', () => {
    const j = f.joistPositions;
    expect(j[0]).toBe(0); expect(j[j.length - 1]).toBe(f.L - p.floor.joistSection.t);
    for (let i = 1; i < j.length; i++) expect(j[i] - j[i - 1]).toBeLessThanOrEqual(p.floor.joistSpacing);
    expect(new Set(j).size).toBe(j.length);
  });
});

test('z-szintek alapértékekkel', () => {
  const f = frameLayout(mk(3000, 4000));
  expect(f.z.beamBottom).toBe(300);
  expect(f.z.floorTop).toBe(300 + 150 + 100 + 18);
});

test('3000×4000 konkrét eset', () => {
  const f = frameLayout(mk(3000, 4000));
  expect(f.along).toBe('y'); expect(f.L).toBe(4000); expect(f.W).toBe(3000);
  expect(f.beamAxes).toEqual([50, 1500, 2950]);
  expect(f.supportAxes).toEqual([150, 1383, 2617, 3850]);
  expect(f.warnings).toEqual([]);
});

test('négyzetes ház: x irány', () => {
  expect(frameLayout(mk(3000, 3000)).along).toBe('x');
});

test('framePt', () => {
  const f = frameLayout(mk(3000, 4000));
  expect(framePt(f, 10, 20)).toEqual([20, 10]);
  expect(framePt(frameLayout(mk(4000, 3000)), 10, 20)).toEqual([10, 20]);
});

test('támaszköz-figyelmeztetés minden keresztmetszetnél nyelvtanilag helyes', () => {
  for (const [b, l] of [['b100x150', '100×150'], ['b120x120', '120×120'], ['b2x50x150', '2×50×150']] as const) {
    const w = frameLayout(mk(4000, 4000, b, 2500)).warnings.join(' ');
    expect(w).toContain(`a ${l} mm-es főgerendához`);
    expect(w).not.toContain('-as');
  }
});

test('figyelmeztetések', () => {
  expect(frameLayout(mk(4000, 4000, 'b120x120', 2400)).warnings)
    .toContain('A megadott támaszköz (240 cm) nagyobb a 120×120 mm-es főgerendához ajánlott 150 cm-nél.');
  const p = mk(3000, 4000); p.floor.joistSection = { t: 60, w: 120 };
  expect(frameLayout(p).warnings)
    .toContain('A(z) 60×120 padlógerendához nincs fesztávadat, 160 cm-rel számoltunk.');
});

test('kézi támaszköz a táblázat fölött: a támaszok a sarkokban', () => {
  const f = frameLayout(mk(4000, 4000, 'b120x120', 2400));
  expect(f.supportAxes[0]).toBe(150); expect(f.supportAxes.at(-1)).toBe(3850);
});

test('floorOn és floorTopZ', () => {
  const p = createDefaultPlan();
  p.floor.enabled = false;
  expect(floorOn(p)).toBe(false); expect(floorTopZ(p)).toBe(0);
  p.floor.enabled = true;
  expect(floorTopZ(p)).toBe(p.floor.joistSection.w + p.floor.osbThickness);
  p.floor.enabled = false; p.foundation.type = 'groundScrew';
  expect(floorOn(p)).toBe(true);
  expect(floorTopZ(p)).toBe(frameLayout(p).z.floorTop);
});

test.each([['slab', false], ['groundScrew', true], ['padFooting', true], ['concretePier', true]] as const)('hasFrame %s -> %s', (type, want) => {
  const p = createDefaultPlan(); p.foundation.type = type;
  expect(hasFrame(p)).toBe(want);
});
