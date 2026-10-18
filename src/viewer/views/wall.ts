import type { Plan, WallSide } from '../../model/types';
import { roofGeometry, wallGeometry, type WallGeom } from '../../calc/geometry';
import { frameLayout, hasFrame } from '../../calc/frame';
import type { Element } from '../../scene/types';
import { PIER_ROW_H, PLINTH_BLOCK_WIDTH } from '../../catalog';
import { cm, elGroup, esc, fxCircle, n, type Pt } from '../svgKit';
import { drawEl, drawOpening, fxRadius, layerG, type ViewCtx } from './common';

export interface WallMap {
  wall: WallGeom; mirror: boolean;
  /** A fal eleje a nézett épületoldal sarkától (a rövidebb falpárnál a keresztfal vastagsága). */
  start: number;
  /** A nézett épületoldal teljes hossza. */
  sideLength: number;
  /** Fal (u, v) → nézet (x, y): kívülről nézve, az É és K falon tükrözve; y = −v. */
  pt(u: number, v: number): Pt;
}

export function wallMap(plan: Plan, side: WallSide): WallMap {
  const wall = wallGeometry(plan).find(g => g.side === side)!;
  const mirror = side === 'N' || side === 'E';
  const start = wall.full ? 0 : plan.walls.studSection.w;
  const sideLength = side === 'N' || side === 'S' ? plan.building.width : plan.building.length;
  const len = wall.length;
  return { wall, mirror, start, sideLength, pt: (u, v) => [mirror ? len - u : u, -v] };
}

/** A fal körvonala (u, v)-ben: talp alja → koszorú teteje, oromfalnál az oromháromszöggel. */
export function wallOutline(wall: WallGeom): Pt[] {
  const top: Pt[] = [[wall.length, wall.hEnd]];
  if (wall.gableRise > 0) top.push([wall.length / 2, wall.hStart + wall.gableRise]);
  top.push([0, wall.hStart]);
  return [[0, 0], [wall.length, 0], ...top];
}

/**
 * A tető körvonala az épületoldal-koordinátában (c: az oldal sarkától, z: a talp aljától felfelé),
 * a régi homlokzatrajz szabályai szerint.
 */
function roofContour(plan: Plan, side: WallSide, A: number): Pt[] {
  const H = plan.building.wallHeight;
  const { eaveOverhang: oe, gableOverhang: og, shape, ridgeDirection, pitch } = plan.roof;
  const rad = (pitch * Math.PI) / 180;
  const tan = Math.tan(rad);
  const th = plan.roof.rafterSection.w / Math.cos(rad);
  const horizontal = side === 'N' || side === 'S';
  const eaveWall = ridgeDirection === 'x' ? horizontal : !horizontal;
  const span = ridgeDirection === 'x' ? plan.building.length : plan.building.width;
  const rise = (shape === 'gable' ? span / 2 : span) * tan;
  if (eaveWall) {
    const zl = H - oe * tan;
    const zh = shape === 'gable' ? H + rise : H + rise + oe * tan;
    const highSide = ridgeDirection === 'x' ? 'N' : 'W';
    // egyhajlású tetőnél a magas ereszoldalról csak a tető vékony éle látszik
    return shape !== 'gable' && side === highSide
      ? [[-og, zh], [A + og, zh], [A + og, zh + th], [-og, zh + th]]
      : [[-og, zl], [A + og, zl], [A + og, zh + th], [-og, zh + th]];
  }
  if (shape === 'gable') {
    const zl = H - oe * tan;
    return [[-oe, zl], [A / 2, H + rise], [A + oe, zl], [A + oe, zl + th], [A / 2, H + rise + th], [-oe, zl + th]];
  }
  const zh = H + rise + oe * tan;
  const zl = H - oe * tan;
  return [[-oe, zh], [A + oe, zl], [A + oe, zl + th], [-oe, zh + th]];
}

/** A szarufák (és fogópárok) metszete az oromfal síkjában: (p, z) sokszögek elemenként. */
function roofSection(ctx: ViewCtx, side: WallSide): Array<{ e: Element; pts: Pt[] }> {
  const { plan, scene } = ctx;
  const g = roofGeometry(plan);
  const H = plan.building.wallHeight;
  const { eaveOverhang: oe, pitch } = plan.roof;
  const rad = (pitch * Math.PI) / 180;
  const tan = Math.tan(rad);
  const th = plan.roof.rafterSection.w / Math.cos(rad);
  const S = g.W;
  const first = side === 'N' || side === 'W';
  const pickRafter = (group: string): Element | undefined => {
    const rs = scene.elements.filter(e => e.group === group && e.kind === 'rafter').sort((a, b) => a.geom.u - b.geom.u);
    return first ? rs[0] : rs[rs.length - 1];
  };
  const out: Array<{ e: Element; pts: Pt[] }> = [];
  const bar = (p0: number, z0: number, p1: number, z1: number): Pt[] => [[p0, z0], [p1, z1], [p1, z1 + th], [p0, z0 + th]];
  if (g.shape === 'gable') {
    const l = pickRafter('roof.L');
    const r = pickRafter('roof.R');
    if (l) out.push({ e: l, pts: bar(-oe, H - oe * tan, S / 2, H + g.rise) });
    if (r) out.push({ e: r, pts: bar(S / 2, H + g.rise, S + oe, H - oe * tan) });
    const ref = l?.geom.u ?? 0;
    const collars = scene.elements.filter(e => e.kind === 'collar');
    if (collars.length > 0) {
      const best = collars.reduce((a, b) => (Math.abs(b.geom.u - ref) < Math.abs(a.geom.u - ref) ? b : a)).geom.u;
      const cw = plan.roof.rafterSection.w;
      for (const c of collars.filter(e => e.geom.u === best)) {
        out.push({ e: c, pts: [[c.geom.v, H], [c.geom.v + c.geom.h, H], [c.geom.v + c.geom.h, H + cw], [c.geom.v, H + cw]] });
      }
    }
  } else {
    const m = pickRafter('roof.M');
    if (m) out.push({ e: m, pts: bar(-oe, H + g.rise + oe * tan, S + oe, H - oe * tan) });
  }
  return out;
}

/** Szarufa (u, v) pontja → (p, z) az oromfal síkjában (a szarufa alsó síkján). */
function rafterPoint(ctx: ViewCtx, group: string, v: number): Pt {
  const g = roofGeometry(ctx.plan);
  const H = ctx.plan.building.wallHeight;
  const { eaveOverhang: oe, pitch } = ctx.plan.roof;
  const rad = (pitch * Math.PI) / 180;
  const S = g.W;
  const p = group === 'roof.L' ? -oe + v * Math.cos(rad) : S + oe - v * Math.cos(rad);
  const z = g.shape === 'gable'
    ? H + Math.tan(rad) * Math.min(p, S - p)
    : H + Math.tan(rad) * (S - p);
  return [p, z];
}

/**
 * A gerendakeret sávja a falnézetben a fal alatt (y > 0): a talajtól a padló tetejéig, a főgerenda és a párnafa
 * szintjeivel. `ground`: a talaj y koordinátája a nézetben.
 */
function frameBand(ctx: ViewCtx, side: WallSide, x0: number, x1: number): { svg: string; ground: number } {
  const { plan, kit } = ctx;
  const fl = frameLayout(plan);
  const { beamBottom, beamTop, joistTop, floorTop } = fl.z;
  const a = Math.min(x0, x1);
  const w = Math.abs(x1 - x0);
  if (plan.foundation.type === 'stripFooting') {
    // sávalap: a talajon a lábazat (beton, a sorhatárokkal; a sarkokon a falsíkon túl a zsalukő feléig), rajta a
    // talpgerenda, fölötte a párnafák és a padló halvány sávja
    const pw = PLINTH_BLOCK_WIDTH[plan.foundation.plinth.block];
    const ext = pw / 2 - fl.beam.width / 2;
    const y = (z: number): number => floorTop - z;
    let plinth = kit.rect(a - ext, y(beamBottom), w + 2 * ext, beamBottom, `${kit.fill('concrete', 0.6)} ${kit.stroke('line', 0.8)}`);
    for (let z = PIER_ROW_H; z < beamBottom; z += PIER_ROW_H) plinth += kit.line(a - ext, y(z), a + w + ext, y(z), kit.stroke('line', 0.5));
    let body = kit.rect(a, 0, w, y(beamTop), `${kit.fill('lineMuted', 0.15)} ${kit.stroke('lineMuted', 0.6)}`);
    body += kit.line(a, y(joistTop), a + w, y(joistTop), kit.stroke('lineMuted', 0.6));
    body += `<g data-layer="plinth">${elGroup(`frame.plinth.${side}`, 'plinth', plinth)}</g>`;
    body += `<g data-layer="sill">${kit.rect(a, y(beamTop), w, beamTop - beamBottom, `${kit.fill('wood', 0.55)} ${kit.stroke('line', 0.8)}`)}</g>`;
    return { svg: `<g data-layer="frameBand">${body}</g>`, ground: floorTop };
  }
  let body = kit.rect(a, 0, w, floorTop, `${kit.fill('lineMuted', 0.15)} ${kit.stroke('lineMuted', 0.6)}`);
  for (const z of [beamBottom, beamTop, joistTop]) body += kit.line(a, floorTop - z, a + w, floorTop - z, kit.stroke('lineMuted', 0.6));
  return { svg: `<g data-layer="frameBand">${body}</g>`, ground: floorTop };
}

/** Falnézet (és az oromfal-nézet, ha `withRoof`). */
export function drawWall(ctx: ViewCtx, side: WallSide, withRoof = false): string {
  const { plan, scene, kit } = ctx;
  const map = wallMap(plan, side);
  const { wall, start, sideLength: A } = map;
  const len = wall.length;
  const group = `wall.${side}`;
  const P = (p: Pt): Pt => map.pt(p[0], p[1]);
  const C = (c: number, z: number): Pt => map.pt(c - start, z); // épületoldal-koordináta → nézet
  const els = scene.elements.filter(e => e.group === group);

  // környezet (mindig látszik): a fal körvonala, a tető körvonala, a talajvonal
  const outline = wallOutline(wall).map(P);
  const roof = roofContour(plan, side, A).map(([c, z]) => C(c, z));
  let context = kit.poly(outline, `${kit.fill('line', 0.04)} ${kit.stroke('lineMuted', 1)}`);
  context += kit.poly(roof, `${kit.fill('lineMuted', 0.1)} ${kit.stroke('lineMuted', 1)}`);
  const xs = [...outline, ...roof].map(p => p[0]);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  // gerendakeretes alapnál a fal alatt a keret halvány sávja (a fal a padló tetejéről áll), alatta a talajvonal
  const band = hasFrame(plan) ? frameBand(ctx, side, C(0, 0)[0], C(A, 0)[0]) : null;
  if (band) context += band.svg;
  const geom = kit.snapshot();
  kit.scaleTo(geom);
  const fs = kit.fs;
  context += kit.line(xMin - fs * 2, 0, xMax + fs * 2, 0, kit.stroke('lineMuted', 1, [8, 4]));
  if (band) context += kit.line(xMin - fs * 2, band.ground, xMax + fs * 2, band.ground, kit.stroke('line', 1.2));

  // OSB (a fal körvonalára vágva)
  let sheathing = '';
  if (ctx.on('sheathing')) {
    const clip = `clip-wall-${side}${withRoof ? '-gable' : ''}`;
    const sheets = els.filter(e => e.kind === 'osbSheet').map(e => drawEl(kit, e, P)).join('');
    if (sheets) {
      sheathing = `<clipPath id="${clip}"><polygon points="${outline.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}"/></clipPath>`
        + `<g clip-path="url(#${clip})">${sheets}</g>`;
    }
  }

  // váz és nyílások
  let frame = '';
  let roofFrame = '';
  if (ctx.on('frame')) {
    for (const e of els) {
      if (e.kind === 'osbSheet') continue;
      if (e.kind === 'opening') {
        const [x0, y0] = P([e.geom.u, e.geom.v]);
        const [x1, y1] = P([e.geom.u + e.geom.w, e.geom.v + e.geom.h]);
        frame += drawOpening(ctx, e, Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      } else {
        frame += drawEl(kit, e, P);
      }
    }
    if (withRoof) {
      for (const { e, pts } of roofSection(ctx, side)) {
        roofFrame += `<g data-el="${esc(e.id)}" class="el el-${e.kind}">`
          + `${kit.poly(pts.map(([c, z]) => C(c, z)), `${kit.fill('line', 0.12)} ${kit.stroke('line')}`)}</g>`;
      }
    }
  }

  // rögzítések
  let fx = '';
  if (ctx.on('fasteners')) {
    const r = fxRadius(geom);
    for (const f of scene.fasteners.filter(x => x.group === group)) {
      const [x, y] = P([f.u, f.v]);
      fx += fxCircle(kit, f.id, f.kind, x, y, r);
    }
    if (withRoof) {
      for (const { e } of roofSection(ctx, side)) {
        for (const f of scene.fasteners.filter(x => e.fasteners.includes(x.id))) {
          const [c, z] = e.kind === 'collar'
            ? [f.v, plan.building.wallHeight + plan.roof.rafterSection.w / 2] as Pt
            : rafterPoint(ctx, e.group, f.v);
          const [x, y] = C(c, z);
          fx += fxCircle(kit, f.id, f.kind, x, y, r);
        }
      }
    }
  }

  // méretek
  let dims = '';
  if (ctx.on('dims')) {
    const row = fs * 2.4;
    const below = band ? band.ground : 0; // talajcsavarnál a vízszintes méretsorok a keretsáv alatt
    const xOf = (u: number): number => P([u, 0])[0];
    const sortX = (us: number[]): Pt[] => [...new Set(us.map(u => Math.round(xOf(u) * 10) / 10))].sort((a, b) => a - b).map(x => [x, 0]);
    let k = 1;
    const openings = els.filter(e => e.kind === 'opening');
    if (openings.length > 0) {
      dims += kit.chain(sortX([0, len, ...openings.flatMap(o => [o.geom.u, o.geom.u + o.geom.w])]), below + row * k++);
    }
    const studs = els.filter(e => e.kind === 'stud').map(e => e.geom.u + e.geom.w / 2);
    if (studs.length > 1) dims += kit.chain(sortX(studs), below + row * k++);
    dims += kit.dim(Math.min(xOf(0), xOf(len)), 0, Math.max(xOf(0), xOf(len)), 0, below + row * k, cm(len));

    // magasságok: a két falvég, oromfalnál a csúcs is
    const hLeft = map.mirror ? wall.hEnd : wall.hStart;
    const hRight = map.mirror ? wall.hStart : wall.hEnd;
    const wl = Math.min(xOf(0), xOf(len));
    const wr = Math.max(xOf(0), xOf(len));
    const offR = xMax - wr + row;
    const offL = wl - xMin + row;
    dims += kit.dim(wr, 0, wr, -hRight, offR, cm(hRight));
    if (wall.gableRise > 0) {
      const peak = wall.hStart + wall.gableRise;
      dims += kit.dim(wr, 0, wr, -peak, offR + row, cm(peak));
    }
    if (Math.abs(hLeft - hRight) > 0.5 || wall.gableRise > 0) dims += kit.dim(wl, -hLeft, wl, 0, offL, cm(hLeft));

    // nyílások: mellvéd és magasság a nyílás belső oldalán
    const t = plan.walls.studSection.t;
    for (const o of openings) {
      const bottom = o.geom.v;
      const vs = bottom - t > 0.5 ? [t, bottom, bottom + o.geom.h] : [bottom, bottom + o.geom.h];
      const xr = Math.max(xOf(o.geom.u), xOf(o.geom.u + o.geom.w));
      dims += kit.chain(vs.map(v => [xr, -v] as Pt), -fs * 1.2);
    }
  }

  return context + layerG('sheathing', sheathing) + layerG('frame', frame + roofFrame) + layerG('fasteners', fx) + layerG('dims', dims + kit.takeLabels());
}

/** Az oromfal-nézet fala: nyeregtetőnél a gerincre merőleges (oromháromszöges) fal, egyébként a lejtős oldalfal. */
export function gableSide(plan: Plan): WallSide {
  const walls = wallGeometry(plan);
  const gable = walls.find(w => w.gableRise > 0);
  if (gable) return gable.side;
  const perpendicular = walls.filter(w => (plan.roof.ridgeDirection === 'x') === (w.side === 'E' || w.side === 'W'));
  const top = (w: WallGeom): number => Math.max(w.hStart, w.hEnd) + w.gableRise;
  return [...perpendicular].sort((a, b) => top(b) - top(a))[0]?.side ?? 'S';
}

