import { createDefaultPlan } from '../../src/model/defaults';
import { buildScene } from '../../src/scene/build';
import type { Element, Scene } from '../../src/scene/types';
import { groupLength, neighbours, tempDimensions } from '../../src/scene/neighbours';

const p = createDefaultPlan(); const sc = buildScene(p);
test('N wall stud #3', () => {
  const n = neighbours(sc, groupLength(p, 'wall.N'), 'wall.N.stud.3');
  expect(n).toMatchObject({ left: 'wall.N.stud.2', right: 'wall.N.stud.4', axisLeft: 600, axisRight: 600,
    clearLeft: 550, clearRight: 550, fromStart: 1200, toEnd: 1550 });
  expect(tempDimensions(sc, 2800, 'wall.N.stud.3').map(d => d.text)).toEqual(['60 cm', '60 cm', '120 cm']);
});
test('E wall stud next to window', () => {
  const n = neighbours(sc, 4000, 'wall.E.stud.3');
  expect(n.right).toBe('wall.E.kingStud.1');
  expect(n.axisRight).toBe(200);
  expect(n.nearestOpening).toMatchObject({ distance: 250, side: 'right' });
  const t = tempDimensions(sc, 4000, 'wall.E.stud.3');
  expect(t.length).toBe(4);
  expect(t[3].text).toBe('25 cm');
  expect(t.map(d => d.offset)).toEqual([-150, -300, -450, -600]);
});
test('rafter neighbours', () => {
  const n = neighbours(sc, 4600, 'roof.L.rafter.2');
  expect([n.axisLeft, n.axisRight]).toEqual([600, 600]);
});
test('last stud has no right neighbour', () => {
  expect(neighbours(sc, 2800, 'wall.N.stud.6').right).toBeUndefined();
});
test('roof batten: left is the row below, axis is v difference', () => {
  const n = neighbours(sc, 4600, 'roof.L.roofBatten.3');
  expect(n).toMatchObject({ left: 'roof.L.roofBatten.2', right: 'roof.L.roofBatten.4', axisLeft: 330, axisRight: 330 });
});
test('sheets and openings get only fromStart/toEnd and no neighbours', () => {
  const n = neighbours(sc, 4000, 'wall.E.opening.1');
  expect(n.left).toBeUndefined(); expect(n.right).toBeUndefined();
  expect(n.fromStart).toBe(1500);
});
test('groupLength', () => {
  expect(groupLength(p, 'wall.N')).toBe(2800);
  expect(groupLength(p, 'wall.E')).toBe(4000);
  expect(groupLength(p, 'roof.L')).toBe(4600);
  expect(groupLength(p, 'roof.ridge')).toBe(4600);
  expect(groupLength(p, 'floor')).toBe(p.building.width - 2 * p.walls.studSection.w);
  expect(groupLength(p, 'foundation')).toBe(p.building.width + 2 * p.foundation.slabOverhang);
});

const el = (id: string, u: number): Element => ({ id, kind: 'stud', label: id, group: 'wall.X', category: 'Fal' as Element['category'],
  length: 100, geom: { u, v: 0, w: 50, h: 100 }, fasteners: [] });
test('coincident neighbours: nearest wins, tie -> smaller id', () => {
  const s: Scene = { elements: [el('me', 500), el('b', 100), el('a', 100), el('c', 300), el('d', 700), el('e', 700)], fasteners: [], cut: {} };
  const n = neighbours(s, 1000, 'me');
  expect(n.left).toBe('c'); expect(n.right).toBe('d');
  const s2: Scene = { elements: [el('me', 500), el('b', 100), el('a', 100)], fasteners: [], cut: {} };
  expect(neighbours(s2, 1000, 'me').left).toBe('a');
});
test('rotated cornerStud touches the end stud (zero clear space, uses its 100 mm width)', () => {
  const n = neighbours(sc, 4000, 'wall.E.cornerStud.1');
  expect(n).toMatchObject({ axisLeft: 75, clearLeft: 0 });  // vég oszlop közepe 25, a sarokoszlop közepe 100 (u 50…150)
});
test('window cripples', () => {
  const low = neighbours(sc, 4000, 'wall.E.cripple.1');
  expect(low).toMatchObject({ left: 'wall.E.jackStud.1', right: 'wall.E.jackStud.2', axisLeft: 325, axisRight: 325 });
  const high = neighbours(sc, 4000, 'wall.E.cripple.2');
  expect(high).toMatchObject({ left: 'wall.E.kingStud.1', right: 'wall.E.kingStud.2', axisLeft: 375, axisRight: 375 });
});
test('roof batten dimension orientation', () => {
  const t = tempDimensions(sc, 4600, 'roof.L.roofBatten.3');
  expect(t.length).toBe(3);
  for (const d of t.slice(0, 2)) { expect(d.x1).toBe(d.x2); expect(d.y1).not.toBe(d.y2); }
  expect(t[2].y1).toBe(t[2].y2);
  expect(t.map(d => d.offset)).toEqual([-150, -300, -450]);
  expect(t[0].text).toBe('33 cm');
});

describe('gerendakeret (talajcsavar)', () => {
  const q = createDefaultPlan(); q.foundation.type = 'groundScrew';
  const qs = buildScene(q);
  test('groupLength frame', () => {
    expect(groupLength(q, 'frame')).toBe(q.building.width);
  });
  test('támasz szomszédai a gerenda mentén', () => {
    // 3000×4000: a gerendák y irányúak, a támaszok 150, 1383, 2617, 3850-nél
    const n = neighbours(qs, groupLength(q, 'frame'), 'frame.support.2');
    expect(n).toMatchObject({ left: 'frame.support.1', right: 'frame.support.3', axisLeft: 1233, axisRight: 1234 });
    const t = tempDimensions(qs, groupLength(q, 'frame'), 'frame.support.2');
    expect(t[0].x1).toBe(t[0].x2);
  });
  test('párnafa szomszédai és méretvonala mindkét irányban', () => {
    // 3000×4000: a gerendák y irányúak, a párnafák x irányúak és y szerint követik egymást
    const nv = neighbours(qs, groupLength(q, 'floor'), 'floor.joist.2');
    expect(nv).toMatchObject({ left: 'floor.joist.1', right: 'floor.joist.3' });
    expect(nv.fromStart).toBeGreaterThan(0);
    const tv = tempDimensions(qs, groupLength(q, 'floor'), 'floor.joist.2');
    expect(tv[0].x1).toBe(tv[0].x2);
    expect(tv[0].text).not.toBe('0 cm');
    // 4000×3000: a párnafák y irányúak, x szerint követik egymást
    const q2 = createDefaultPlan(); q2.foundation.type = 'groundScrew'; q2.building = { ...q2.building, width: 4000, length: 3000 };
    const s2 = buildScene(q2);
    const nu = neighbours(s2, groupLength(q2, 'floor'), 'floor.joist.2');
    expect(nu).toMatchObject({ left: 'floor.joist.1', right: 'floor.joist.3' });
    const tu = tempDimensions(s2, groupLength(q2, 'floor'), 'floor.joist.2');
    expect(tu[0].y1).toBe(tu[0].y2);
    // a két orientációban azonos a számadat
    expect(nu.axisLeft).toBe(nv.axisLeft);
    expect(nu.fromStart).toBe(nv.fromStart);
    expect(nu.toEnd).toBe(nv.toEnd);
  });
  test('főgerenda szomszédai a W irányban', () => {
    const n = neighbours(qs, groupLength(q, 'frame'), 'frame.beam.2');
    expect(n).toMatchObject({ left: 'frame.beam.1', right: 'frame.beam.3', axisLeft: 1450, axisRight: 1450 });
  });
});
