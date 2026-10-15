import type { Plan } from '../model/types';
import type { Supply } from '../pricing/supply';
import { OSB_SCREW_EDGE_SPACING, OSB_SCREW_FIELD_SPACING, OSB_SCREW_LABEL, OSB_SHEET } from '../catalog';
import { wallGeometry, wallHeightAt } from '../calc/geometry';
import type { WallGeom } from '../calc/geometry';
import { wallFrameElements } from './wallFrame';
import type { Element, FastenerRef } from './types';

const AXIS_MARGIN = 20;
const OPENING_TOL = 10;
const FRAME_AXIS_KINDS = new Set(['stud', 'cornerStud', 'jackStud', 'kingStud']);

/** A fal körvonalának magassága az u helyen (oromfalnál a háromszöggel együtt). */
function wallTop(wall: WallGeom, u: number): number {
  let h = wallHeightAt(wall, u);
  if (wall.gableRise > 0) h += wall.gableRise * (1 - Math.abs(u - wall.length / 2) / (wall.length / 2));
  return h;
}

/** A körvonal legnagyobb magassága a [u0, u1] sávban. */
function topMax(wall: WallGeom, u0: number, u1: number): number {
  const at = (u: number): number => wallTop(wall, u);
  const cand = [u0, u1];
  if (wall.gableRise > 0 && u0 < wall.length / 2 && wall.length / 2 < u1) cand.push(wall.length / 2);
  return Math.max(...cand.map(at));
}

/** 0, step, 2·step … majd a végpont (egyszer). */
function along(length: number, step: number): number[] {
  const out: number[] = [];
  for (let x = 0; x < length - 1e-9; x += step) out.push(x);
  out.push(length);
  return out;
}

/** Ennél alacsonyabb maradék sávba nem kerül tábla (és csavar sem). */
const MIN_SHEET_H = 100;

export function wallOsbElements(plan: Plan, frameElements?: Element[], supply?: Supply): { elements: Element[]; fasteners: FastenerRef[] } {
  const elements: Element[] = [];
  const fasteners: FastenerRef[] = [];
  const osb = plan.walls.layers.find(l => l.kind === 'osb');
  if (!osb?.enabled) return { elements, fasteners };
  const sheetSize = supply?.osbSheet(osb.thickness) ?? OSB_SHEET;
  const frame = frameElements ?? wallFrameElements(plan).elements;

  for (const wall of wallGeometry(plan)) {
    const group = `wall.${wall.side}`;
    const axes = frame.filter(e => e.group === group && FRAME_AXIS_KINDS.has(e.kind));
    const holes = frame.filter(e => e.group === group && e.kind === 'opening').map(e => e.geom);
    const len = wall.length;
    let n = 0;
    for (let u = 0; u < len - 1e-9; u += sheetSize.w) {
      const w = Math.min(sheetSize.w, len - u);
      const hMax = topMax(wall, u, u + w);
      // a tábla téglalap a oszlop legmagasabb pontjáig; a 100 mm-nél alacsonyabb maradék sáv kimarad
      for (let v = 0; hMax - v >= MIN_SHEET_H - 1e-9; v += sheetSize.l) {
        const h = Math.min(sheetSize.l, hMax - v);
        n++;
        const id = `${group}.osbSheet.${n}`;
        const sheet: Element = {
          id, kind: 'osbSheet', label: `OSB tábla #${n}`, group, category: 'Fal',
          length: Math.max(w, h), geom: { u, v, w, h }, fasteners: [],
        };
        // csavarpontok: élek mentén + közbenső oszlopok mentén, duplikáció nélkül
        const pts = new Map<string, [number, number]>();
        const put = (x: number, y: number): void => {
          const a = u + x; const b = v + y;
          if (b > wallTop(wall, a) - OPENING_TOL) return; // a körvonal fölé nem kerül csavar
          if (holes.some(o => a > o.u - OPENING_TOL && a < o.u + o.w + OPENING_TOL
            && b > o.v - OPENING_TOL && b < o.v + o.h + OPENING_TOL)) return;
          pts.set(`${a.toFixed(3)}|${b.toFixed(3)}`, [a, b]);
        };
        for (const x of along(w, OSB_SCREW_EDGE_SPACING)) { put(x, 0); put(x, h); }
        for (const y of along(h, OSB_SCREW_EDGE_SPACING)) { put(0, y); put(w, y); }
        const seen = new Set<string>();
        for (const a of axes) {
          const ax = a.geom.u + a.geom.w / 2;
          const key = ax.toFixed(3);
          if (seen.has(key) || ax <= u + AXIS_MARGIN || ax >= u + w - AXIS_MARGIN) continue;
          seen.add(key);
          for (let y = OSB_SCREW_FIELD_SPACING; y < h - AXIS_MARGIN; y += OSB_SCREW_FIELD_SPACING) {
            if (v + y >= a.geom.v - 1e-9 && v + y <= a.geom.v + a.geom.h + 1e-9) put(ax - u, y);
          }
        }
        let k = 0;
        for (const [a, b] of [...pts.values()].sort((p, q) => p[0] - q[0] || p[1] - q[1])) {
          k++;
          const f: FastenerRef = {
            id: `${id}.osbScrew.${k}`, kind: 'osbScrew', group, u: a, v: b, count: 1, label: OSB_SCREW_LABEL, elementIds: [id],
          };
          fasteners.push(f);
          sheet.fasteners.push(f.id);
        }
        elements.push(sheet);
      }
    }
  }
  return { elements, fasteners };
}
