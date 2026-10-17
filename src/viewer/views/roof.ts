import type { Plan } from '../../model/types';
import { roofGeometry } from '../../calc/geometry';
import { STANDING_SEAM_WIDTH } from '../../catalog';
import type { Element } from '../../scene/types';
import { elGroup, esc, fxCircle, type Pt } from '../svgKit';
import { drawEl, fxRadius, layerG, type ViewCtx } from './common';

const FRAME = new Set(['rafter', 'ridge', 'fascia', 'barge', 'collar']);
const BATTENS = new Set(['counterBatten', 'roofBatten']);
const PLANES = new Set(['roof.L', 'roof.R', 'roof.M']);

export interface RoofMap {
  ridgeY: boolean;
  /** (p: a gerincre merőleges, r: a gerinccel párhuzamos) → alaprajzi (x, y). */
  xy(p: number, r: number): Pt;
  /** Tetősík (u, v) → alaprajzi (x, y). Bal sík: a p = 0 oldal (x = 0 vagy y = 0); egyhajlásúnál az eresz a p = W oldalon. */
  pt(group: string, u: number, v: number): Pt;
}

export function roofMap(plan: Plan): RoofMap {
  const g = roofGeometry(plan);
  const { eaveOverhang: oe, gableOverhang: og, ridgeDirection } = plan.roof;
  const cos = Math.cos(g.pitchRad);
  const ridgeY = ridgeDirection === 'y';
  const xy = (p: number, r: number): Pt => (ridgeY ? [p, r] : [r, p]);
  const P = (group: string, v: number): number => (group === 'roof.L' ? -oe + v * cos : g.W + oe - v * cos);
  return { ridgeY, xy, pt: (group, u, v) => xy(P(group, v), -og + u) };
}

/** Kifelé mutató méretvonal-offset előjele: a (−dy, dx) normális és a kifelé irány skaláris szorzata. */
function outSign(a: Pt, b: Pt, out: Pt): number {
  return Math.sign(-(b[1] - a[1]) * out[0] + (b[0] - a[0]) * out[1]) || 1;
}

export function drawRoof(ctx: ViewCtx): string {
  const { plan, scene, kit } = ctx;
  const g = roofGeometry(plan);
  const { eaveOverhang: oe, gableOverhang: og } = plan.roof;
  const m = roofMap(plan);
  const S = g.W;
  const Lr = g.roofLengthAlongRidge;
  const { width: W, length: L } = plan.building;
  const planes: Array<[number, number]> = g.planes === 2 ? [[-oe, S / 2], [S / 2, S + oe]] : [[-oe, S + oe]];
  const rectPR = (p0: number, p1: number, r0: number, r1: number, attrs: string): string => {
    const [ax, ay] = m.xy(p0, r0);
    const [bx, by] = m.xy(p1, r1);
    return kit.rect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay), attrs);
  };

  // környezet: tetősíkok és az épület körvonala
  let context = '';
  for (const [pa, pb] of planes) context += rectPR(pa, pb, -og, -og + Lr, `${kit.fill('lineMuted', 0.08)} ${kit.stroke('lineMuted')}`);
  context += kit.rect(0, 0, W, L, `fill="none" ${kit.stroke('lineMuted', 1, [6, 4])}`);
  const geom = kit.snapshot();
  kit.scaleTo(geom);
  const fs = kit.fs;

  const mapEl = (e: Element): ((p: Pt) => Pt) => (q: Pt) => m.pt(e.group, q[0], q[1]);
  const drawOne = (e: Element): string => {
    if (e.kind === 'ridge') {
      const t = plan.roof.rafterSection.t;
      return `<g data-el="${esc(e.id)}" class="el el-ridge">`
        + `${rectPR(S / 2 - t / 2, S / 2 + t / 2, -og + e.geom.u, -og + e.geom.u + e.geom.w, `${kit.fill('line', 0.35)} ${kit.stroke('line')}`)}</g>`;
    }
    if (e.kind === 'collar') {
      // fogópár: szaggatott sáv a két szarufa között (p: a gerincre merőleges, r: a gerinccel párhuzamos)
      const { u, v, w, h } = e.geom;
      return elGroup(e.id, e.kind, rectPR(v, v + h, -og + u, -og + u + w, `${kit.fill('lineMuted', 0.15)} ${kit.stroke('line', 1, [6, 4])}`));
    }
    return drawEl(kit, e, mapEl(e));
  };
  const els = scene.elements.filter(e => PLANES.has(e.group) || e.group === 'roof.ridge' || e.group === 'roof.collar');
  const frame = ctx.on('frame') ? els.filter(e => FRAME.has(e.kind)).map(drawOne).join('') : '';
  const battens = ctx.on('battens') ? els.filter(e => BATTENS.has(e.kind)).map(drawOne).join('') : '';
  // állókorcos lemez: korcvonalak a lejtés irányában, sávszélességenként (csak rajz, nincs scene-elem)
  let seams = '';
  if (ctx.on('battens') && plan.roof.covering === 'standingSeam') {
    const strips = Math.ceil(Lr / STANDING_SEAM_WIDTH - 1e-9);
    const st = kit.stroke('lineMuted', 0.8);
    for (const [pa, pb] of planes) {
      for (let k = 0; k <= strips; k++) {
        const r = -og + Math.min(k * STANDING_SEAM_WIDTH, Lr);
        const [ax, ay] = m.xy(pa, r);
        const [bx, by] = m.xy(pb, r);
        seams += kit.line(ax, ay, bx, by, `class="seam" ${st}`);
      }
    }
  }
  let fx = '';
  if (ctx.on('fasteners')) {
    const r = fxRadius(geom);
    for (const f of scene.fasteners.filter(x => PLANES.has(x.group) || x.group === 'roof.collar')) {
      const [x, y] = f.group === 'roof.collar' ? m.xy(f.v, -og + f.u) : m.pt(f.group, f.u, f.v);
      fx += fxCircle(kit, f.id, f.kind, x, y, r);
    }
  }

  // feliratok a gerinc elején túl
  const labelAt = (p: number, s: string): string => {
    const [x, y] = m.xy(p, -og - fs * 1.2);
    return m.ridgeY ? kit.text(x, y, s, { color: 'lineMuted' })
      : kit.text(-og - fs * 0.6, y, s, { anchor: 'end', color: 'lineMuted' });
  };
  const labels = g.planes === 2 ? labelAt(S / 2, 'Gerinc') : labelAt(-oe / 2, 'Magas oldal');

  // méretek: a szarufakiosztás és a gerinc menti méretek a p = −oe ereszoldalon,
  // a gerincre merőleges méretek a gerinc végén
  let dims = '';
  if (ctx.on('dims')) {
    const row = fs * 2.4;
    const outP = m.xy(-1, 0);
    const outR = m.xy(0, 1);
    const along = (rs: number[], k: number): string => {
      const pts = rs.map(r => m.xy(-oe, r));
      return pts.length > 1 ? kit.chain(pts, outSign(pts[0], pts[1], [outP[0], outP[1]]) * row * k) : '';
    };
    const across = (ps: number[], k: number): string => {
      const pts = ps.map(p => m.xy(p, -og + Lr));
      return pts.length > 1 ? kit.chain(pts, outSign(pts[0], pts[1], [outR[0], outR[1]]) * row * k) : '';
    };
    const plane = g.planes === 2 ? 'roof.L' : 'roof.M';
    const axes = scene.elements.filter(e => e.group === plane && e.kind === 'rafter').map(e => -og + e.geom.u + e.geom.w / 2);
    dims += along([...new Set(axes)].sort((a, b) => a - b), 1);
    dims += along([-og, 0, Lr - 2 * og, Lr - og], 2);
    dims += along([-og, Lr - og], 3);
    dims += across(g.planes === 2 ? [-oe, 0, S / 2, S, S + oe] : [-oe, 0, S, S + oe], 1);
    dims += across([-oe, S + oe], 2);
  }
  // a lécezés a váz ALÁ kerül: így a szarufák látszanak felül és kapják az egérmutatót
  return context + labels + layerG('battens', seams + battens) + layerG('frame', frame) + layerG('fasteners', fx) + layerG('dims', dims + kit.takeLabels());
}

