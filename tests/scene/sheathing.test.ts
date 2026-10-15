import { createDefaultPlan } from '../../src/model/defaults';
import { wallOsbElements } from '../../src/scene/wallSheathing';

test('E wall OSB columns and screws avoid the window', () => {
  const p = createDefaultPlan(); const r = wallOsbElements(p);
  const e = r.elements.filter(x => x.group === 'wall.E');
  expect(e.filter(x => x.geom.v === 0).map(x => [x.geom.u, x.geom.w])).toEqual([[0, 1250], [1250, 1250], [2500, 1250], [3750, 250]]);
  const win = p.openings.find(o => o.type === 'window')!;
  const inWin = r.fasteners.filter(f => f.group === 'wall.E' && f.u > win.offset + 10 && f.u < win.offset + win.width - 10
    && f.v > 50 + win.sillHeight + 10 && f.v < 50 + win.sillHeight + win.height - 10);
  expect(inWin).toEqual([]);
});
test('sheets have labels, no section, screws are single', () => {
  const r = wallOsbElements(createDefaultPlan());
  expect(r.elements[0]).toMatchObject({ kind: 'osbSheet', label: 'OSB tábla #1', category: 'Fal' });
  expect(r.elements.every(x => !x.section)).toBe(true);
  expect(r.fasteners.every(f => f.kind === 'osbScrew' && f.count === 1 && f.label === '4×40 csavar')).toBe(true);
  const first = r.elements[0];
  const pts = r.fasteners.filter(f => f.elementIds[0] === first.id);
  expect(pts.some(f => f.u === first.geom.u && f.v === first.geom.v)).toBe(true);
});
test('no OSB when layer disabled', () => {
  const p = createDefaultPlan();
  for (const l of p.walls.layers) if (l.kind === 'osb') l.enabled = false;
  expect(wallOsbElements(p).elements).toEqual([]);
});

import { mono4x6Plan } from '../fixtures';
import { wallGeometry, wallHeightAt } from '../../src/calc/geometry';
import type { Plan } from '../../src/model/types';
const top = (p: Plan, side: string, u: number): number => {
  const w = wallGeometry(p).find(x => x.side === side)!;
  let h = wallHeightAt(w, u);
  if (w.gableRise > 0) h += w.gableRise * (1 - Math.abs(u - w.length / 2) / (w.length / 2));
  return h;
};
const flat = (): Plan => { const p = createDefaultPlan(); p.roof = { ...p.roof, shape: 'flat', pitch: 2 }; return p; };
for (const [name, mk] of [['default', createDefaultPlan], ['mono', mono4x6Plan], ['flat', flat]] as const) {
  test(`no osbScrew above the wall outline: ${name}`, () => {
    const p = mk(); const r = wallOsbElements(p);
    expect(r.fasteners.length).toBeGreaterThan(0);
    for (const f of r.fasteners) expect(f.v).toBeLessThanOrEqual(top(p, f.group.slice(5), f.u) - 10 + 1e-6);
  });
}
test('no sliver sheets on the flat plan', () => {
  for (const e of wallOsbElements(flat()).elements) expect(e.geom.h).toBeGreaterThanOrEqual(100);
});
