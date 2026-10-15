import type { Plan } from '../model/types';
import { setPath, type FieldDef } from '../ui/fields';
import { parseNumberInput } from '../ui/format';
import { BATTEN_SECTION } from '../catalog';

type Unit = NonNullable<FieldDef['unit']>;
const FACTOR: Record<Unit, number> = { m: 1000, cm: 10, mm: 1, '°': 1, '%': 0.01 };

export type RoofShape = 'flat' | 'mono' | 'gable';
export const PITCH_DEFAULT: Record<RoofShape, number> = { flat: 3, mono: 10, gable: 30 };
export const PITCH_RANGE: Record<RoofShape, readonly [number, number]> = { flat: [1, 10], mono: [5, 45], gable: [10, 60] };

// A réteganyag változásakor a vastagság az anyaghoz igazodik (0: burkolat, 3: OSB; lásd fields.ts).
const LAYER_THICKNESS: Record<string, number> = { osb12: 12, osb15: 15, osb: 12, gypsum: 12.5, paneling: 12 };
const DERIVED_LAYERS = new Set([0, 3]);

/** Tárolt (mm / arány / fok) érték a felületi egységben, tizedesvesszővel. */
export function toDisplay(def: Pick<FieldDef, 'unit'>, value: number): string {
  const v = value / FACTOR[def.unit ?? 'mm'];
  return String(Math.round(v * 1e4) / 1e4).replace('.', ',');
}

/** A beírt szövegből tárolt érték; érvénytelen szövegre null. */
export function toStored(def: Pick<FieldDef, 'unit'>, text: string): number | null {
  const n = parseNumberInput(text);
  if (n === null) return null;
  return Math.round(n * FACTOR[def.unit ?? 'mm'] * 1e6) / 1e6;
}

/** Egy mező módosítása a mellékhatásokkal együtt (a draft-on). */
export function applyFieldChange(draft: Plan, path: string, value: unknown): void {
  if (path === 'floor.insulation.type') {
    const old = draft.floor.insulation;
    draft.floor.insulation = value === 'none' ? null
      : { type: value as 'mineralWool' | 'xps', thickness: old?.thickness ?? 100 };
    return;
  }
  const layerMat = /^walls\.layers\.(\d+)\.material$/.exec(path);
  if (layerMat) {
    const idx = Number(layerMat[1]);
    draft.walls.layers[idx].material = value as string;
    const thickness = LAYER_THICKNESS[value as string];
    if (thickness !== undefined && DERIVED_LAYERS.has(idx)) draft.walls.layers[idx].thickness = thickness;
    return;
  }
  setPath(draft, path, value);
  if (path === 'walls.studSection.w') {
    // a rejtett vastagság-mezők követik a modellt: szigetelés = oszlopszélesség, lécezés = katalógus-léc
    for (const l of draft.walls.layers) {
      if (l.kind === 'insulation' && typeof value === 'number') l.thickness = value;
      if (l.kind === 'battens') l.thickness = BATTEN_SECTION.t;
    }
  }
  if (path === 'roof.shape') {
    const shape = value as RoofShape;
    const [min, max] = PITCH_RANGE[shape];
    if (!(draft.roof.pitch >= min && draft.roof.pitch <= max)) draft.roof.pitch = PITCH_DEFAULT[shape];
  }
}
