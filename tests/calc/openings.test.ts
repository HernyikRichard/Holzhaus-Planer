import { createDefaultPlan } from '../../src/model/defaults';
import type { Opening } from '../../src/model/types';
import type { WallGeom } from '../../src/calc/geometry';
import { openingArea } from '../../src/calc/openings';
import { studPositions } from '../../src/calc/walls';
import { wallFrameElements } from '../../src/scene/wallFrame';

const lens = (p: ReturnType<typeof createDefaultPlan>, wall: string, openingId: string, label: string): number[] =>
  wallFrameElements(p).elements
    .filter(e => e.group === `wall.${wall}` && e.openingId === openingId && e.pieceLabel === label)
    .map(e => e.length);

test('door 900×2000 in 4000 wall', () => {
  const p = createDefaultPlan();
  const wall = { side: 'S', length: 4000, full: true, hStart: 2400, hEnd: 2400, gableRise: 0 } as WallGeom;
  const door = p.openings.find(o => o.type === 'door') as Opening;
  p.openings = [door];
  expect(studPositions(p, wall)).toEqual([0, 600, 1200, 3000, 3600, 3950]);
  expect(lens(p, 'S', door.id, 'teljes oszlop')).toEqual([2250, 2250]);
  expect(lens(p, 'S', door.id, 'kiváltó oszlop')).toEqual([2000, 2000]);
  expect(lens(p, 'S', door.id, 'áthidaló')).toEqual([1000, 1000]);
  expect(lens(p, 'S', door.id, 'felső rövid oszlop')).toEqual([150, 150]);
  expect(lens(p, 'S', door.id, 'könyöklő')).toEqual([]);
  expect(openingArea(door)).toBeCloseTo(1.8);
});
test('window adds sill and lower cripples', () => {
  const p = createDefaultPlan();
  const win = p.openings.find(o => o.type === 'window')!;
  expect(lens(p, 'E', win.id, 'könyöklő')).toEqual([600]);
  expect(lens(p, 'E', win.id, 'alsó rövid oszlop')).toEqual([1150]);
  expect(lens(p, 'E', win.id, 'felső rövid oszlop')).toEqual([350]);
  const els = wallFrameElements(p).elements.filter(e => e.group === 'wall.E');
  expect(els.find(e => e.kind === 'sill')!.geom).toEqual({ u: 1500, v: 1200, w: 600, h: 50 });
  expect(els.filter(e => e.kind === 'cripple').map(e => [e.label, e.geom])).toEqual([
    ['Rövid oszlop #1', { u: 1775, v: 50, w: 50, h: 1150 }],
    ['Rövid oszlop #2', { u: 1775, v: 1950, w: 50, h: 350 }],
  ]);
});
test('window with a too-low sill gets no lower cripples (no negative pieces)', () => {
  const p = createDefaultPlan();
  p.openings = p.openings.map(o => (o.type === 'window' ? { ...o, sillHeight: 0 } : o));
  const win = p.openings.find(o => o.type === 'window')!;
  expect(lens(p, 'E', win.id, 'alsó rövid oszlop')).toEqual([]);
  const all = wallFrameElements(p).elements.filter(e => e.openingId === win.id && e.pieceLabel);
  expect(all.every(e => e.length > 0)).toBe(true);
});
