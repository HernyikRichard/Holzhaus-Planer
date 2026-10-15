import { createDefaultPlan } from '../src/model/defaults';
import type { Plan } from '../src/model/types';

/** 4×6 egyhajlású terv trapézlemezzel és padlóval (a calculate-teszt referenciája). */
export function mono4x6Plan(): Plan {
  const p = createDefaultPlan();
  p.building = { width: 4000, length: 6000, wallHeight: 2400 };
  p.roof = { ...p.roof, shape: 'mono', pitch: 10, covering: 'trapezoid', ridgeDirection: 'y' };
  p.floor.enabled = true;
  return p;
}
