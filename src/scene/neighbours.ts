import type { Mm, Plan, WallSide } from '../model/types';
import { formatCm } from '../ui/format';
import { roofGeometry, wallGeometry } from '../calc/geometry';
import type { Element, ElementKind, Scene } from './types';

export interface NeighbourInfo {
  left?: string; right?: string;           // szomszéd elem id
  axisLeft?: Mm; axisRight?: Mm;           // tengelytáv
  clearLeft?: Mm; clearRight?: Mm;         // szabad hely
  fromStart: Mm; toEnd: Mm;                // a csoport elejétől (elem bal széle) / végéig (elem jobb széle)
  nearestOpening?: { id: string; distance: Mm; side: 'left' | 'right' };
}
// Ideiglenes méretvonal a csoport (u,v) síkjában, a v felfelé mutat.
// Az `offset` a vonalra merőleges eltolás: u irányú vonalnál +v felé, v irányú vonalnál +u felé pozitív.
// Falon minden vonal u irányú; a tetőlécnél az 1–2. vonal v irányú, a 3. u irányú.
// Az i. (0-tól) vonal offsetje -150·(i+1), hogy a vonalak ne fedjék egymást.
export interface TempDim { x1: Mm; y1: Mm; x2: Mm; y2: Mm; offset: Mm; text: string }

const VERTICAL: ElementKind[] = ['stud', 'cornerStud', 'gableStud', 'kingStud', 'jackStud', 'cripple'];
const DIM_STEP = -150;

export function groupLength(plan: Plan, group: string): Mm {
  if (group.startsWith('wall.')) {
    const w = wallGeometry(plan).find(g => g.side === (group.slice(5) as WallSide));
    if (!w) throw new Error(`Ismeretlen falcsoport: ${group}`);
    return w.length;
  }
  if (group.startsWith('roof.')) return roofGeometry(plan).roofLengthAlongRidge;
  if (group === 'floor') return plan.building.width - 2 * plan.walls.studSection.w;
  if (group === 'foundation') return plan.building.width + 2 * plan.foundation.slabOverhang;
  if (group === 'frame') return plan.building.width; // a keret elemei alaprajzi (x, y) koordinátában
  throw new Error(`Ismeretlen csoport: ${group}`);
}

interface Cand { e: Element; pos: number; size: number }

// Szomszédjelöltek az elemhez: a pozíció (középvonal) és a méret a szomszédsági tengely mentén.
// Fal: függőleges fajták, u szerint, ≥1 mm v-átfedéssel. Tetősík: rafter/counterBatten u szerint
// (azonos fajtával), roofBatten v szerint. Padló: joist u szerint. Gerendakeret: a támasz a saját gerendája mentén,
// a főgerenda a gerendákra merőlegesen (az irány a főgerendák alakjából). Egyéb: nincs.
/** A gerendakeret elemének szomszédsági tengelye: támasznál a főgerendák iránya, főgerendánál az arra merőleges. */
function frameAxis(scene: Scene, el: Element): 'u' | 'v' {
  const beam = scene.elements.find(o => o.group === 'frame' && o.kind === 'beam');
  const alongU = beam ? beam.geom.w >= beam.geom.h : true;
  return (el.kind === 'support') === alongU ? 'u' : 'v';
}

function candidates(scene: Scene, el: Element): { list: Cand[]; mine: Cand } | null {
  const g = el.geom;
  const same = (pred: (o: Element) => boolean, axis: 'u' | 'v'): { list: Cand[]; mine: Cand } => {
    const size = (o: Element): number => (axis === 'u' ? o.geom.w : o.geom.h);
    const start = (o: Element): number => (axis === 'u' ? o.geom.u : o.geom.v);
    const c = (o: Element): Cand => ({ e: o, pos: start(o) + size(o) / 2, size: size(o) });
    return { list: scene.elements.filter(o => o.id !== el.id && o.group === el.group && pred(o)).map(c), mine: c(el) };
  };
  if (el.group.startsWith('wall.') && VERTICAL.includes(el.kind)) {
    return same(o => VERTICAL.includes(o.kind) && Math.min(o.geom.v + o.geom.h, g.v + g.h) - Math.max(o.geom.v, g.v) >= 1, 'u');
  }
  if (el.group.startsWith('roof.')) {
    if (el.kind === 'rafter' || el.kind === 'counterBatten') return same(o => o.kind === el.kind, 'u');
    if (el.kind === 'roofBatten') return same(o => o.kind === 'roofBatten', 'v');
  }
  if (el.group === 'floor' && el.kind === 'joist') return same(o => o.kind === 'joist', 'u');
  if (el.group === 'frame' && (el.kind === 'support' || el.kind === 'beam')) {
    const axis = frameAxis(scene, el);
    const across = (o: Element): boolean => (axis === 'u'
      ? Math.min(o.geom.v + o.geom.h, g.v + g.h) - Math.max(o.geom.v, g.v) >= 1
      : Math.min(o.geom.u + o.geom.w, g.u + g.w) - Math.max(o.geom.u, g.u) >= 1);
    return same(o => o.kind === el.kind && across(o), axis);
  }
  return null;
}

function pick(list: Cand[], mine: Cand, dir: -1 | 1): Cand | undefined {
  let best: Cand | undefined;
  for (const c of list) {
    const d = (c.pos - mine.pos) * dir;
    if (d <= 0) continue;
    if (!best || d < (best.pos - mine.pos) * dir || (d === (best.pos - mine.pos) * dir && c.e.id < best.e.id)) best = c;
  }
  return best;
}

export function neighbours(scene: Scene, groupLen: Mm, elementId: string): NeighbourInfo {
  const el = scene.elements.find(e => e.id === elementId);
  if (!el) throw new Error(`Ismeretlen elem: ${elementId}`);
  const g = el.geom;
  let fromStart = g.u;
  // a padló párnafái a belső szélességben (a falvastagságnál kezdődően) állnak: a kezdőpont az első párnafa
  if (el.group === 'floor' && el.kind === 'joist') {
    const first = Math.min(...scene.elements.filter(o => o.kind === 'joist' && o.group === el.group).map(o => o.geom.u));
    fromStart = g.u - first;
  }
  const info: NeighbourInfo = { fromStart, toEnd: groupLen - fromStart - g.w };
  const cs = candidates(scene, el);
  if (cs) {
    const l = pick(cs.list, cs.mine, -1); const r = pick(cs.list, cs.mine, 1);
    if (l) { info.left = l.e.id; info.axisLeft = cs.mine.pos - l.pos; info.clearLeft = info.axisLeft - (l.size + cs.mine.size) / 2; }
    if (r) { info.right = r.e.id; info.axisRight = r.pos - cs.mine.pos; info.clearRight = info.axisRight - (r.size + cs.mine.size) / 2; }
  }
  if (el.group.startsWith('wall.') && el.kind !== 'opening') {
    let best: NeighbourInfo['nearestOpening'];
    for (const o of scene.elements) {
      if (o.kind !== 'opening' || o.group !== el.group) continue;
      if (Math.min(o.geom.v + o.geom.h, g.v + g.h) - Math.max(o.geom.v, g.v) < 1) continue;
      const toRight = o.geom.u - (g.u + g.w);
      const toLeft = g.u - (o.geom.u + o.geom.w);
      const cand = toRight >= 0 && (toLeft < 0 || toRight <= toLeft)
        ? { id: o.id, distance: toRight, side: 'right' as const }
        : toLeft >= 0 ? { id: o.id, distance: toLeft, side: 'left' as const } : undefined;
      if (cand && (!best || cand.distance < best.distance || (cand.distance === best.distance && cand.id < best.id))) best = cand;
    }
    if (best) info.nearestOpening = best;
  }
  return info;
}

const cm = formatCm;

export function tempDimensions(scene: Scene, groupLen: Mm, elementId: string): TempDim[] {
  const el = scene.elements.find(e => e.id === elementId);
  if (!el) throw new Error(`Ismeretlen elem: ${elementId}`);
  const n = neighbours(scene, groupLen, elementId);
  const g = el.geom;
  const out: TempDim[] = [];
  // v irányú méretvonalak: tetőléc, és a gerendakeret v tengelyű szomszédai
  const batten = el.kind === 'roofBatten' || (el.group === 'frame' && frameAxis(scene, el) === 'v');
  const ax = (id: string | undefined, dist: Mm | undefined): void => {
    if (!id || dist === undefined) return;
    const o = scene.elements.find(e => e.id === id)!;
    if (batten) {
      const m = g.v + g.h / 2; const p = o.geom.v + o.geom.h / 2;
      out.push({ x1: g.u, y1: p, x2: g.u, y2: m, offset: 0, text: cm(dist) });
    } else {
      const m = g.u + g.w / 2; const p = o.geom.u + o.geom.w / 2;
      out.push({ x1: p, y1: g.v, x2: m, y2: g.v, offset: 0, text: cm(dist) });
    }
  };
  ax(n.left, n.axisLeft); ax(n.right, n.axisRight);
  out.push({ x1: g.u - n.fromStart, y1: g.v, x2: g.u, y2: g.v, offset: 0, text: cm(n.fromStart) });
  if (n.nearestOpening) {
    const o = scene.elements.find(e => e.id === n.nearestOpening!.id)!;
    const right = n.nearestOpening.side === 'right';
    out.push({
      x1: right ? g.u + g.w : o.geom.u + o.geom.w, y1: g.v, x2: right ? o.geom.u : g.u, y2: g.v,
      offset: 0, text: cm(n.nearestOpening.distance),
    });
  }
  return out.map((d, i) => ({ ...d, offset: DIM_STEP * (i + 1) }));
}
