import type { Plan } from '../model/types';
import { FASCIA_SECTION, MESH_SHEET } from '../catalog';
import { meshLayout } from '../calc/foundation';
import { roofGeometry } from '../calc/geometry';
import type { Element, ElementKind, Geom } from './types';

/** Padló párnafák: alaprajzi koordináták (u = x, v = y). */
export function floorElements(plan: Plan): Element[] {
  const fl = plan.floor;
  if (!fl.enabled) return [];
  const wall = plan.walls.studSection.w;
  const innerX = plan.building.width - 2 * wall;
  const innerY = plan.building.length - 2 * wall;
  const rows = Math.ceil(innerX / fl.joistSpacing - 1e-9) + 1;
  const t = fl.joistSection.t;
  const out: Element[] = [];
  for (let i = 0; i < rows; i++) {
    const u = wall + Math.min(i * fl.joistSpacing, innerX - t);
    out.push({
      id: `floor.joist.${i + 1}`, kind: 'joist', label: `Párnafa #${i + 1}`, group: 'floor', category: 'Padló',
      pieceLabel: 'párnafa', section: fl.joistSection, length: innerY, geom: { u, v: wall, w: t, h: innerY }, fasteners: [],
    });
  }
  return out;
}

/** Betonháló táblák a `meshLayout` szerint (alaprajzi koordináták, a lemez sarkától). */
export function foundationElements(plan: Plan): Element[] {
  const lay = meshLayout(plan);
  const ov = plan.foundation.slabOverhang;
  const slabX = plan.building.width + 2 * ov;
  const slabY = plan.building.length + 2 * ov;
  const stepX = lay.sheetW - MESH_SHEET.overlap;
  const stepY = lay.sheetL - MESH_SHEET.overlap;
  const out: Element[] = [];
  let n = 0;
  for (let c = 0; c < lay.cols; c++) {
    for (let r = 0; r < lay.rows; r++) {
      n++;
      out.push({
        id: `foundation.meshSheet.${n}`, kind: 'meshSheet', label: `Hálótábla #${n}`, group: 'foundation', category: 'Alap',
        length: Math.max(lay.sheetW, lay.sheetL),
        geom: {
          u: -ov + Math.max(0, Math.min(c * stepX, slabX - lay.sheetW)),
          v: -ov + Math.max(0, Math.min(r * stepY, slabY - lay.sheetL)),
          w: lay.sheetW, h: lay.sheetL,
        },
        fasteners: [],
      });
    }
  }
  return out;
}

/** Homlokdeszka és oromdeszka a tetősíkok koordinátáiban. */
export function accessoryElements(plan: Plan): Element[] {
  const g = roofGeometry(plan);
  const acc = plan.accessories;
  const out: Element[] = [];
  const counters = new Map<string, number>();
  const add = (group: string, kind: ElementKind, pieceLabel: string, label: string, length: number, geom: Geom): void => {
    const key = `${group}.${kind}`;
    const idx = (counters.get(key) ?? 0) + 1;
    counters.set(key, idx);
    out.push({
      id: `${key}.${idx}`, kind, group, category: 'Kiegészítők', pieceLabel, section: FASCIA_SECTION,
      length, geom, fasteners: [], label: `${label} #${idx}`,
    });
  };
  const gable = g.shape === 'gable';
  const total = g.roofLengthAlongRidge;
  const sec = FASCIA_SECTION;
  if (acc.fascia) {
    // két eresz: nyeregnél mindkét síkon az eresznél, egyébként alul és fent
    const spots: Array<[string, number]> = gable ? [['roof.L', 0], ['roof.R', 0]]
      : [['roof.M', 0], ['roof.M', g.rafterLength - sec.w]];
    for (const [group, v] of spots) add(group, 'fascia', 'homlokdeszka', 'Homlokdeszka', total, { u: 0, v, w: total, h: sec.w });
  }
  if (acc.bargeBoard) {
    const spots: Array<[string, number]> = [];
    for (const group of gable ? ['roof.L', 'roof.R'] : ['roof.M']) spots.push([group, 0], [group, total - sec.t]);
    for (const [group, u] of spots) add(group, 'barge', 'oromdeszka', 'Oromdeszka', g.rafterLength, { u, v: 0, w: sec.t, h: g.rafterLength });
  }
  return out;
}
