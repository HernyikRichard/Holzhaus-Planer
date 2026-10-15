import { createDefaultPlan } from '../../src/model/defaults';
import { buildScene } from '../../src/scene/build';
import { KERF } from '../../src/catalog';
import { orderedIds, stepNeighbour, stickPieces, viewForElement } from '../../src/app/selection';

const plan = createDefaultPlan();
const sc = buildScene(plan);

test('stickPieces for a stud', () => {
  const ps = stickPieces(sc, 'wall.N.stud.3');
  expect(ps.filter(x => x.self)).toHaveLength(1);
  expect(ps.find(x => x.self)!.id).toBe('wall.N.stud.3');
  expect(ps.reduce((a, x) => a + x.length, 0) + KERF * (ps.length - 1)).toBeLessThanOrEqual(sc.cut['wall.N.stud.3'].stockLength);
  for (let i = 1; i < ps.length; i++) expect(ps[i].offset).toBeGreaterThan(ps[i - 1].offset);
});
test('stickPieces labels wall battens', () => {
  const batten = Object.keys(sc.cut).find(id => id.startsWith('wall.batten.'))!;
  expect(batten).toBeDefined();
  expect(stickPieces(sc, batten).find(p => p.self)!.label).toBe('Fali léc');
});
test('stickPieces of an unknown id is empty', () => {
  expect(stickPieces(sc, 'nincs.ilyen')).toEqual([]);
});
test('stepNeighbour right and left', () => {
  expect(stepNeighbour(sc, 'wall.N.stud.3', 'right')).toBe('wall.N.stud.4');
  expect(stepNeighbour(sc, 'wall.N.stud.3', 'left')).toBe('wall.N.stud.2');
});
test('stepNeighbour returns null without a neighbour', () => {
  expect(stepNeighbour(sc, 'wall.N.bottomPlate', 'right')).toBeNull();
  expect(stepNeighbour(sc, 'nincs.ilyen', 'right')).toBeNull();
});
test('viewForElement maps groups to views', () => {
  const el = (id: string) => sc.elements.find(e => e.id === id)!;
  expect(viewForElement(el('wall.N.stud.3'), plan)).toBe('wall.N');
  expect(viewForElement(el('roof.L.rafter.2'), plan)).toBe('roof');
  const stud = el('wall.N.stud.3');
  expect(viewForElement({ ...stud, group: 'floor' }, plan)).toBe('floor');
  expect(viewForElement(sc.elements.find(e => e.id.startsWith('foundation.meshSheet.'))!, plan)).toBe('foundation');
});
test('orderedIds lists the visible elements of a view by u then v', () => {
  const ids = orderedIds(sc, 'wall.N', plan);
  expect(ids.length).toBeGreaterThan(5);
  expect(ids.every(id => id.startsWith('wall.N.'))).toBe(true);
  const els = ids.map(id => sc.elements.find(e => e.id === id)!);
  for (let i = 1; i < els.length; i++) {
    const a = els[i - 1].geom; const b = els[i].geom;
    expect(a.u < b.u || (a.u === b.u && a.v <= b.v)).toBe(true);
  }
  expect(ids.indexOf('wall.N.stud.3')).toBeLessThan(ids.indexOf('wall.N.stud.4'));
});
