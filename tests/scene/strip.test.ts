import { createDefaultPlan } from '../../src/model/defaults';
import { buildScene } from '../../src/scene/build';
import { frameLayout } from '../../src/calc/frame';
import { stripLayout } from '../../src/calc/strip';
import { BEAM_BOLTS_PER_SUPPORT } from '../../src/catalog';
import type { BeamSectionId, Plan } from '../../src/model/types';
import type { Element, Scene } from '../../src/scene/types';

function mk(width = 3000, length = 4000, over: (p: Plan) => void = () => {}): Plan {
  const p = createDefaultPlan();
  p.building.width = width; p.building.length = length;
  p.foundation.type = 'stripFooting';
  over(p);
  return p;
}
const kinds = (sc: Scene, k: string): Element[] => sc.elements.filter(e => e.kind === k);
const sills = (sc: Scene): Element[] => sc.elements.filter(e => e.kind === 'beam' && e.pieceLabel === 'talpgerenda');
const inner = (sc: Scene): Element[] => sc.elements.filter(e => e.kind === 'beam' && e.pieceLabel === 'főgerenda');
const sumCount = (sc: Scene, k: string): number => sc.fasteners.filter(f => f.kind === k).reduce((a, f) => a + f.count, 0);
const overlapArea = (a: Element, b: Element): number =>
  Math.max(0, Math.min(a.geom.u + a.geom.w, b.geom.u + b.geom.w) - Math.max(a.geom.u, b.geom.u))
  * Math.max(0, Math.min(a.geom.v + a.geom.h, b.geom.v + b.geom.h) - Math.max(a.geom.v, b.geom.v));

describe('sávalap scene 3000×4000', () => {
  const p = mk();
  const sc = buildScene(p);
  const f = frameLayout(p);

  test('4 sáv- és 4 lábazat-elem, oldalanként, átfedés nélkül', () => {
    for (const [k, prefix, label, wd] of [['stripFooting', 'frame.strip', 'Sávalap', 400], ['plinth', 'frame.plinth', 'Lábazat', 250]] as const) {
      const els = kinds(sc, k);
      expect(els.map(e => e.id)).toEqual(['N', 'E', 'S', 'W'].map(s => `${prefix}.${s}`));
      expect(els.map(e => e.label)).toEqual(['É', 'K', 'D', 'Ny'].map(s => `${label}: ${s}`));
      for (const e of els) {
        expect(e.group).toBe('frame');
        expect(e.category).toBe('Alap');
        expect(e.section).toBeUndefined();
        expect(e.pieceLabel).toBeUndefined();
      }
      for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) expect(overlapArea(els[i], els[j])).toBe(0);
      // a sarkok egyszer: a területösszeg a kerület × szélesség
      expect(els.reduce((a, e) => a + e.geom.w * e.geom.h, 0)).toBe(stripLayout(p).P * wd);
    }
    // along y (L = 4000): a K/Ny oldal viszi a sarkokat
    const s = Object.fromEntries(kinds(sc, 'stripFooting').map(e => [e.id.split('.')[2], e.geom]));
    expect(s.E).toEqual({ u: 2750, v: -150, w: 400, h: 4300 });
    expect(s.W).toEqual({ u: -150, v: -150, w: 400, h: 4300 });
    expect(s.N).toEqual({ u: 250, v: -150, w: 2500, h: 400 });
    expect(s.S).toEqual({ u: 250, v: 3750, w: 2500, h: 400 });
  });

  test('talpgerendák: 2 hosszú (4000) és 2 rövid (2800)', () => {
    const t = sills(sc);
    expect(t.map(e => e.length)).toEqual([4000, 4000, 2800, 2800]);
    expect(t.map(e => e.label)).toEqual(['Talpgerenda #1', 'Talpgerenda #2', 'Talpgerenda #3', 'Talpgerenda #4']);
    // hosszúak a szélső főgerenda-helyen, rövidek a két hosszú között
    expect(t[0].geom).toEqual({ u: 0, v: 0, w: 100, h: 4000 });
    expect(t[1].geom).toEqual({ u: 2900, v: 0, w: 100, h: 4000 });
    expect(t[2].geom).toEqual({ u: 100, v: 0, w: 2800, h: 100 });
    expect(t[3].geom).toEqual({ u: 100, v: 3900, w: 2800, h: 100 });
  });

  test('1 belső főgerenda 3800, a rövid talpgerendák között', () => {
    const b = inner(sc);
    expect(b).toHaveLength(1);
    expect(b[0].length).toBe(3800);
    expect(b[0].label).toBe('Főgerenda #1');
    expect(b[0].geom).toEqual({ u: 1450, v: 100, w: 100, h: 3800 });
    expect(kinds(sc, 'beam')).toHaveLength(5);
  });

  test('2 belső pillér, beamBolt csak rajtuk', () => {
    const s = kinds(sc, 'support');
    expect(s).toHaveLength(2);
    expect(s.map(e => e.label)).toEqual(['Betonpillér #1', 'Betonpillér #2']);
    const sl = stripLayout(p);
    s.forEach((e, i) => {
      expect(e.geom.w).toBe(400); expect(e.geom.h).toBe(400);
      expect(e.geom.u + 200).toBe(sl.innerBeamAxes[0]);
      expect(e.geom.v + 200).toBe(sl.innerSupportAxes[i]);
    });
    expect(sumCount(sc, 'beamBolt')).toBe(BEAM_BOLTS_PER_SUPPORT * 2);
    for (const b of sc.fasteners.filter(x => x.kind === 'beamBolt')) {
      expect(sc.elements.find(e => e.id === b.elementIds.at(-1))!.kind).toBe('support');
      expect(inner(sc).map(e => e.id)).toContain(b.elementIds[0]);
    }
  });

  test('gerendasaru: párnafa × hosszú talpgerenda, és × belső gerenda, ahol keresztezi', () => {
    const hangers = sc.fasteners.filter(x => x.kind === 'joistHanger');
    const n = f.joistPositions.length;
    // a két peremgerenda a rövid talpgerendán fekszik, a belső gerendát nem keresztezi
    expect(hangers).toHaveLength(2 * n + (n - 2));
    for (const h of hangers) {
      expect(h.elementIds[0]).toMatch(/^floor\.joist\./);
      expect(h.elementIds.length).toBeGreaterThanOrEqual(2);
    }
  });

  test('minden faanyag-elemnek van vágási helye; az id-k egyediek', () => {
    for (const e of sc.elements.filter(x => x.section && x.pieceLabel)) expect(sc.cut[e.id]).toBeDefined();
    expect(new Set(sc.elements.map(e => e.id)).size).toBe(sc.elements.length);
  });
});

test('8000×6000: a hosszú talpgerenda a legnagyobb szálhossznál toldva (Review Focus 3)', () => {
  const p = mk(8000, 6000);
  const sc = buildScene(p);
  const long = sills(sc).filter(e => e.geom.h === 100 && e.geom.v === 0); // along x: a hosszúak v = 0 és v = W − bw
  expect(long.length).toBeGreaterThanOrEqual(2);
  expect(long.map(e => e.length)).toEqual([6000, 2000]);
  for (const e of long) expect(e.length).toBeLessThanOrEqual(6000);
  expect(long.reduce((a, e) => a + e.length, 0)).toBe(8000);
  expect(long[1].geom.u).toBe(6000);
  for (const e of sc.elements.filter(x => x.section && x.pieceLabel)) expect(sc.cut[e.id]).toBeDefined();
  // a belső gerendák a pillértengelyeken toldva
  const sl = stripLayout(p);
  const f = frameLayout(p);
  for (const w of sl.innerBeamAxes) {
    const segs = inner(sc).filter(e => e.geom.v === w - f.beam.width / 2).sort((a, b) => a.geom.u - b.geom.u);
    expect(segs.reduce((a, e) => a + e.length, 0)).toBe(8000 - 200);
    for (const s of segs.slice(0, -1)) expect(sl.innerSupportAxes).toContain(s.geom.u + s.length);
  }
});

describe('2000×2000 (Review Focus 2)', () => {
  test('alap 50×100 párnafa: 1 belső gerenda, 0 pillér, 0 beamBolt', () => {
    const sc = buildScene(mk(2000, 2000));
    expect(inner(sc)).toHaveLength(1);
    expect(inner(sc)[0].length).toBe(1800);
    expect(kinds(sc, 'support')).toHaveLength(0);
    expect(sumCount(sc, 'beamBolt')).toBe(0);
    expect(sills(sc)).toHaveLength(4);
  });
  test('50×150 párnafa: 0 belső gerenda, 0 pillér', () => {
    const sc = buildScene(mk(2000, 2000, p => { p.floor.joistSection = { t: 50, w: 150 }; }));
    expect(inner(sc)).toHaveLength(0);
    expect(kinds(sc, 'support')).toHaveLength(0);
    expect(sumCount(sc, 'beamBolt')).toBe(0);
  });
});

test('b2x50x150: rétegenként kétszeres gerenda-elem', () => {
  const beam: BeamSectionId = 'b2x50x150';
  const one = buildScene(mk());
  const two = buildScene(mk(3000, 4000, p => { p.foundation.frame.beamSection = beam; }));
  expect(sills(two)).toHaveLength(2 * sills(one).length);
  expect(inner(two)).toHaveLength(2 * inner(one).length);
  const t = sills(two);
  // hosszú (along y): a rétegek u szerint egymás mellett; rövid: v szerint
  expect(t[1].geom.u).toBe(t[0].geom.u + 50);
  const short = t.filter(e => e.geom.h === 50);
  expect(short).toHaveLength(4);
  expect(short[1].geom.v).toBe(short[0].geom.v + 50);
  for (const e of two.elements.filter(x => x.section && x.pieceLabel)) expect(two.cut[e.id]).toBeDefined();
});
