import { describe, expect, test } from 'vitest';
import { createDefaultPlan } from '../../src/model/defaults';
import type { Plan } from '../../src/model/types';
import { calculate } from '../../src/calc';
import { buildScene } from '../../src/scene/build';
import { buildModel3d, solidBounds, type Layer3dId, type Solid } from '../../src/three-d/model';
import { buildAssembly, type AssemblyStepId } from '../../src/assembly/steps';
import { filterModel, stepOfSolid } from '../../src/assembly/solids';
import { mono4x6Plan } from '../fixtures';

function variant(f: (p: Plan) => void, base: () => Plan = mono4x6Plan): Plan {
  const p = base();
  f(p);
  return p;
}

// a Task 1 mátrix néhány terve (mono4x6 alapú) és az alapterv
const PLANS: Array<[string, Plan]> = [
  ['default', createDefaultPlan()],
  ['mono/y/padló/trapezoid/double', mono4x6Plan()],
  ['flat/x/nincs padló/epdm/single', variant(p => {
    p.roof = { ...p.roof, shape: 'flat', ridgeDirection: 'x', covering: 'epdm', pitch: 3 }; p.floor.enabled = false; p.walls.topPlate = 'single';
  })],
  ['gable/x/padló/standingSeam/single', variant(p => {
    p.roof = { ...p.roof, shape: 'gable', ridgeDirection: 'x', covering: 'standingSeam', pitch: 25 }; p.walls.topPlate = 'single';
  })],
  ['gable/y/nincs padló/tile/double', variant(p => {
    p.roof = { ...p.roof, shape: 'gable', ridgeDirection: 'y', covering: 'tile', pitch: 25 }; p.floor.enabled = false;
  })],
  ['mono/x/padló/shingle/double', variant(p => { p.roof = { ...p.roof, shape: 'mono', ridgeDirection: 'x', covering: 'shingle', pitch: 25 }; })],
];

const SYNTH: Partial<Record<Layer3dId, AssemblyStepId>> = {
  foundation: 'foundation', floor: 'floor', interiorCladding: 'interior', vaporBarrier: 'interior', insulation: 'interior',
  breatherMembrane: 'exterior', wallBattens: 'exterior', exteriorCladding: 'exterior', decking: 'roofLayers', underlay: 'roofLayers',
  covering: 'covering', accessories: 'accessories', openings: 'openings',
};

describe.each(PLANS)('%s', (_n, plan) => {
  const scene = buildScene(plan);
  const steps = buildAssembly(plan, scene, calculate(plan));
  const model = buildModel3d(plan, scene);
  const idx = (id: AssemblyStepId) => steps.findIndex(s => s.id === id);

  test('stepOfSolid covers every solid', () => {
    expect(model.solids.length).toBeGreaterThan(0);
    for (const s of model.solids) {
      const i = stepOfSolid(s, scene, steps);
      expect(Number.isInteger(i)).toBe(true);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(steps.length);
      if (s.elementId) expect(steps[i].elementIds).toContain(s.elementId);
      else expect(steps[i].id, `${s.layer} ${s.label}`).toBe(SYNTH[s.layer]);
      if (s.layer === 'exteriorCladding') expect(i).toBe(idx('exterior'));
    }
    expect(model.solids.some(s => s.layer === 'exteriorCladding')).toBe(true);
  });

  test('filterModel keeps solids up to the step', () => {
    const stepOf = (s: Solid) => stepOfSolid(s, scene, steps);
    for (const upTo of [0, idx('wallTop'), idx('covering'), steps.length - 1]) {
      const f = filterModel(model, upTo, stepOf);
      const want = model.solids.filter(s => stepOf(s) <= upTo);
      expect(f.solids).toEqual(want);
      expect(f.layers).toEqual(model.layers.filter(l => want.some(s => s.layer === l)));
      for (let k = 0; k < 3; k++) {
        expect(f.bounds.min[k]).toBeCloseTo(Math.min(...want.map(s => solidBounds(s).min[k])), 6);
        expect(f.bounds.max[k]).toBeCloseTo(Math.max(...want.map(s => solidBounds(s).max[k])), 6);
      }
    }
    expect(filterModel(model, steps.length - 1, stepOf)).toEqual(model);
  });
});

describe('stepOfSolid fallbacks', () => {
  const plan = createDefaultPlan();
  const scene = buildScene(plan);
  const steps = buildAssembly(plan, scene, calculate(plan));
  const model = buildModel3d(plan, scene);

  test('missing target step → nearest existing step after it', () => {
    const without = steps.filter(s => s.id !== 'covering');
    const cov = model.solids.find(s => s.layer === 'covering')!;
    expect(without[stepOfSolid(cov, scene, without)].id).toBe('accessories');
    // utána nincs lépés → az utolsó
    const noInterior = steps.filter(s => s.id !== 'interior');
    const ins = model.solids.find(s => s.layer === 'insulation')!;
    expect(stepOfSolid(ins, scene, noInterior)).toBe(noInterior.length - 1);
  });

  test('element not in any step → by its kind', () => {
    const rafter = model.solids.find(s => s.layer === 'roofFrame' && s.elementId)!;
    const noEls = steps.map(s => ({ ...s, elementIds: [] }));
    expect(noEls[stepOfSolid(rafter, scene, noEls)].id).toBe('roofFrame');
  });

  test('empty model filter', () => {
    const f = filterModel(model, -1, () => 0);
    expect(f.solids).toEqual([]);
    expect(f.layers).toEqual([]);
    expect(f.bounds).toEqual({ min: [0, 0, 0], max: [0, 0, 0] });
  });
});
