import { createDefaultPlan } from '../../src/model/defaults';
import { buildScene } from '../../src/scene/build';
import { groupLength, tempDimensions } from '../../src/scene/neighbours';
import { renderView } from '../../src/viewer/render';
import { SCREEN_PALETTE } from '../../src/viewer/theme';
import { highlightSvg, tempDimsSvg } from '../../src/viewer/overlay';
import { toWorld } from '../../src/viewer/views/world';
import { wallMap } from '../../src/viewer/views/wall';
import { roofMap } from '../../src/viewer/views/roof';

const plan = createDefaultPlan();
const scene = buildScene(plan);
const layers = { frame: true, sheathing: true, battens: true, fasteners: true, dims: true, grid: true, mesh: true };
const view = (v: 'wall.N' | 'roof' | 'floor') => renderView({ plan, scene, view: v, layers, palette: SCREEN_PALETTE }).svg;

/** A kiemelés sokszögének befoglalója. */
function hlBox(svg: string): number[] {
  const tag = /<polygon[^>]*class="hl"[^>]*>/.exec(svg)![0];
  const pts = /points="([^"]+)"/.exec(tag)![1].split(' ').map(p => p.split(',').map(Number));
  const xs = pts.map(p => p[0]); const ys = pts.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
function elBox(svg: string, id: string): number[] {
  const g = new RegExp(`data-el="${id}"[^>]*><rect x="([-\\d.]+)" y="([-\\d.]+)" width="([\\d.]+)" height="([\\d.]+)"`).exec(svg)!;
  const [x, y, w, h] = g.slice(1).map(Number);
  return [x, y, x + w, y + h];
}

test('wall highlight uses the same (mirrored) mapping as the view', () => {
  const id = 'wall.N.stud.3';
  expect(hlBox(highlightSvg(scene, id, 'wall.N', plan))).toEqual(elBox(view('wall.N'), id));
});
test('roof highlight uses the roof plane projection of the view', () => {
  const id = 'roof.L.rafter.2';
  const box = hlBox(highlightSvg(scene, id, 'roof', plan));
  const el = elBox(view('roof'), id);
  box.forEach((v, i) => expect(v).toBeCloseTo(el[i], 0));
});
test('floor highlight of a wall stud sits on the plan footprint', () => {
  const id = 'wall.N.stud.3';
  const box = hlBox(highlightSvg(scene, id, 'floor', plan));
  expect(box[1]).toBe(0);
  expect(box[3]).toBe(plan.walls.studSection.w);
});
test('fastener highlight is a ring at the fastener point', () => {
  const f = scene.fasteners.find(x => x.kind === 'anchor')!;
  const svg = highlightSvg(scene, f.id, 'floor', plan);
  expect(svg).toContain('class="hl hl-fx"');
  expect(svg).toContain('--mmpx');
});
test('highlight is empty for an element that the view does not draw', () => {
  expect(highlightSvg(scene, 'wall.N.stud.3', 'roof', plan)).toBe('');
  expect(highlightSvg(scene, 'nincs.ilyen', 'wall.N', plan)).toBe('');
});
test('toWorld maps like the views', () => {
  expect(toWorld(plan, 'wall.N', 'wall.N', 100, 200)).toEqual(wallMap(plan, 'N').pt(100, 200));
  expect(toWorld(plan, 'roof', 'roof.L', 300, 400)).toEqual(roofMap(plan).pt('roof.L', 300, 400));
  expect(toWorld(plan, 'roof', 'wall.N', 1, 1)).toBeNull();
});
test('temp dims draw one dimension per TempDim, with screen-constant labels', () => {
  const dims = tempDimensions(scene, groupLength(plan, 'wall.N'), 'wall.N.stud.3');
  const svg = tempDimsSvg(dims, 'wall.N', plan, 'wall.N');
  expect((svg.match(/class="dim"/g) ?? []).length).toBe(dims.length);
  expect(svg).toContain('60 cm');
  expect(svg).toContain('120 cm');
  expect(svg).toContain('--mmpx');
  expect(tempDimsSvg([], 'wall.N', plan, 'wall.N')).toBe('');
});

test('temp dims run at mid-height and stack by a screen-constant step', () => {
  const el = scene.elements.find(e => e.id === 'wall.N.stud.3')!;
  const dims = tempDimensions(scene, groupLength(plan, 'wall.N'), el.id);
  const svg = tempDimsSvg(dims, 'wall.N', plan, 'wall.N', 60, { u: el.geom.w / 2, v: el.geom.h / 2 });
  const ys = [...svg.matchAll(/<line x1="[-\d.]+" y1="([-\d.]+)" x2="[-\d.]+" y2="([-\d.]+)"/g)].map(m => Number(m[1]));
  const midY = -(el.geom.v + el.geom.h / 2);
  expect(ys.some(y => Math.abs(y - midY) < 40)).toBe(true);
  expect(svg).toContain('translate(calc(var(--mmpx, 1) * 0px), calc(var(--mmpx, 1) * 18px))');
  expect(svg).toContain('translate(calc(var(--mmpx, 1) * 0px), calc(var(--mmpx, 1) * 36px))');
});
