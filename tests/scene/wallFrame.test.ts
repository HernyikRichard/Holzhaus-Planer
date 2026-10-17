import { elementsToPieces } from '../../src/scene/toPieces';
import { calcWallFraming } from '../../src/calc/walls';
import { createDefaultPlan } from '../../src/model/defaults';
import { wallFrameElements } from '../../src/scene/wallFrame';

const s = wallFrameElements(createDefaultPlan());
const el = (id: string) => s.elements.find(e => e.id === id)!;
test('N wall studs', () => {
  const studs = s.elements.filter(e => e.group === 'wall.N' && e.kind === 'stud');
  expect(studs.map(e => e.geom.u)).toEqual([0, 600, 1200, 1800, 2400, 2750]);
  expect(el('wall.N.stud.3')).toMatchObject({ label: 'Oszlop #3', length: 2250, geom: { u: 1200, v: 50, w: 50, h: 2250 } });
});
test('ids are unique', () => {
  const ids = s.elements.map(e => e.id).concat(s.fasteners.map(f => f.id));
  expect(new Set(ids).size).toBe(ids.length);
});
test('door framing on S wall', () => {
  expect(s.elements.filter(e => e.group === 'wall.S' && e.kind === 'kingStud').map(e => e.geom.u)).toEqual([1400, 2450]);
  expect(s.elements.filter(e => e.group === 'wall.S' && e.kind === 'header').map(e => e.geom)).toEqual([
    { u: 1450, v: 2050, w: 1000, h: 100 }, { u: 1450, v: 2050, w: 1000, h: 100 }]);
});
test('stud has 2+2 frame screws', () => {
  const f = el('wall.N.stud.3').fasteners.map(id => s.fasteners.find(x => x.id === id)!);
  expect(f.map(x => [x.kind, x.count, x.v])).toEqual([['frameScrew', 2, 50], ['frameScrew', 2, 2300]]);
});
test('no fastener inside an opening', () => {
  const p = createDefaultPlan();
  const sc = wallFrameElements(p);
  for (const o of p.openings) {
    const inside = sc.fasteners.filter(f => f.group === `wall.${o.wall}` && f.kind === 'anchor'
      && o.type === 'door' && f.u > o.offset && f.u < o.offset + o.width);
    expect(inside).toEqual([]);
  }
});
test('slab anchor label unchanged', () => {
  expect(new Set(s.fasteners.filter(f => f.kind === 'anchor').map(f => f.label))).toEqual(new Set(['Betondübel / ászokcsavar M10×120']));
});
test('anchors on N wall', () => {
  expect(s.fasteners.filter(f => f.group === 'wall.N' && f.kind === 'anchor').map(f => f.u)).toEqual([150, 950, 1750, 2550, 2650]);
});
test('E wall: one rotated corner stud per corner (L with the end stud)', () => {
  const c = s.elements.filter(e => e.group === 'wall.E' && e.kind === 'cornerStud');
  expect(c.map(e => e.geom.u)).toEqual([50, 3850]);          // t, len − t − w (len 4000, t 50, w 100)
  for (const e of c) {
    expect(e.geom).toMatchObject({ w: 100, v: 50 });
    expect(e.rotated).toBe(true);
    expect(e.label).toMatch(/^Sarokoszlop \(elforgatva\) #\d$/);
    expect(e.fasteners.length).toBe(2);                       // alul + felül
  }
  const endStuds = s.elements.filter(e => e.group === 'wall.E' && e.kind === 'stud' && (e.geom.u === 0 || e.geom.u === 3950));
  expect(endStuds.length).toBe(2);
  expect(s.elements.filter(e => e.kind === 'cornerStud' && e.group !== 'wall.E' && !e.rotated)).toEqual([]);
});
test('top plate #1 is the upper plate; mono wall angle is negative', () => {
  const p = createDefaultPlan();
  p.roof = { ...p.roof, shape: 'mono', pitch: 10, ridgeDirection: 'y' };
  const plates = wallFrameElements(p).elements.filter(e => e.group === 'wall.N' && e.kind === 'topPlate');
  expect(plates.map(e => e.label)).toEqual(['Koszorú #1', 'Koszorú #2']);
  expect(plates[0].geom.v).toBeGreaterThan(plates[1].geom.v);
  expect(plates[0].geom.angle!).toBeLessThan(0);
});
test('elementsToPieces equals calcWallFraming pieces', () => {
  const pieces = elementsToPieces(s.elements);
  expect(pieces.every(q => q.id)).toBe(true);
  const strip = (ps: typeof pieces) => ps.map(q => ({ ...q, id: undefined })).map(q => JSON.stringify(q)).sort();
  expect(strip(pieces)).toEqual(strip(calcWallFraming(createDefaultPlan()).pieces));
});

test('corner stud length on a sloped full wall is the minimum over its width', async () => {
  const { wallGeometry, studLengthAt } = await import('../../src/calc/geometry');
  let strictlyShorter = false;
  for (const dir of ['x', 'y'] as const) {
    const p = createDefaultPlan();
    p.roof = { ...p.roof, shape: 'mono', pitch: 10, ridgeDirection: dir };
    for (const wall of wallGeometry(p).filter(w => w.full)) {
      const t = p.walls.studSection.t; const w = p.walls.studSection.w;
      const cs = wallFrameElements(p).elements.filter(e => e.group === `wall.${wall.side}` && e.kind === 'cornerStud');
      expect(cs.length).toBe(2);
      for (const c of cs) {
        const min = Math.min(studLengthAt(p, wall, c.geom.u), studLengthAt(p, wall, c.geom.u + w));
        expect(c.length).toBeCloseTo(min, 6);
        expect(c.geom.h).toBeCloseTo(min, 6);
        const atEnd = studLengthAt(p, wall, c.geom.u < wall.length / 2 ? 0 : wall.length);
        if (min < atEnd - 1) strictlyShorter = true;
        void t;
      }
    }
  }
  expect(strictlyShorter).toBe(true);
});
