import type { Plan, WallSide } from '../../model/types';
import { wallGeometry } from '../../calc/geometry';
import { cm, elGroup, esc, fxCircle, type Kit, type Pt } from '../svgKit';
import { drawOpening, elStyle, fxRadius, layerG, type ViewCtx } from './common';

const WALL_NAME: Record<WallSide, string> = { N: 'É', E: 'K', S: 'D', W: 'Ny' };
/** Az alaprajzon (felülnézetben) is látszó, függőleges falelemek. */
export const PLAN_KINDS = new Set(['stud', 'cornerStud', 'kingStud', 'jackStud']);
const OUTWARD: Record<WallSide, Pt> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

export interface FloorWallMap {
  horizontal: boolean;
  /** A fal kezdőpontja (a külső sík sarka) az alaprajzon. */
  x0: number; y0: number;
  /** Fal-u és a külső síktól befelé mért mélység (0…studSection.w) → alaprajzi pont. */
  pt(u: number, depth: number): Pt;
}

export function floorWallMap(plan: Plan, side: WallSide): FloorWallMap {
  const { width: W, length: L } = plan.building;
  const sw = plan.walls.studSection.w;
  const g = wallGeometry(plan).find(w => w.side === side)!;
  const start = g.full ? 0 : sw;
  const horizontal = side === 'N' || side === 'S';
  const x0 = horizontal ? start : side === 'W' ? 0 : W;
  const y0 = horizontal ? (side === 'N' ? 0 : L) : start;
  const [ox, oy] = OUTWARD[side];
  return {
    horizontal, x0, y0,
    pt: (u, depth) => (horizontal ? [x0 + u, y0 - oy * depth] : [x0 - ox * depth, y0 + u]),
  };
}

function box(kit: Kit, m: FloorWallMap, u0: number, u1: number, d0: number, d1: number, style: string): string {
  const [ax, ay] = m.pt(u0, d0);
  const [bx, by] = m.pt(u1, d1);
  return kit.rect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay), style);
}

/** Ajtó nyitásíve: a zsanér a fal belső síkján, a lap befelé nyílik (a régi alaprajz szabálya szerint). */
function doorSwing(kit: Kit, side: WallSide, m: FloorWallMap, sw: number, offset: number, width: number, swing: 'left' | 'right'): string {
  const [ox, oy] = OUTWARD[side];
  const d: Pt = [-ox, -oy]; // befelé
  const a0 = m.pt(offset, sw);
  const a1 = m.pt(offset + width, sw);
  const u: Pt = m.horizontal ? [1, 0] : [0, 1];
  // kívülről nézve a bal oldal: (dy, −dx)
  const left: Pt = [d[1], -d[0]];
  const leftIsEnd = left[0] * u[0] + left[1] * u[1] > 0;
  const hingeAtEnd = (swing === 'left') === leftIsEnd;
  const hinge = hingeAtEnd ? a1 : a0;
  const other = hingeAtEnd ? a0 : a1;
  const leaf: Pt = [hinge[0] + d[0] * width, hinge[1] + d[1] * width];
  const ax = leaf[0] - hinge[0];
  const ay = leaf[1] - hinge[1];
  const bx = other[0] - hinge[0];
  const by = other[1] - hinge[1];
  const sweep = ax * by - ay * bx > 0 ? 1 : 0;
  const f = (v: number): string => String(Math.round(v * 10) / 10);
  return kit.path(`M ${f(hinge[0])} ${f(hinge[1])} L ${f(leaf[0])} ${f(leaf[1])} A ${f(width)} ${f(width)} 0 0 ${sweep} ${f(other[0])} ${f(other[1])}`,
    [hinge, leaf, other], `fill="none" ${kit.stroke('opening', 1)}`);
}

export function drawFloorPlan(ctx: ViewCtx): string {
  const { plan, scene, kit } = ctx;
  const { width: W, length: L } = plan.building;
  const sw = plan.walls.studSection.w;
  kit.ext(0, 0);
  kit.ext(W, L);
  const geom = kit.snapshot();
  kit.scaleTo(geom);
  const fs = kit.fs;
  const r = fxRadius(geom);
  const row = fs * 2.4;
  let walls = '';
  // padló párnafák (ha a padló be van kapcsolva): halvány szaggatott keret a falak alatt
  if (ctx.on('frame')) {
    let joists = '';
    for (const e of scene.elements.filter(x => x.kind === 'joist')) {
      joists += elGroup(e.id, e.kind, kit.rect(e.geom.u, e.geom.v, e.geom.w, e.geom.h, `${kit.fill('lineMuted', 0.1)} ${kit.stroke('lineMuted', 1, [6, 4])}`));
    }
    walls += layerG('frame', joists);
  }
  let dims = '';
  let labels = '';

  for (const g of wallGeometry(plan)) {
    const side = g.side;
    const group = `wall.${side}`;
    const m = floorWallMap(plan, side);
    const els = scene.elements.filter(e => e.group === group);
    let body = '';
    if (ctx.on('frame')) {
      for (const e of els.filter(x => x.kind === 'bottomPlate')) {
        body += elGroup(e.id, e.kind, box(kit, m, 0, g.length, 0, sw, `${kit.fill('line', 0.08)} ${kit.stroke('line')}`));
      }
      for (const e of els.filter(x => PLAN_KINDS.has(x.kind))) {
        // az elforgatott sarokoszlop (w × t) a belső síkhoz simul: L alakot ad a végoszloppal
        const d0 = e.rotated ? sw - plan.walls.studSection.t : 0;
        body += elGroup(e.id, e.kind, box(kit, m, e.geom.u, e.geom.u + e.geom.w, d0, sw, elStyle(kit, e.kind)));
      }
      for (const e of els.filter(x => x.kind === 'opening')) {
        const o = plan.openings.find(op => op.id === e.openingId);
        const [ax, ay] = m.pt(e.geom.u, 0);
        const [bx, by] = m.pt(e.geom.u + e.geom.w, sw);
        const swing = o?.type === 'door' ? doorSwing(kit, side, m, sw, e.geom.u, e.geom.w, o.swing) : '';
        body += drawOpening(ctx, e, Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay), swing);
      }
    }
    if (ctx.on('fasteners')) {
      for (const f of scene.fasteners.filter(x => x.group === group && x.kind === 'anchor')) {
        const [x, y] = m.pt(f.u, sw / 2);
        body += fxCircle(kit, f.id, f.kind, x, y, r);
      }
    }
    walls += `<g data-wall="${esc(side)}">${body}</g>`;

    // méretek a külső sík mentén: nyílások lánca, a D és K oldalon a teljes méret is
    let rows = 0;
    const [ox, oy] = OUTWARD[side];
    const sideLen = m.horizontal ? W : L;
    const corner = (c: number): Pt => (m.horizontal ? [c, m.y0] : [m.x0, c]);
    const out = (a: Pt, b: Pt): number => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      return Math.sign(-dy * ox + dx * oy) || 1;
    };
    if (ctx.on('dims')) {
      const start = m.horizontal ? m.x0 : m.y0;
      const ops = els.filter(e => e.kind === 'opening');
      if (ops.length > 0) {
        const cs = [...new Set([0, sideLen, ...ops.flatMap(o => [start + o.geom.u, start + o.geom.u + o.geom.w])])].sort((a, b) => a - b);
        const pts = cs.map(corner);
        rows++;
        dims += kit.chain(pts, out(pts[0], pts[1]) * row * rows);
      }
      if (side === 'S' || side === 'E') {
        const a = corner(0);
        const b = corner(sideLen);
        rows++;
        dims += kit.dim(a[0], a[1], b[0], b[1], out(a, b) * row * rows, cm(sideLen));
      }
    }
    const away = row * rows + fs * (rows > 0 ? 2.8 : 1.4); // a méretfeliratokon túl
    const lx = m.horizontal ? W / 2 : m.x0 + ox * away;
    const ly = m.horizontal ? m.y0 + oy * away : L / 2;
    labels += kit.text(lx, ly, WALL_NAME[side], { size: fs * 1.2, color: 'lineMuted' });
  }

  return walls + labels + layerG('dims', dims + kit.takeLabels());
}
