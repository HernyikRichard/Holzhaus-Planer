import type { Layer3dId, Model3d, Solid } from '../three-d/model';
import { boundsOf } from '../three-d/model';
import type { Scene } from '../scene/types';
import { stepIdOfElement, type AssemblyStep, type AssemblyStepId } from './steps';

/** Elem nélküli (szintetizált) 3D test lépése a rétege szerint. */
const LAYER_STEP: Record<Layer3dId, AssemblyStepId> = {
  ground: 'supports', foundation: 'foundation', supports: 'supports', beamFrame: 'beamFrame', floor: 'floor', wallFrame: 'wallTop', wallOsb: 'wallTop',
  interiorCladding: 'interior', vaporBarrier: 'interior', insulation: 'interior',
  breatherMembrane: 'exterior', wallBattens: 'exterior', exteriorCladding: 'exterior',
  roofFrame: 'roofFrame', decking: 'roofLayers', underlay: 'roofLayers', counterBatten: 'roofLayers', roofBatten: 'roofLayers',
  covering: 'covering', accessories: 'accessories', openings: 'openings',
};

/** Az alapsorrend (a falak egy rangon): a hiányzó cél-lépés helyett az utána következő meglévő lépés. */
const RANK: Record<AssemblyStepId, number> = {
  foundation: 0, supports: 1, beamFrame: 2, floor: 3, 'wall.N': 4, 'wall.E': 4, 'wall.S': 4, 'wall.W': 4, wallTop: 5, roofFrame: 6,
  roofLayers: 7, covering: 8, accessories: 9, openings: 10, exterior: 11, interior: 12,
};

/** Lépéslistánként: elem-id → lépésindex (a dupla koszorú felső sora csak a lépés `elementIds`-éből látszik). */
const indexCache = new WeakMap<AssemblyStep[], Map<string, number>>();
function elementIndex(steps: AssemblyStep[]): Map<string, number> {
  let m = indexCache.get(steps);
  if (!m) {
    m = new Map();
    steps.forEach((s, i) => { for (const id of s.elementIds) m!.set(id, i); });
    indexCache.set(steps, m);
  }
  return m;
}

function nearestStep(target: AssemblyStepId, steps: AssemblyStep[]): number {
  const exact = steps.findIndex(s => s.id === target);
  if (exact >= 0) return exact;
  const after = steps.findIndex(s => RANK[s.id] > RANK[target]);
  return after >= 0 ? after : Math.max(0, steps.length - 1);
}

/**
 * A 3D test lépésindexe: elemes testnél az elemet tartalmazó lépés, szintetizáltnál a réteg lépése;
 * ha a cél-lépés nincs a listában, a legközelebbi meglévő utána (ha nincs utána, az utolsó).
 */
export function stepOfSolid(solid: Solid, scene: Scene, steps: AssemblyStep[]): number {
  if (solid.elementId) {
    const i = elementIndex(steps).get(solid.elementId);
    if (i !== undefined) return i;
    const el = scene.elements.find(e => e.id === solid.elementId);
    if (el) return nearestStep(stepIdOfElement(el), steps);
  }
  return nearestStep(LAYER_STEP[solid.layer], steps);
}

/** A modell a `upTo` lépésig (bezárólag): a rétegek és a befoglaló a megmaradt testekből. */
export function filterModel(model: Model3d, upTo: number, stepOf: (s: Solid) => number): Model3d {
  const solids = model.solids.filter(s => stepOf(s) <= upTo);
  if (solids.length === model.solids.length) return model;
  const present = new Set(solids.map(s => s.layer));
  return { solids, layers: model.layers.filter(l => present.has(l)), bounds: boundsOf(solids) };
}
