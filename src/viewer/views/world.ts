import type { Plan } from '../../model/types';
import { roofGeometry } from '../../calc/geometry';
import { hasFrame } from '../../calc/frame';
import type { Element } from '../../scene/types';
import type { ViewId } from '../layers';
import type { Pt } from '../svgKit';
import { corners } from './common';
import { floorWallMap, PLAN_KINDS } from './floorPlan';
import { roofMap } from './roof';
import { gableSide, wallMap } from './wall';

/**
 * A csoport (u, v) síkja → a nézet világkoordinátája, UGYANAZ a leképezés, amit a nézetek rajzolnak
 * (falnézet: tükrözés az É és K falon, y = −v; tető: a tetősík vetítése; alaprajz: a fal talpvonala).
 * Null, ha az adott nézet nem rajzolja a csoportot.
 */
export function toWorld(plan: Plan, view: ViewId, group: string, u: number, v: number): Pt | null {
  const wallView = view === 'gable' ? `wall.${gableSide(plan)}` : view;
  if (wallView.startsWith('wall.')) return group === wallView ? wallMap(plan, wallView.slice(5) as 'N').pt(u, v) : null;
  if (view === 'floor') {
    if (group === 'floor') return [u, v];
    return group.startsWith('wall.') ? floorWallMap(plan, group.slice(5) as 'N').pt(u, plan.walls.studSection.w / 2) : null;
  }
  if (view === 'roof') {
    if (group === 'roof.ridge') return roofMap(plan).xy(roofGeometry(plan).W / 2, -plan.roof.gableOverhang + u);
    if (group === 'roof.collar') return roofMap(plan).xy(v, -plan.roof.gableOverhang + u);
    return group === 'roof.L' || group === 'roof.R' || group === 'roof.M' ? roofMap(plan).pt(group, u, v) : null;
  }
  if (view === 'foundation') return group === 'foundation' || group === 'frame' ? [u, v] : null;
  return null;
}

/** Az elem körvonala (4 pont) a nézet világkoordinátájában, vagy null, ha a nézet nem rajzolja. */
export function elementPoly(plan: Plan, view: ViewId, e: Element): Pt[] | null {
  const wallView = view === 'gable' ? `wall.${gableSide(plan)}` : view;
  if (wallView.startsWith('wall.')) {
    return e.group === wallView ? corners(e).map(([u, v]) => toWorld(plan, view, e.group, u, v)!) : null;
  }
  const { u, w, h } = e.geom;
  if (view === 'floor') {
    if (e.kind === 'joist') return corners(e);
    if (!e.group.startsWith('wall.')) return null;
    const sw = plan.walls.studSection.w;
    const m = floorWallMap(plan, e.group.slice(5) as 'N');
    let u0: number; let u1: number;
    if (e.kind === 'bottomPlate') { u0 = 0; u1 = e.length; }
    else if (PLAN_KINDS.has(e.kind) || e.kind === 'opening') { u0 = u; u1 = u + w; }
    else return null;
    return [m.pt(u0, 0), m.pt(u1, 0), m.pt(u1, sw), m.pt(u0, sw)];
  }
  if (view === 'roof') {
    if (e.kind === 'ridge') {
      const S = roofGeometry(plan).W;
      const t = plan.roof.rafterSection.t;
      const og = plan.roof.gableOverhang;
      const xy = roofMap(plan).xy;
      return [xy(S / 2 - t / 2, -og + u), xy(S / 2 + t / 2, -og + u), xy(S / 2 + t / 2, -og + u + w), xy(S / 2 - t / 2, -og + u + w)];
    }
    if (e.kind === 'osbSheet') return null;
    const pts = corners(e).map(([a, b]) => toWorld(plan, view, e.group, a, b));
    return pts.every(p => p !== null) ? (pts as Pt[]) : null;
  }
  if (view === 'foundation') {
    // gerendakeretes alapnál a keret és a párnafák is az alapnézetben
    const frame = e.group === 'frame' || (e.kind === 'joist' && hasFrame(plan));
    return e.group === 'foundation' || frame ? corners(e) : null;
  }
  return null;
}
