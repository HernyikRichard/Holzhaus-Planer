import type { Plan } from '../model/types';
import { BATTEN_GAUGE, COUNTER_BATTEN_SECTION, DECKING_REQUIRED, FRAME_SCREWS_PER_END, FRAME_SCREW_LABEL, HURRICANE_TIE_LABEL, ROOF_BATTEN_SECTION } from '../catalog';
import { roofGeometry } from '../calc/geometry';
import type { Element, ElementKind, FastenerRef, Geom } from './types';

const LABELS: Partial<Record<ElementKind, string>> = {
  rafter: 'Szarufa', counterBatten: 'Ellenléc', roofBatten: 'Tetőléc', collar: 'Fogópár',
};

export function roofElements(plan: Plan): { elements: Element[]; fasteners: FastenerRef[] } {
  const g = roofGeometry(plan);
  const { eaveOverhang, layers, covering } = plan.roof;
  const section = plan.roof.rafterSection;
  const t = section.t;
  const total = g.roofLengthAlongRidge;
  const cos = Math.cos(g.pitchRad);
  const elements: Element[] = [];
  const fasteners: FastenerRef[] = [];
  const counters = new Map<string, number>();
  const groups = g.shape === 'gable' ? ['roof.L', 'roof.R'] : ['roof.M'];

  const add = (group: string, kind: ElementKind, length: number, geom: Geom, pieceLabel: string, sec = section,
    label?: string): Element => {
    const key = `${group}.${kind}`;
    const idx = (counters.get(key) ?? 0) + 1;
    counters.set(key, idx);
    const e: Element = {
      id: `${key}.${idx}`, kind, group, category: 'Tető', pieceLabel, section: sec, length, geom, fasteners: [],
      label: label ?? `${LABELS[kind]} #${idx}`,
    };
    elements.push(e);
    return e;
  };
  const point = (e: Element, kind: FastenerRef['kind'], name: string, u: number, v: number, count: number, label: string,
    ids: string[] = [e.id]): void => {
    const f: FastenerRef = { id: `${e.id}.${kind}.${name}`, kind, group: e.group, u, v, count, label, elementIds: ids };
    fasteners.push(f);
    for (const id of ids) (id === e.id ? e : elements.find(x => x.id === id)!).fasteners.push(f.id);
  };

  const us = Array.from({ length: g.raftersPerPlane }, (_, i) => Math.min(i * plan.roof.rafterSpacing, total - t));

  for (const group of groups) {
    for (const u of us) {
      const e = add(group, 'rafter', g.rafterLength, { u, v: 0, w: t, h: g.rafterLength }, 'szarufa');
      const e1 = eaveOverhang / cos;
      const top = g.shape === 'gable' ? g.rafterLength : g.rafterLength - e1;
      point(e, 'hurricaneTie', 'eave', u + t / 2, e1, 1, HURRICANE_TIE_LABEL);
      point(e, 'hurricaneTie', 'top', u + t / 2, top, 1, HURRICANE_TIE_LABEL);
    }
  }


  if (g.shape === 'gable') {
    add('roof.ridge', 'ridge', total, { u: 0, v: 0, w: total, h: section.w }, 'gerincpalló', section, 'Gerincpalló');
    // fogópár: az 1., 3., 5. … szarufapáron, páronként 2 elem
    const pairs = Math.ceil(g.raftersPerPlane / 2);
    const half = g.W / 2;
    for (let k = 0; k < pairs; k++) {
      const u = us[2 * k] ?? us[us.length - 1];
      const a = add('roof.collar', 'collar', half, { u, v: 0, w: t, h: half }, 'fogópár');
      const b = add('roof.collar', 'collar', half, { u, v: half, w: t, h: half }, 'fogópár');
      point(a, 'frameScrew', 'outer', u + t / 2, 0, FRAME_SCREWS_PER_END, `${FRAME_SCREWS_PER_END} db ${FRAME_SCREW_LABEL}`);
      point(b, 'frameScrew', 'outer', u + t / 2, g.W, FRAME_SCREWS_PER_END, `${FRAME_SCREWS_PER_END} db ${FRAME_SCREW_LABEL}`);
    }
  }

  const forced = DECKING_REQUIRED.has(covering);
  const layer = (kind: string) => layers.find(l => l.kind === kind);
  if (!forced && layer('counterBatten')?.enabled) {
    for (const group of groups) {
      for (const u of us) add(group, 'counterBatten', g.rafterLength, { u, v: 0, w: COUNTER_BATTEN_SECTION.t, h: g.rafterLength }, 'ellenléc', COUNTER_BATTEN_SECTION);
    }
  }
  if (!forced && layer('batten')?.enabled) {
    const gauge = BATTEN_GAUGE[covering];
    if (gauge !== undefined) {
      const rows = Math.ceil(g.rafterLength / gauge - 1e-9) + 1;
      for (const group of groups) {
        for (let j = 0; j < rows; j++) {
          const v = Math.min(j * gauge, g.rafterLength - 50);
          add(group, 'roofBatten', total, { u: 0, v, w: total, h: 50 }, 'tetőléc', ROOF_BATTEN_SECTION);
        }
      }
    }
  }
  return { elements, fasteners };
}
