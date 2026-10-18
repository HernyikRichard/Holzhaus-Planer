import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createDefaultPlan } from '../../src/model/defaults';
import type { Plan, RoofCovering, RoofShape } from '../../src/model/types';
import { calculate } from '../../src/calc';
import { buildScene } from '../../src/scene/build';
import { elementsToPieces } from '../../src/scene/toPieces';
import { wallBattenPieces } from '../../src/calc/walls';
import { wallGeometry } from '../../src/calc/geometry';
import type { FastenerKind } from '../../src/scene/types';
import {
  ASSEMBLY_TITLES, buildAssembly, cutText, isTimberStockLine, stepIdOfElement, stepIdOfLine, type AssemblyStepId,
} from '../../src/assembly/steps';
import { mono4x6Plan } from '../fixtures';

const ORDER: AssemblyStepId[] = ['foundation', 'floor', 'wall.N', 'wall.E', 'wall.S', 'wall.W', 'wallTop',
  'roofFrame', 'roofLayers', 'covering', 'accessories', 'openings', 'exterior', 'interior'];

interface Variant {
  shape: RoofShape; ridge: 'x' | 'y'; floor: boolean; covering: RoofCovering; plate: 'single' | 'double';
  /** minden falréteg kikapcsolva (fali OSB és belső / külső rétegek nélkül) */
  noWallLayers?: boolean;
  /** OSB tetődeszkázat */
  osbDecking?: boolean;
}

function planOf(v: Variant): Plan {
  const p = mono4x6Plan();
  p.roof = { ...p.roof, shape: v.shape, ridgeDirection: v.ridge, covering: v.covering, pitch: v.shape === 'flat' ? 3 : 25 };
  p.floor.enabled = v.floor;
  p.walls.topPlate = v.plate;
  if (v.noWallLayers) for (const l of p.walls.layers) l.enabled = false;
  if (v.osbDecking) for (const l of p.roof.layers) if (l.kind === 'decking') l.material = 'osb';
  return p;
}

// teljes szorzat: 3 × 2 × 2 × 5 × 2 = 120; a tényezők indexeinek összege páros → 60 kombináció,
// amelyben bármely két tényező minden értékpárja előfordul
const all: Array<[Variant, number]> = [];
(['flat', 'mono', 'gable'] as RoofShape[]).forEach((shape, a) => (['x', 'y'] as const).forEach((ridge, b) =>
  [true, false].forEach((floor, c) => (['tile', 'trapezoid', 'shingle', 'epdm', 'standingSeam'] as RoofCovering[]).forEach((covering, d) =>
    (['single', 'double'] as const).forEach((plate, e) => all.push([{ shape, ridge, floor, covering, plate }, a + b + c + d + e]))))));
const matrix = all.filter(([, k]) => k % 2 === 0).map(([v]) => v);
// falrétegek nélkül: az OSB-csavar sora a padlóhoz / a tetőrétegekhez kerül, belső / külső lépés nincs
matrix.push(
  { shape: 'gable', ridge: 'y', floor: true, covering: 'tile', plate: 'double', noWallLayers: true },
  { shape: 'gable', ridge: 'x', floor: true, covering: 'shingle', plate: 'single', noWallLayers: true, osbDecking: true },
  { shape: 'mono', ridge: 'x', floor: false, covering: 'standingSeam', plate: 'double', noWallLayers: true, osbDecking: true },
  { shape: 'flat', ridge: 'y', floor: false, covering: 'epdm', plate: 'single', noWallLayers: true },
);

/** A héjazattól függő sorok várt lépése (a mátrixban előforduló id-k). */
const COVERING_LINES: Record<string, AssemblyStepId> = {
  'roof.tiles': 'covering', 'roof.trapezoid': 'covering', 'roof.shingles': 'covering', 'roof.epdm': 'covering',
  'roof.standingSeam': 'covering', 'roof.seamEaveFlashing': 'covering', 'roof.seamRakeFlashing': 'covering',
  'fix.seamClips': 'covering', 'fix.seamClipScrews': 'covering', 'fix.tileClips': 'covering',
  'acc.ridgeCap': 'covering', 'acc.ridgeTiles': 'covering', 'acc.ridgeVent': 'covering',
};

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { warn.mockRestore(); });

const name = (v: Variant) => `${v.shape}/${v.ridge}/${v.floor ? 'padló' : 'nincs padló'}/${v.covering}/${v.plate}`
  + `${v.noWallLayers ? '/falrétegek nélkül' : ''}${v.osbDecking ? '/OSB deszkázat' : ''}`;

describe.each(matrix.map(v => [name(v), v] as const))('%s', (_n, v) => {
  const plan = planOf(v);
  const scene = buildScene(plan);
  const calc = calculate(plan);
  const steps = buildAssembly(plan, scene, calc);

  test('every element in exactly one step', () => {
    const seen = steps.flatMap(s => s.elementIds);
    expect(new Set(seen).size).toBe(seen.length);
    expect([...seen].sort()).toEqual(scene.elements.map(e => e.id).sort());
    expect(scene.elements.some(e => e.kind === 'meshSheet')).toBe(true);
  });

  test('every cut piece in exactly one step', () => {
    const want = [...elementsToPieces(scene.elements), ...wallBattenPieces(plan)].map(p => p.id!);
    const got = steps.flatMap(s => s.pieces.flatMap(p => p.elementIds));
    expect(new Set(got).size).toBe(got.length);
    expect([...got].sort()).toEqual([...want].sort());
    for (const s of steps) for (const p of s.pieces) {
      expect(p.count).toBe(p.elementIds.length);
      // „3–4. sz. 5 m-es szál”, több szálhossznál „; ”-vel, nem egymást követő száloknál „, ”-vel
      const one = String.raw`\d+(–\d+)?\.(, \d+(–\d+)?\.)* sz\. [\d,]+ m-es szál`;
      expect(p.cut).toMatch(new RegExp(`^${one}(; ${one})*$`));
    }
    // a fali lécek a külső rétegek lépésében
    const ext = steps.find(s => s.id === 'exterior');
    for (const id of wallBattenPieces(plan).map(p => p.id!)) expect(ext!.pieces.some(p => p.elementIds.includes(id))).toBe(true);
  });

  test('every non-timber line in exactly one step with its quantity', () => {
    const steps = buildAssembly(plan, scene, calc); // a console.warn spy itt már él
    const nonTimber = calc.lines.filter(l => !isTimberStockLine(l));
    const got = steps.flatMap(s => s.lines);
    expect(got.map(l => l.lineId).sort()).toEqual(nonTimber.map(l => l.id).sort());
    for (const l of nonTimber) {
      const g = got.find(x => x.lineId === l.id)!;
      expect(g).toEqual({ lineId: l.id, name: l.name, quantity: l.quantity, unit: l.unit });
    }
    for (const l of calc.lines) expect(stepIdOfLine(l, plan) === null).toBe(isTimberStockLine(l));
    expect(warn).not.toHaveBeenCalled();
  });

  test('fastener counts per kind sum to the drawn points', () => {
    const sum = (k: FastenerKind) => scene.fasteners.filter(f => f.kind === k).reduce((a, f) => a + f.count, 0);
    for (const k of ['anchor', 'frameScrew', 'osbScrew', 'hurricaneTie'] as FastenerKind[]) {
      const got = steps.flatMap(s => s.fasteners).filter(f => f.kind === k).reduce((a, f) => a + f.count, 0);
      expect(got).toBe(sum(k));
    }
    for (const s of steps) expect(new Set(s.fasteners.map(f => f.kind)).size).toBe(s.fasteners.length);
    // horgony a fal lépésében, viharkapocs a tetővázban
    for (const s of steps) for (const f of s.fasteners) {
      if (f.kind === 'anchor') expect(s.id.startsWith('wall.')).toBe(true);
      if (f.kind === 'hurricaneTie') expect(s.id).toBe('roofFrame');
    }
  });

  test('covering-specific lines land in the expected step', () => {
    const present = calc.lines.filter(l => COVERING_LINES[l.id] !== undefined);
    expect(present.length).toBeGreaterThan(0);
    for (const l of present) {
      const s = steps.find(x => x.lines.some(y => y.lineId === l.id))!;
      expect(s.id, l.id).toBe(COVERING_LINES[l.id]);
    }
    // a héjazat fő sora mindig a héjazat lépésében
    const main = { tile: 'roof.tiles', trapezoid: 'roof.trapezoid', shingle: 'roof.shingles', epdm: 'roof.epdm', standingSeam: 'roof.standingSeam' }[v.covering];
    expect(present.map(l => l.id)).toContain(main);
  });

  test('step order', () => {
    const ids = steps.map(s => s.id);
    const rank = (id: AssemblyStepId) => ORDER.indexOf(id);
    const walls = ids.filter(id => id.startsWith('wall.'));
    expect(walls).toHaveLength(4);
    const full = wallGeometry(plan).filter(w => w.full).map(w => `wall.${w.side}`);
    const short = wallGeometry(plan).filter(w => !w.full).map(w => `wall.${w.side}`);
    expect(walls).toEqual([...full, ...short]);
    const nonWall = ids.filter(id => !id.startsWith('wall.'));
    expect(nonWall).toEqual([...nonWall].sort((a, b) => rank(a) - rank(b)));
    expect(ids.indexOf(walls[0])).toBe(ids.indexOf('floor') + 1 || 1);
    if (ids.includes('wallTop')) expect(ids.indexOf('wallTop')).toBe(ids.indexOf(walls[3]) + 1);
    steps.forEach((s, i) => { expect(s.index).toBe(i); expect(s.title).toBe(ASSEMBLY_TITLES[s.id]); expect(s.todo.length).toBeGreaterThanOrEqual(3); expect(s.todo.length).toBeLessThanOrEqual(6); });
    for (const s of steps) expect(s.elementIds.length + s.lines.length + s.pieces.length).toBeGreaterThan(0);
    expect(ids.includes('floor')).toBe(v.floor);
  });

  test('disabled layers have no step; OSB screws go to the first step with OSB', () => {
    const ids = steps.map(s => s.id);
    const on = (...kinds: string[]) => plan.walls.layers.some(l => kinds.includes(l.kind) && l.enabled);
    expect(ids.includes('interior')).toBe(on('insulation', 'vaporBarrier', 'interiorCladding'));
    expect(ids.includes('exterior')).toBe(on('breatherMembrane', 'battens', 'exteriorCladding'));
    // OSB-t tartalmazó lépések a sorok alapján, szerelési sorrendben
    const has = (id: string) => calc.lines.some(l => l.id === id);
    const osbSteps: AssemblyStepId[] = [];
    if (has('wall.osb')) osbSteps.push('wallTop');
    if (calc.lines.some(l => l.id === 'wall.interiorCladding' && l.name.includes('OSB'))) osbSteps.push('interior');
    if (has('floor.osb')) osbSteps.push('floor');
    if (calc.lines.some(l => l.id === 'roof.decking' && l.unit === 'tábla')) osbSteps.push('roofLayers');
    const screws = steps.find(s => s.lines.some(l => l.lineId === 'fix.osbScrews'));
    expect(screws?.id).toBe(osbSteps[0]);
  });

  test('double top plate', () => {
    const top = steps.find(s => s.id === 'wallTop');
    for (const w of wallGeometry(plan)) {
      const plates = scene.elements.filter(e => e.group === `wall.${w.side}` && e.kind === 'topPlate');
      const upper = plates.reduce((a, b) => (b.geom.v > a.geom.v ? b : a));
      const wallStep = steps.find(s => s.id === `wall.${w.side}`)!;
      if (v.plate === 'double') {
        expect(plates).toHaveLength(2);
        expect(top!.elementIds).toContain(upper.id);
        for (const p of plates.filter(p => p !== upper)) expect(wallStep.elementIds).toContain(p.id);
      } else {
        expect(wallStep.elementIds).toContain(upper.id);
      }
    }
  });
});

describe('missing parts drop steps', () => {
  test('no floor → no floor step', () => {
    const p = createDefaultPlan(); p.floor.enabled = false;
    const ids = buildAssembly(p, buildScene(p), calculate(p)).map(s => s.id);
    expect(ids).not.toContain('floor');
    p.floor.enabled = true;
    expect(buildAssembly(p, buildScene(p), calculate(p)).map(s => s.id)).toContain('floor');
  });

  test('all exterior layers off → no exterior step', () => {
    const p = createDefaultPlan();
    for (const l of p.walls.layers) if (['breatherMembrane', 'battens', 'exteriorCladding'].includes(l.kind)) l.enabled = false;
    const ids = buildAssembly(p, buildScene(p), calculate(p)).map(s => s.id);
    expect(ids).not.toContain('exterior');
    expect(ids).toContain('interior');
  });

  test('floor on, wall OSB and interior layers off → OSB screws in the floor step, no interior step', () => {
    const p = createDefaultPlan();
    p.floor.enabled = true;
    for (const l of p.walls.layers) if (['osb', 'insulation', 'vaporBarrier', 'interiorCladding'].includes(l.kind)) l.enabled = false;
    const steps = buildAssembly(p, buildScene(p), calculate(p));
    expect(steps.map(s => s.id)).not.toContain('interior');
    expect(steps.find(s => s.lines.some(l => l.lineId === 'fix.osbScrews'))!.id).toBe('floor');
  });

  test('wall OSB off, gypsum interior, OSB roof decking → OSB screws in roof layers', () => {
    const p = createDefaultPlan();
    for (const l of p.walls.layers) {
      if (l.kind === 'osb') l.enabled = false;
      if (l.kind === 'interiorCladding') l.material = 'gypsum';
    }
    for (const l of p.roof.layers) if (l.kind === 'decking') l.material = 'osb';
    const steps = buildAssembly(p, buildScene(p), calculate(p));
    expect(steps.find(s => s.lines.some(l => l.lineId === 'fix.osbScrews'))!.id).toBe('roofLayers');
    expect(steps.find(s => s.id === 'interior')!.todo.join('\n')).not.toMatch(/OSB/);
  });

  test('wall OSB off, OSB interior cladding → OSB screws in the interior step', () => {
    const p = createDefaultPlan();
    p.floor.enabled = true;
    for (const l of p.walls.layers) if (l.kind === 'osb') l.enabled = false;
    const steps = buildAssembly(p, buildScene(p), calculate(p));
    const interior = steps.find(s => s.id === 'interior')!;
    expect(interior.lines.map(l => l.lineId)).toContain('fix.osbScrews');
    expect(interior.todo.join('\n')).toMatch(/belső burkolatot \(\d+ tábla\), \d+ doboz OSB-csavarral/);
  });

  test('all interior layers off → no interior step', () => {
    const p = createDefaultPlan();
    for (const l of p.walls.layers) if (['insulation', 'vaporBarrier', 'interiorCladding'].includes(l.kind)) l.enabled = false;
    expect(buildAssembly(p, buildScene(p), calculate(p)).map(s => s.id)).not.toContain('interior');
  });

  test('flat EPDM roof → roofLayers only decking/underlay', () => {
    const p = createDefaultPlan();
    p.roof = { ...p.roof, shape: 'flat', pitch: 2, covering: 'epdm' };
    const steps = buildAssembly(p, buildScene(p), calculate(p));
    const rl = steps.find(s => s.id === 'roofLayers')!;
    expect(rl.elementIds).toEqual([]);
    expect(rl.pieces).toEqual([]);
    expect(rl.lines.map(l => l.lineId).sort()).toEqual(['roof.decking', 'roof.underlay']);
    expect(steps.find(s => s.id === 'covering')!.lines.map(l => l.lineId)).toContain('roof.epdm');
  });

  test('no openings → no openings step', () => {
    const p = createDefaultPlan(); p.openings = [];
    expect(buildAssembly(p, buildScene(p), calculate(p)).map(s => s.id)).not.toContain('openings');
  });
});

describe('mapping helpers', () => {
  const p = createDefaultPlan();
  const scene = buildScene(p);
  test('stepIdOfElement by kind and group', () => {
    const of = (id: string) => stepIdOfElement(scene.elements.find(e => e.id === id)!);
    expect(of('foundation.meshSheet.1')).toBe('foundation');
    expect(of('wall.E.stud.1')).toBe('wall.E');
    expect(of('wall.E.osbSheet.1')).toBe('wallTop');
    expect(of('roof.L.rafter.1')).toBe('roofFrame');
    expect(of('roof.ridge.ridge.1')).toBe('roofFrame');
    expect(of('roof.L.roofBatten.1')).toBe('roofLayers');
    expect(of('roof.L.fascia.1')).toBe('accessories');
    expect(scene.elements.filter(e => e.kind === 'opening').map(stepIdOfElement)).toEqual(['openings', 'openings']);
  });

  test('stepIdOfLine', () => {
    const line = (id: string) => ({ id, category: 'Alap' as const, name: id, quantity: 1, unit: 'db' as const, explanation: '' });
    expect(stepIdOfLine(line('timber.Fal.50x100.5000'))).toBeNull();
    expect(stepIdOfLine(line('foundation.concrete'))).toBe('foundation');
    expect(stepIdOfLine(line('wall.osb'))).toBe('wallTop');
    expect(stepIdOfLine(line('fix.hurricaneTies'))).toBe('roofFrame');
    expect(stepIdOfLine(line('fix.seamClipScrews'))).toBe('covering');
    expect(stepIdOfLine(line('acc.ridgeCap'))).toBe('covering');
    expect(stepIdOfLine(line('acc.gutterBrackets'))).toBe('accessories');
    expect(stepIdOfLine(line('fix.claddingNails'))).toBe('exterior');
    expect(stepIdOfLine(line('valami.ismeretlen'))).toBe('interior');
    expect(warn).toHaveBeenCalled();
  });

  test('unknown line at runtime → last step with warning', () => {
    const calc = calculate(p);
    calc.lines.push({ id: 'valami.ismeretlen', category: 'Alap', name: 'X', quantity: 3, unit: 'db', explanation: '' });
    const steps = buildAssembly(p, scene, calc);
    expect(steps.at(-1)!.lines.some(l => l.lineId === 'valami.ismeretlen')).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  test('cut reference text formats', () => {
    const r = (stockLength: number, stockIndex: number) => ({ stockLength, stockIndex, offset: 0, siblings: [] });
    expect(cutText([r(5000, 4), r(5000, 3)])).toBe('3–4. sz. 5 m-es szál');
    expect(cutText([r(5000, 3)])).toBe('3. sz. 5 m-es szál');
    expect(cutText([r(5000, 3), r(5000, 3)])).toBe('3. sz. 5 m-es szál');
    expect(cutText([r(5000, 5), r(5000, 8), r(5000, 6)])).toBe('5–6., 8. sz. 5 m-es szál');
    expect(cutText([r(3000, 1), r(6000, 10), r(5000, 1), r(5000, 2)])).toBe('10. sz. 6 m-es szál; 1–2. sz. 5 m-es szál; 1. sz. 3 m-es szál');
    expect(cutText([r(4500, 2)])).toBe('2. sz. 4,5 m-es szál');
    expect(cutText([])).toBe('');
  });

  test('cut reference text', () => {
    const steps = buildAssembly(p, scene, calculate(p));
    const studs = steps.find(s => s.id === 'wall.N')!.pieces.find(x => x.label === 'oszlop')!;
    const idx = [...new Set(studs.elementIds.map(id => scene.cut[id].stockIndex))].sort((a, b) => a - b);
    expect(studs.cut).toContain(`${idx[0]}`);
    expect(studs.cut).toMatch(/m-es szál$/);
    expect(studs.section).toBe('5×10 cm');
  });
});
