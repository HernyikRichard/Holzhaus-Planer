import { createHash } from 'node:crypto';
import { createDefaultPlan } from '../../src/model/defaults';
import type { BeamSectionId, Plan } from '../../src/model/types';
import { calculate } from '../../src/calc';
import { buildScene } from '../../src/scene/build';
import { renderView } from '../../src/viewer/render';
import { SCREEN_PALETTE } from '../../src/viewer/theme';
import type { ViewId } from '../../src/viewer/layers';
import { buildModel3d } from '../../src/three-d/model';
import { buildAssembly } from '../../src/assembly/steps';
import { stepTodo } from '../../src/assembly/todo';

/** A változatlanság-fixture tervei: betonlemez alapterv és három talajcsavaros keret. */
function screw(width: number, length: number, beam: BeamSectionId = 'b100x150', sp: 'auto' | number = 'auto'): Plan {
  const p = createDefaultPlan();
  p.building.width = width; p.building.length = length;
  p.foundation.type = 'groundScrew';
  p.foundation.frame.beamSection = beam; p.foundation.frame.supportSpacing = sp;
  return p;
}

export const FRAME_FIXTURE_PLANS: Record<string, () => Plan> = {
  'slab default': () => createDefaultPlan(),
  'groundScrew 3000x4000': () => screw(3000, 4000),
  'groundScrew 6000x8000 b2x50x150': () => screw(6000, 8000, 'b2x50x150'),
  'groundScrew 3000x3000 sp1200': () => screw(3000, 3000, 'b100x150', 1200),
};

export const DRAWING_VIEWS: ViewId[] = ['floor', 'wall.N', 'wall.E', 'wall.S', 'wall.W', 'section', 'roof', 'gable', 'foundation'];
export const ALL_LAYERS = { frame: true, sheathing: true, battens: true, fasteners: true, dims: true, grid: true, mesh: true };

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** Egy terv minden kimenetének SHA-256 hash-e (scene, anyaglista, 9 nézet, 3D, szerelés + teendők). */
export function frameOutputHashes(plan: Plan): Record<string, string> {
  const scene = buildScene(plan);
  const calc = calculate(plan);
  const out: Record<string, string> = {
    scene: sha(JSON.stringify(scene)),
    calcLines: sha(JSON.stringify(calc.lines)),
    calcWarnings: sha(JSON.stringify(calc.warnings)),
  };
  for (const v of DRAWING_VIEWS) {
    const r = renderView({ plan, scene, view: v, layers: ALL_LAYERS, palette: SCREEN_PALETTE });
    out[`view ${v}`] = sha(JSON.stringify(r));
  }
  out.model3d = sha(JSON.stringify(buildModel3d(plan, scene)));
  const steps = buildAssembly(plan, scene, calc);
  out.assembly = sha(JSON.stringify(steps));
  out.assemblyTodo = sha(JSON.stringify(steps.map(s => stepTodo(plan, scene, s))));
  return out;
}

export function allFrameOutputHashes(): Record<string, Record<string, string>> {
  return Object.fromEntries(Object.entries(FRAME_FIXTURE_PLANS).map(([k, mk]) => [k, frameOutputHashes(mk())]));
}
