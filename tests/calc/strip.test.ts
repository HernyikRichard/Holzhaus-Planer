import { createDefaultPlan } from '../../src/model/defaults';
import type { BeamSectionId, Plan, PlinthBlock } from '../../src/model/types';
import { stripLayout } from '../../src/calc/strip';
import { frameLayout } from '../../src/calc/frame';
import { wallGeometry } from '../../src/calc/geometry';
import { calculate } from '../../src/calc';
import { buildScene } from '../../src/scene/build';
import { renderView } from '../../src/viewer/render';
import { SCREEN_PALETTE } from '../../src/viewer/theme';
import { buildModel3d } from '../../src/three-d/model';
import { buildAssembly } from '../../src/assembly/steps';
import { stepTodo } from '../../src/assembly/todo';
import { ALL_LAYERS, DRAWING_VIEWS } from '../fixtures/frameOutputs';

function mk(width = 3000, length = 4000, block: PlinthBlock = 'block250', clearance = 300, beam: BeamSectionId = 'b100x150'): Plan {
  const p = createDefaultPlan();
  p.building.width = width; p.building.length = length;
  p.foundation.type = 'stripFooting';
  p.foundation.plinth.block = block;
  p.foundation.frame.groundClearance = clearance;
  p.foundation.frame.beamSection = beam;
  return p;
}

describe('stripLayout 3×4 m, alapértékek', () => {
  const s = stripLayout(mk());
  test('lábazat-tengely kerülete', () => { expect(s.P).toBe(13600); });
  test('négy szakasz a wallGeometry oldalnevei szerint (É, K, D, Ny)', () => {
    expect(s.sides.map(x => x.side)).toEqual(wallGeometry(mk()).map(w => w.side));
    // x mentén (É/D) 3000 − 100, y mentén (K/Ny) 4000 − 100
    expect(s.sides.map(x => [x.side, x.length])).toEqual([['N', 2900], ['E', 3900], ['S', 2900], ['W', 3900]]);
    expect([...s.sides.map(x => x.length)].sort()).toEqual([2900, 2900, 3900, 3900]);
    expect(s.sides.reduce((a, x) => a + x.length, 0)).toBe(s.P);
  });
  test('a szakaszok a tengely-téglalap sarkaitól sarkaiig (bw/2 = 50 a külső síktól)', () => {
    expect(s.sides.map(x => [x.from, x.to])).toEqual([
      [[50, 50], [2950, 50]],
      [[2950, 50], [2950, 3950]],
      [[50, 3950], [2950, 3950]],
      [[50, 50], [50, 3950]],
    ]);
    for (const x of s.sides) expect(Math.hypot(x.to[0] - x.from[0], x.to[1] - x.from[1])).toBe(x.length);
  });
  test('sorok és kövek', () => {
    expect(s.rows).toBe(2);
    expect(s.blocksPerRow).toBe(28);
    expect(s.topRowCut).toBe(true); // 300 nem többszöröse 250-nek
  });
  test('talpgerendák és belső tengelyek', () => {
    expect(s.longSills).toEqual([{ w: 50 }, { w: 2950 }]);
    expect(s.shortSills).toEqual([{ l: 50 }, { l: 3950 }]);
    const f = frameLayout(mk());
    expect(f.W - 2 * f.beam.width).toBe(2800); // a rövid talpgerendák hossza
    expect(s.innerBeamAxes).toEqual([1500]);
    expect(s.innerSupportAxes).toEqual([1383, 2617]);
    expect(s.pierCount).toBe(2);
  });
});

test('a felső sor nem vágott, ha a magasság a sormagasság többszöröse', () => {
  const s = stripLayout(mk(3000, 4000, 'block250', 500));
  expect([s.rows, s.topRowCut]).toEqual([2, false]);
  const t = stripLayout(mk(3000, 4000, 'block250', 600));
  expect([t.rows, t.topRowCut]).toEqual([3, true]);
  const u = stripLayout(mk(3000, 4000, 'block250', 250));
  expect([u.rows, u.topRowCut]).toEqual([1, false]);
});

test('2×2 m: nincs belső támasz, így nincs belső pillér', () => {
  const s = stripLayout(mk(2000, 2000));
  expect(s.P).toBe(7600);
  expect(s.innerSupportAxes).toEqual([]);
  expect(s.pierCount).toBe(0);
});

test('2×2 m, csak két főgerenda (50×150-es párnafa): nincs belső főgerenda, nincs pillér', () => {
  const p = mk(2000, 2000); p.floor.joistSection = { t: 50, w: 150 };
  expect(frameLayout(p).beamAxes).toEqual([50, 1950]);
  const s = stripLayout(p);
  expect(s.innerBeamAxes).toEqual([]);
  expect(s.longSills).toEqual([{ w: 50 }, { w: 1950 }]);
  expect(s.pierCount).toBe(0);
});

test('fordított tájolás 4×3 m: a főgerendák x mentén, a tengely a teljes falpár szerint', () => {
  const p = mk(4000, 3000);
  const f = frameLayout(p);
  expect(f.along).toBe('x');
  const s = stripLayout(p);
  expect(s.P).toBe(13600);
  expect(s.sides.map(x => [x.side, x.length])).toEqual([['N', 3900], ['E', 2900], ['S', 3900], ['W', 2900]]);
  expect(s.sides.map(x => [x.from, x.to])).toEqual([
    [[50, 50], [3950, 50]],
    [[3950, 50], [3950, 2950]],
    [[50, 2950], [3950, 2950]],
    [[50, 50], [50, 2950]],
  ]);
  // keret-koordináták: a hosszú talpgerendák w (= y), a rövidek l (= x) mentén
  expect(s.longSills).toEqual([{ w: 50 }, { w: 2950 }]);
  expect(s.shortSills).toEqual([{ l: 50 }, { l: 3950 }]);
  expect(s.innerBeamAxes).toEqual([1500]);
  expect(s.innerSupportAxes).toEqual([1383, 2617]);
  expect(s.pierCount).toBe(2);
});

test('négyzetes ház 3×3 m: a full falpár az É/D (along x)', () => {
  const p = mk(3000, 3000);
  expect(frameLayout(p).along).toBe('x');
  const s = stripLayout(p);
  expect(s.P).toBe(11600);
  expect(s.sides.map(x => [x.side, x.length])).toEqual([['N', 2900], ['E', 2900], ['S', 2900], ['W', 2900]]);
  expect(s.longSills).toEqual([{ w: 50 }, { w: 2950 }]);
  expect(s.shortSills).toEqual([{ l: 50 }, { l: 2950 }]);
  expect(s.innerBeamAxes).toEqual([1500]);
  expect(s.innerSupportAxes).toEqual([1500]);
  expect(s.pierCount).toBe(1);
});

test('a belső támasz határa a zsalukő szélességétől függ (bw/2 + blokk/2)', () => {
  // 1200-as támaszköz, 3×3 m: tengelyek 150, 1050, 1950, 2850
  for (const [block, want] of [['block200', [1050, 1950]], ['block300', [1050, 1950]]] as const) {
    const p = mk(3000, 3000, block); p.foundation.frame.supportSpacing = 1200;
    expect(stripLayout(p).innerSupportAxes).toEqual(want);
  }
  // 120×120-as gerenda (bw 120): a 150-es tengely a határon (60 + 100 = 160) belül esik → kiesik
  const q = mk(3000, 4000, 'block200', 300, 'b120x120');
  const f = frameLayout(q);
  const lim = f.beam.width / 2 + 100;
  expect(stripLayout(q).innerSupportAxes).toEqual(f.supportAxes.filter(a => a > lim && a < f.L - lim));
  expect(stripLayout(q).innerSupportAxes.length).toBe(f.supportAxes.length - 2);
});

test('b2x50x150: bw 100, a tengely ugyanott', () => {
  const s = stripLayout(mk(3000, 4000, 'block300', 300, 'b2x50x150'));
  expect(s.P).toBe(13600);
  expect(s.longSills).toEqual([{ w: 50 }, { w: 2950 }]);
});

describe('sávalap a Task 2 előtt: a gerendakeretes alapértelmezés fut, hiba és NaN nélkül', () => {
  test.each([[3000, 4000], [4000, 3000], [2000, 2000], [6000, 8000], [12000, 12000]])('%i×%i', (w, l) => {
    const p = mk(w, l);
    const scene = buildScene(p);
    const calc = calculate(p);
    const views = DRAWING_VIEWS.map(v => renderView({ plan: p, scene, view: v, layers: ALL_LAYERS, palette: SCREEN_PALETTE }).svg);
    const model = buildModel3d(p, scene);
    const steps = buildAssembly(p, scene, calc);
    const todos = steps.map(s => stepTodo(p, scene, s));
    for (const s of [JSON.stringify(scene), JSON.stringify(calc), ...views, JSON.stringify(model), JSON.stringify(steps), JSON.stringify(todos)]) {
      expect(s).not.toMatch(/NaN|Infinity/);
    }
    for (const sol of model.solids) expect([...sol.origin, sol.depth].every(Number.isFinite)).toBe(true);
    expect(JSON.stringify(stripLayout(p))).not.toMatch(/NaN|Infinity|null/);
  });
});
