import { fitCamera, zoomAt, panBy, screenToWorld, reaspect } from '../../src/viewer/camera';
import { VIEW_LAYERS } from '../../src/viewer/layers';
import { SCREEN_PALETTE, PRINT_PALETTE } from '../../src/viewer/theme';

test('fitCamera keeps aspect and margin', () => {
  const c = fitCamera({ minX: 0, minY: 0, maxX: 3000, maxY: 4000 }, 800, 800);
  expect(c.w).toBeCloseTo(c.h); expect(c.h).toBeCloseTo(4000 * 1.12);
});
test('zoomAt keeps the pointer point fixed', () => {
  const fit = fitCamera({ minX: 0, minY: 0, maxX: 3000, maxY: 4000 }, 1000, 800);
  const before = screenToWorld(fit, 250, 300, 1000, 800);
  const z = zoomAt(fit, 2, 250, 300, 1000, 800, fit);
  const after = screenToWorld(z, 250, 300, 1000, 800);
  expect(after[0]).toBeCloseTo(before[0]); expect(after[1]).toBeCloseTo(before[1]);
  expect(z.w).toBeCloseTo(fit.w / 2);
});
test('zoom is clamped', () => {
  const fit = fitCamera({ minX: 0, minY: 0, maxX: 3000, maxY: 4000 }, 1000, 800);
  let c = fit; for (let i = 0; i < 100; i++) c = zoomAt(c, 2, 500, 400, 1000, 800, fit);
  expect(c.w).toBeCloseTo(fit.w / 20);
  c = fit; for (let i = 0; i < 100; i++) c = zoomAt(c, 0.5, 500, 400, 1000, 800, fit);
  expect(c.w).toBeCloseTo(fit.w / 0.2);
});
test('panBy moves by screen pixels', () => {
  const c = { x: 0, y: 0, w: 1000, h: 800 };
  expect(panBy(c, 100, 50, 1000, 800)).toEqual({ x: -100, y: -50, w: 1000, h: 800 });
});
test('view layers follow the spec table', () => {
  expect(VIEW_LAYERS.floor).toEqual(['frame', 'fasteners', 'dims', 'grid']);
  expect(VIEW_LAYERS['wall.N']).toEqual(['frame', 'sheathing', 'fasteners', 'dims', 'grid']);
  expect(VIEW_LAYERS.section).toEqual(['dims', 'grid']);
  expect(VIEW_LAYERS.roof).toEqual(['frame', 'battens', 'fasteners', 'dims', 'grid']);
  expect(VIEW_LAYERS.gable).toEqual(['frame', 'sheathing', 'fasteners', 'dims']);
  expect(VIEW_LAYERS.foundation).toEqual(['mesh', 'dims', 'grid']);
});
test('palettes share keys', () => {
  expect(Object.keys(PRINT_PALETTE).sort()).toEqual(Object.keys(SCREEN_PALETTE).sort());
  expect(SCREEN_PALETTE.bg).toBe('#12345a');
  expect(SCREEN_PALETTE.highlight).toBe('#ffd166');
});
test('reaspect keeps centre and scale and matches viewport aspect', () => {
  const c = { x: 100, y: 200, w: 1000, h: 800 };
  const r = reaspect(c, 500, 1000);
  expect(r.w).toBe(1000);
  expect(r.h / r.w).toBeCloseTo(1000 / 500);
  expect(r.x + r.w / 2).toBeCloseTo(c.x + c.w / 2);
  expect(r.y + r.h / 2).toBeCloseTo(c.y + c.h / 2);
});
