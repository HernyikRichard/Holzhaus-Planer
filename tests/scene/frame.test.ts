import { createDefaultPlan } from '../../src/model/defaults';
import { buildScene } from '../../src/scene/build';
import { foundationElements } from '../../src/scene/misc';
import { frameLayout } from '../../src/calc/frame';
import { BEAM_BOLTS_PER_SUPPORT } from '../../src/catalog';
import type { Plan } from '../../src/model/types';

const gs = (over: (p: Plan) => void = () => {}): Plan => {
  const p = createDefaultPlan();
  p.foundation.type = 'groundScrew';
  over(p);
  return p;
};
const sumCount = (sc: ReturnType<typeof buildScene>, k: string) => sc.fasteners.filter(f => f.kind === k).reduce((a, f) => a + f.count, 0);

test('slab plan has no frame elements or points', () => {
  const sc = buildScene(createDefaultPlan());
  expect(sc.elements.some(e => e.kind === 'support' || e.kind === 'beam')).toBe(false);
  expect(sc.fasteners.some(f => f.kind === 'beamBolt' || f.kind === 'joistHanger')).toBe(false);
  expect(sc.elements.some(e => e.kind === 'meshSheet')).toBe(true);
});

test('groundScrew 3000x4000: counts, joists, fasteners', () => {
  const p = gs();
  const sc = buildScene(p);
  const f = frameLayout(p);
  const k = (kind: string) => sc.elements.filter(e => e.kind === kind);
  expect(k('support')).toHaveLength(f.beamAxes.length * f.supportAxes.length);
  expect(k('support')).toHaveLength(12);
  expect(k('beam')).toHaveLength(3);
  expect(k('joist')).toHaveLength(8);
  expect(k('joist')[0].label).toBe('Peremgerenda #1');
  expect(k('joist')[7].label).toBe('Peremgerenda #2');
  expect(k('joist')[7].pieceLabel).toBe('peremgerenda');
  expect(k('joist')[1].label).toBe('Párnafa #1');
  expect(k('joist')[3].label).toBe('Párnafa #3');
  expect(k('joist')[6].label).toBe('Párnafa #6');
  expect(k('joist')[3].id).toBe('floor.joist.4');
  expect(k('support')[0].section).toBeUndefined();
  expect(sumCount(sc, 'beamBolt')).toBe(BEAM_BOLTS_PER_SUPPORT * 12);
  expect(sumCount(sc, 'joistHanger')).toBe(8 * 3);
  const hanger = sc.fasteners.find(x => x.kind === 'joistHanger')!;
  expect(hanger.elementIds[0]).toMatch(/^floor\.joist\./);
  const bolt = sc.fasteners.find(x => x.kind === 'beamBolt')!;
  expect(sc.elements.find(e => e.id === bolt.elementIds[0])!.kind).toBe('beam');
  expect(sc.elements.find(e => e.id === bolt.elementIds.at(-1))!.kind).toBe('support');
  expect(new Set(sc.elements.map(e => e.id)).size).toBe(sc.elements.length);
  expect(foundationElementsKinds(p)).toEqual([]);
});
const foundationElementsKinds = (p: Plan) => foundationElements(p).map(e => e.kind);

test('2x50x150 beams are two ply elements', () => {
  const sc = buildScene(gs(p => { p.foundation.frame.beamSection = 'b2x50x150'; }));
  const beams = sc.elements.filter(e => e.kind === 'beam');
  expect(beams).toHaveLength(6);
  expect(beams[0].geom.w + beams[1].geom.w).toBe(100); // along y: a gerenda szélessége u irányban
  expect(beams[1].geom.u).toBe(beams[0].geom.u + 50);
});

test('6000x8000 beams splice on support axes', () => {
  const p = gs(q => { q.building.width = 6000; q.building.length = 8000; q.settings.stockLengths = [3000, 4000, 5000, 6000]; });
  const f = frameLayout(p);
  const sc = buildScene(p);
  const beams = sc.elements.filter(e => e.kind === 'beam');
  const perBeam = beams.length / f.beamAxes.length;
  expect(perBeam).toBeGreaterThanOrEqual(2);
  for (let b = 0; b < f.beamAxes.length; b++) {
    const segs = beams.slice(b * perBeam, (b + 1) * perBeam);
    expect(segs.reduce((a, s) => a + s.length, 0)).toBe(f.L);
    let at = 0;
    for (const s of segs) {
      expect(s.length).toBeLessThanOrEqual(6000);
      at += s.length;
      if (at < f.L) expect(f.supportAxes).toContain(at);
    }
  }
  // a toldásnál a csavar mindkét szegmenst érinti
  const two = sc.fasteners.filter(x => x.kind === 'beamBolt' && x.elementIds.length === 3);
  expect(two.length).toBe(f.beamAxes.length * (perBeam - 1));
});

test('every new timber element has a cut entry', () => {
  const sc = buildScene(gs());
  for (const e of sc.elements.filter(x => x.kind === 'beam' || x.kind === 'joist')) expect(sc.cut[e.id]).toBeDefined();
});
