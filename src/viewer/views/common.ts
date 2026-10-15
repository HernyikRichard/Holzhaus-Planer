import type { Plan } from '../../model/types';
import type { Element, Scene } from '../../scene/types';
import type { LayerId } from '../layers';
import type { Bounds } from '../camera';
import { boundsOf, elGroup, esc, type Kit, type Pt } from '../svgKit';

export interface ViewCtx {
  plan: Plan; scene: Scene; kit: Kit;
  /** A réteg látszik-e (a nézetben nem kapcsolható réteg mindig látszik). */
  on(layer: LayerId): boolean;
  invalid: Set<string>;
}

/** Az elem 4 sarka a csoport (u,v) síkjában, az `angle` elforgatással. */
export function corners(e: Element): Pt[] {
  const { u, v, w, h } = e.geom;
  const a = ((e.geom.angle ?? 0) * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]): Pt => [u + x * c - y * s, v + x * s + y * c]);
}

/** Kitöltés és körvonal elemfajta szerint. */
export function elStyle(kit: Kit, kind: string): string {
  switch (kind) {
    case 'osbSheet': return `${kit.fill('sheet', 0.15)} ${kit.stroke('sheet', 1.2)}`;
    case 'meshSheet': return `${kit.fill('sheet', 0.1)} ${kit.stroke('sheet', 0.8)}`;
    case 'counterBatten': case 'roofBatten': return `${kit.fill('lineMuted', 0.3)} ${kit.stroke('lineMuted', 0.8)}`;
    case 'fascia': case 'barge': return `${kit.fill('lineMuted', 0.2)} ${kit.stroke('line')}`;
    default: return `${kit.fill('line', 0.12)} ${kit.stroke('line')}`;
  }
}

/** Elem rajza a megadott leképezéssel: tengelyirányú téglalap, ha lehet, egyébként sokszög. */
export function drawEl(kit: Kit, e: Element, map: (p: Pt) => Pt, body = ''): string {
  const pts = corners(e).map(map);
  const axis = !e.geom.angle;
  const style = elStyle(kit, e.kind);
  let shape: string;
  if (axis) {
    const xs = pts.map(p => p[0]);
    const ys = pts.map(p => p[1]);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    shape = kit.rect(x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0, style);
  } else {
    shape = kit.poly(pts, style);
  }
  return elGroup(e.id, e.kind, shape + body);
}

/** Nyílás rajza (szaggatott keret; hibásan piros kitöltéssel). */
export function drawOpening(ctx: ViewCtx, e: Element, x: number, y: number, w: number, h: number, extra = ''): string {
  const { kit } = ctx;
  const bad = e.openingId !== undefined && ctx.invalid.has(e.openingId);
  const style = bad
    ? `${kit.fill('invalid', 0.35)} ${kit.stroke('invalid', 1.5)}`
    : `${kit.fill('opening', 0.08)} ${kit.stroke('opening', 1, [6, 4])}`;
  const attrs = `data-opening-id="${esc(e.openingId ?? '')}"`;
  return elGroup(e.id, e.kind, kit.rect(x, y, w, h, style) + extra, attrs, bad ? 'invalid' : '');
}

/** A rögzítési pont sugara: a nézet nagyobb méretének 0,6 %-a. */
export function fxRadius(geom: Bounds): number {
  return boundsOf(geom).max * 0.006;
}

export function layerG(name: string, body: string): string {
  return body ? `<g data-layer="${name}">${body}</g>` : '';
}
