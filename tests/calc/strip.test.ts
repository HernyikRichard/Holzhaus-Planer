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
  test('lábazati gerendák és belső tengelyek', () => {
    expect(s.longSills).toEqual([{ w: 50 }, { w: 2950 }]);
    expect(s.shortSills).toEqual([{ l: 50 }, { l: 3950 }]);
    const f = frameLayout(mk());
    expect(f.W - 2 * f.beam.width).toBe(2800); // a rövid lábazati gerendák hossza
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
  // keret-koordináták: a hosszú lábazati gerendák w (= y), a rövidek l (= x) mentén
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

// ---- Anyaglista (Task 3) ----
const lineOf = (p: Plan, id: string) => calculate(p).lines.find(l => l.id === id);
const qty = (p: Plan, id: string) => lineOf(p, id)?.quantity;
const hangerSum = (expl: string): number =>
  [...expl.split(' = ')[0].matchAll(/(\d+) párnafa × (\d+) gerenda/g)].reduce((s, m) => s + Number(m[1]) * Number(m[2]), 0);

describe('anyaglista 3×4 m, alapértékek (spec táblázat)', () => {
  const p = mk();
  test('beton: sáv 4,352 + lábazat 1,156 + pillértalp 0,256 + pillér-kitöltés 0,0288 = 5,7928 → 5,80', () => {
    expect(qty(p, 'foundation.concrete')).toBe(5.8);
    expect(lineOf(p, 'foundation.concrete')?.explanation).toContain('5,7928');
  });
  test('zsalukő, pillér, papucs, horgony, lemez, földkiemelés', () => {
    expect(qty(p, 'foundation.plinthBlock')).toBe(56);      // 2 sor × 28
    expect(qty(p, 'foundation.pierBlock')).toBe(4);         // 2 pillér × 2 sor
    expect(qty(p, 'foundation.pierBracket')).toBe(2);
    expect(lineOf(p, 'foundation.sillAnchors')?.explanation).toContain('2 × 5 + 2 × 4 = 18 db');
    expect(qty(p, 'foundation.sillAnchors')).toBe(18);      // 2 × (4000/1000 → 5) + 2 × (2800/1000 → 3 + 1 = 4)
    expect(qty(p, 'foundation.dpc')).toBe(15);              // 13,6 × 1,1 = 14,96 → 15,0
    expect(qty(p, 'foundation.excavation')).toBe(4.61);     // 4,352 + 0,256 = 4,608
  });
  test('Ø10: (4·(13600 + 3·500) + 28·(300 + 400 − 50) + 2·4·1000) / 6000 → 15', () => {
    // 60400 + 18200 + 8000 = 86600; 86600 / 6000 = 14,43
    expect(qty(p, 'foundation.rebar10')).toBe(15);
  });
  test('Ø8: 2 sor × 2 vonal × 15100 = 60400 → 11', () => { expect(qty(p, 'foundation.rebar8')).toBe(11); });
  test('Ø6: sáv 55 × 2100 + 2 pillér (5 × 1300 + 1 × 700) = 115500 + 14400 = 129900 → 22', () => {
    // sáv: ⌈13600 / 250⌉ = 55 kengyel, egy kengyel 2·(400−100) + 2·(800−100) + 100 = 2100
    // pillér (betonpillér-képlet): hosszvas = 800 − 50 + 300 − 50 = 1000; kengyel ⌊1000/200⌋ + 1 = 6,
    //   ebből a pillérben min(6, ⌊(300 − 50)/200⌋ = 1) = 1 (4·max(250 − 100, 100) + 100 = 700), a talpban 5 (4·300 + 100 = 1300)
    const total = 55 * 2100 + 2 * (5 * 1300 + 1 * 700);
    expect(total).toBe(129900);
    expect(qty(p, 'foundation.rebar6')).toBe(Math.ceil(total / 6000)); // 21,65 → 22
    expect(qty(p, 'foundation.rebar6')).toBe(22);
  });
  test('nincs talajcsavar, pontalap és betonpillér-csőtartozék', () => {
    for (const id of ['foundation.groundScrew', 'foundation.screwHead', 'foundation.postBase', 'foundation.pierTube']) {
      expect(lineOf(p, id)).toBeUndefined();
    }
  });
  test('beamBolts a belső pillérek fejeire', () => {
    const bolts = qty(p, 'foundation.beamBolts') as number;
    expect(bolts).toBeGreaterThan(0);
    expect(bolts % 2).toBe(0);
  });
  test('a támaszok száma = a scene support elemei', () => {
    const sup = buildScene(p).elements.filter(e => e.kind === 'support').length;
    expect(sup).toBe(2);
    expect(qty(p, 'foundation.pierBracket')).toBe(sup);
  });
});

describe('gerendasaru magyarázata a jelenet darabszámaiból', () => {
  test('3×4 m: a magyarázat összege a darabszám, a peremi párnafák csak a lábazati gerendákon', () => {
    const p = mk();
    const l = lineOf(p, 'foundation.joistHangers')!;
    expect(hangerSum(l.explanation!)).toBe(l.quantity);
    expect(l.explanation).toMatch(/\d+ párnafa × 3 gerenda \+ \d+ párnafa × 2 gerenda/);
  });
});

describe('2×2 m: nincs belső pillér', () => {
  test('50×100-as párnafa: 1 belső gerenda, 0 pillér → nincs pierBlock / pierBracket / beamBolts', () => {
    const p = mk(2000, 2000);
    expect(stripLayout(p).innerBeamAxes.length).toBe(1);
    for (const id of ['foundation.pierBlock', 'foundation.pierBracket', 'foundation.beamBolts']) expect(lineOf(p, id)).toBeUndefined();
    expect(qty(p, 'foundation.plinthBlock')).toBe(2 * Math.ceil(7600 / 500));
    expect(lineOf(p, 'foundation.concrete')?.explanation).not.toMatch(/pillér/);
  });
  test('50×150-es párnafa: nincs belső gerenda sem', () => {
    const p = mk(2000, 2000); p.floor.joistSection = { t: 50, w: 150 };
    expect(stripLayout(p).innerBeamAxes).toEqual([]);
    for (const id of ['foundation.pierBlock', 'foundation.pierBracket', 'foundation.beamBolts']) expect(lineOf(p, id)).toBeUndefined();
    expect(qty(p, 'foundation.sillAnchors')).toBe(2 * 3 + 2 * 3); // hosszú 2000 → 2 + 1, rövid 1800 → 2 + 1
  });
});

test('lábazat 60 cm: 3 sor (a felső vágott), 3 × 28 kő, bekötővas 600 + 400 − 50', () => {
  const p = mk(3000, 4000, 'block250', 600);
  const s = stripLayout(p);
  expect([s.rows, s.topRowCut]).toEqual([3, true]);
  expect(qty(p, 'foundation.plinthBlock')).toBe(3 * 28);
  expect(qty(p, 'foundation.pierBlock')).toBe(2 * 3);
  expect(qty(p, 'foundation.rebar8')).toBe(Math.ceil(3 * 2 * 15100 / 6000));
  // Ø10: 60400 + 28 · (600 + 400 − 50) + 2 · 4 · (800 − 50 + 600 − 50)
  expect(qty(p, 'foundation.rebar10')).toBe(Math.ceil((60400 + 28 * 950 + 8 * 1300) / 6000));
});

test('fordított tájolás 4×3 m: ugyanazok a mennyiségek', () => {
  const pick = (p: Plan) => calculate(p).lines.filter(l => l.id.startsWith('foundation.') && l.id !== 'foundation.joistHangers').map(l => [l.id, l.quantity]);
  expect(pick(mk(4000, 3000))).toEqual(pick(mk(3000, 4000)));
});

describe('szerelés: a vízszigetelés és a horgonyok a gerendakeret lépésében', () => {
  const p = mk();
  const steps = buildAssembly(p, buildScene(p), calculate(p));
  const stepOf = (id: string) => steps.find(s => s.lines.some(l => l.lineId === id))?.id;
  test('dpc, sillAnchors → beamFrame; a többi foundation.* → supports', () => {
    expect(stepOf('foundation.dpc')).toBe('beamFrame');
    expect(stepOf('foundation.sillAnchors')).toBe('beamFrame');
    for (const id of ['foundation.concrete', 'foundation.rebar10', 'foundation.rebar8', 'foundation.rebar6', 'foundation.plinthBlock',
      'foundation.pierBlock', 'foundation.pierBracket', 'foundation.excavation']) expect(stepOf(id)).toBe('supports');
    expect(stepOf('foundation.beamBolts')).toBe('beamFrame');
  });
});

describe('mátrix 2×2 – 12×12 m, három zsalukő, három gerenda', () => {
  const sizes: Array<[number, number]> = [[2000, 2000], [2000, 3000], [3000, 3000], [3000, 4000], [4000, 3000], [5000, 7000], [8000, 6000], [12000, 12000]];
  const blocks: PlinthBlock[] = ['block200', 'block250', 'block300'];
  const beams: BeamSectionId[] = ['b100x150', 'b120x120', 'b2x50x150'];
  for (const [w, l] of sizes) {
    test.each(blocks.flatMap(b => beams.map(bm => [b, bm] as const)))(`${w}×${l} %s %s`, (block, beam) => {
      const p = mk(w, l, block, 300, beam);
      const calc = calculate(p);
      expect(JSON.stringify(calc.lines)).not.toMatch(/NaN|Infinity/);
      const s = stripLayout(p);
      const sup = buildScene(p).elements.filter(e => e.kind === 'support').length;
      expect(sup).toBe(s.pierCount);
      expect(qty(p, 'foundation.pierBracket') ?? 0).toBe(sup);
      expect(qty(p, 'foundation.pierBlock') ?? 0).toBe(sup * s.rows);
      expect(qty(p, 'foundation.plinthBlock')).toBe(s.rows * s.blocksPerRow);
      if (sup === 0) expect(lineOf(p, 'foundation.beamBolts')).toBeUndefined();
      else expect(qty(p, 'foundation.beamBolts')).toBeGreaterThan(0);
      for (const id of ['foundation.dpc', 'foundation.sillAnchors', 'foundation.concrete', 'foundation.rebar6']) expect(qty(p, id)).toBeGreaterThan(0);
      const hl = lineOf(p, 'foundation.joistHangers')!;
      expect(hangerSum(hl.explanation!)).toBe(hl.quantity);
    });
  }
});
