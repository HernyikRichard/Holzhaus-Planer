import { createDefaultPlan } from '../../src/model/defaults';
import { buildScene } from '../../src/scene/build';
import { calculate } from '../../src/calc';
import { cutSticks, elementsForLine } from '../../src/app/lineElements';
import { KERF } from '../../src/catalog';

const plan = createDefaultPlan();
const sc = buildScene(plan);
const out = calculate(plan);

test('elementsForLine wall.osb', () => {
  const r = elementsForLine(sc, out.lines.find(l => l.id === 'wall.osb')!)!;
  expect(r.layer).toBe('sheathing');
  expect(r.view.startsWith('wall.')).toBe(true);
  expect(r.ids.length).toBeGreaterThan(0);
  expect(r.ids.every(id => id.includes('.osbSheet.'))).toBe(true);
});
test('elementsForLine timber line returns elements of that stock only', () => {
  const line = out.lines.find(l => l.id.startsWith('timber.Fal.'))!;
  const r = elementsForLine(sc, line)!;
  expect(r.ids.length).toBeGreaterThan(0);
  const stock = Number(line.id.split('.').pop());
  for (const id of r.ids) {
    expect(sc.cut[id].stockLength).toBe(stock);
    expect(sc.elements.some(e => e.id === id)).toBe(true);
  }
});
test('elementsForLine fasteners and unrelated lines', () => {
  const a = elementsForLine(sc, out.lines.find(l => l.id === 'fix.anchors')!)!;
  expect(a.view).toBe('floor');
  expect(a.ids.every(id => sc.fasteners.find(f => f.id === id)?.kind === 'anchor')).toBe(true);
  const s = elementsForLine(sc, out.lines.find(l => l.id === 'fix.frameScrews')!)!;
  expect(s.ids.every(id => sc.fasteners.find(f => f.id === id)?.kind === 'frameScrew')).toBe(true);
  expect(elementsForLine(sc, out.lines.find(l => l.id === 'foundation.cement' || l.id === 'foundation.gravel')!)).toBeNull();
});
test('cutSticks covers every assigned piece once', () => {
  const ids = cutSticks(sc).flatMap(s => s.pieces.map(p => p.id));
  expect(new Set(ids).size).toBe(Object.keys(sc.cut).length);
  expect(ids.length).toBe(Object.keys(sc.cut).length);
});
test('cutSticks: rest and ordering', () => {
  const sticks = cutSticks(sc);
  for (const s of sticks) {
    const used = s.pieces.reduce((a, p) => a + p.length, 0) + KERF * (s.pieces.length - 1);
    expect(s.rest).toBeCloseTo(s.stockLength - used, 6);
  }
  const keys = sticks.map(s => s.key);
  expect(new Set(keys).size).toBe(keys.length);
  expect(sticks.some(s => s.pieces.some(p => p.label === 'Fali léc'))).toBe(true);
});

test('elementsForLine handles accented category ids (Tető)', () => {
  const line = out.lines.find(l => l.id.startsWith('timber.Tető.'))!;
  const r = elementsForLine(sc, line)!;
  expect(r).not.toBeNull();
  expect(r.view).toBe('roof');
});

test('floor joist timber line points to the floor view (frame layer) and its ids are drawn there', () => {
  const p = createDefaultPlan(); p.floor.enabled = true;
  const scene = buildScene(p);
  const line = calculate(p).lines.find(l => l.id.startsWith('timber.Padló.'))!;
  const r = elementsForLine(scene, line)!;
  expect(r).toMatchObject({ view: 'floor', layer: 'frame' });
  expect(r.ids.every(id => id.startsWith('floor.joist.'))).toBe(true);
});
