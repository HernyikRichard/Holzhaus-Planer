import type { ValidationError } from '../model/validate';
import type { ViewId } from '../viewer/layers';
export type { ViewId, LayerId } from '../viewer/layers';

export type StepId = 'building' | 'foundation' | 'walls' | 'openings' | 'roof' | 'materials';

export interface StepDef { id: StepId; title: string; sections: string[]; views: ViewId[]; defaultView: ViewId }

export const STEPS: StepDef[] = [
  { id: 'building', title: 'Épület', sections: ['building'], views: ['floor', 'section'], defaultView: 'floor' },
  { id: 'foundation', title: 'Alap', sections: ['foundation', 'floor'], views: ['foundation', 'section', 'floor'], defaultView: 'foundation' },
  { id: 'walls', title: 'Falak', sections: ['walls'], views: ['floor', 'wall.N', 'wall.E', 'wall.S', 'wall.W', 'section'], defaultView: 'wall.E' },
  { id: 'openings', title: 'Nyílászárók', sections: [], views: ['floor', 'wall.N', 'wall.E', 'wall.S', 'wall.W'], defaultView: 'floor' },
  { id: 'roof', title: 'Tető', sections: ['roof', 'accessories'], views: ['roof', 'gable', 'section'], defaultView: 'roof' },
  { id: 'materials', title: 'Anyaglista', sections: ['settings'], views: ['table', 'cutplan'], defaultView: 'table' },
];

const PREFIXES: Record<StepId, string[]> = {
  building: ['building'],
  foundation: ['foundation', 'floor'],
  walls: ['walls'],
  openings: ['openings'],
  roof: ['roof', 'accessories'],
  materials: ['settings'],
};

export function stepHasError(step: StepId, errors: ValidationError[]): boolean {
  const prefixes = PREFIXES[step];
  return errors.some(e => prefixes.some(p => e.path === p || e.path.startsWith(p + '.') || e.path.startsWith(p + '[')));
}
