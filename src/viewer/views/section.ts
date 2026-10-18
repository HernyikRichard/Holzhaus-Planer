import type { Plan, RoofCovering, RoofLayerKind, WallLayerKind } from '../../model/types';
import {
  BEAM_SECTIONS, COUNTER_BATTEN_SECTION, DECKING_REQUIRED, GROUND_SCREW_LABEL, PIER_ROW_H, REBAR_COVER, ROOF_BATTEN_SECTION,
  SCREW_HEAD_H,
} from '../../catalog';
import { frameLayout, hasFrame } from '../../calc/frame';
import { pierDesc, pierWidth } from '../../calc/supports';
import { COVERING_T, DECKING_T, FOIL_T, floorTopZ, layerThickness, wallLayerStrips } from '../../scene/layerStack';
import { cm, type Kit, type Pt } from '../svgKit';
import { layerG, type ViewCtx } from './common';

const WALL_LABEL: Record<WallLayerKind, string> = {
  interiorCladding: 'Belső burkolat', vaporBarrier: 'Párazáró fólia', insulation: 'Szigetelés',
  osb: 'OSB lemez', breatherMembrane: 'Szélzáró fólia', battens: 'Szellőztető léc',
  exteriorCladding: 'Külső burkolat',
};
const ROOF_LABEL: Record<RoofLayerKind, string> = {
  decking: 'Deszkázat', underlay: 'Alátétfólia', counterBatten: 'Ellenléc', batten: 'Tetőléc',
};
const COVERING_LABEL: Record<RoofCovering, string> = {
  tile: 'Cserép', trapezoid: 'Trapézlemez', shingle: 'Zsindely', epdm: 'EPDM fólia',
  standingSeam: 'Állókorcos alumíniumlemez',
};
interface Label { ax: number; az: number; text: string }

/** Címkék egymás alatt (fentről lefelé, a megadott sorrendben), vezetővonallal a rétegekhez. */
function placeLabels(kit: Kit, items: Label[], labelX: number, anchor: 'start' | 'end', gap: number): string {
  if (items.length === 0) return '';
  const mean = items.reduce((s, i) => s + i.az, 0) / items.length;
  let y = mean + ((items.length - 1) * gap) / 2;
  let out = '';
  const pad = anchor === 'end' ? kit.fs * 0.3 : -kit.fs * 0.3;
  for (const it of items) {
    out += kit.line(it.ax, -it.az, labelX + pad, -y, kit.stroke('lineMuted', 0.6));
    out += kit.text(labelX, -y, it.text, { anchor });
    y -= gap;
  }
  return out;
}

type Box = (x0: number, x1: number, z0: number, z1: number, fill: string) => string;
interface FrameSection { svg: string; so: number; bottom: number; beamBottom: number; axes: number[]; footingDepth: number | null }

const GROUND_MARGIN = 300; // a talajsáv túlnyúlása a ház két oldalán (mm)
const HATCH = 150;         // a talaj sraffozásának mélysége és lépésköze (mm)
const HEAD_PLATE = 8;      // az U-fej talplemeze (mm)
const POST_ROD = 40;       // az oszloptalp menetes szára a rajzon (mm)
const POST_EMBED = 150;    // az oszloptalp beágyazása a talpba (mm)
const BRACKET_T = 10;      // a gerendapapucs talplemeze (mm), a 3D-vel egyezően

/**
 * Pontalap / betonpillér a metszetben: a talp a talaj alatt (beton, a hosszvasak szaggatottan), fölötte az oszloptalp
 * U-fejjel, ill. a pillér (zsalukőnél a sorhatárokkal) és a gerendapapucs.
 */
function concreteSupports(ctx: ViewCtx, axes: number[], lengthwise: boolean, box: Box, labels: Label[]): string {
  const { plan, kit } = ctx;
  const fl = frameLayout(plan);
  const bb = fl.z.beamBottom;
  const { size, depth } = plan.foundation.footing;
  const pier = plan.foundation.type === 'concretePier' ? plan.foundation.pier.kind : null;
  const concrete = kit.fill('concrete', 0.75);
  const metal = kit.fill('lineMuted', 0.6);
  const plate = lengthwise ? (pier ? pierWidth(pier) : 120) : fl.beam.width + 12;
  const flange = Math.min(100, fl.beam.height * 0.6);
  const ears = (x: number): string => (lengthwise ? ''
    : box(x - plate / 2, x - plate / 2 + 6, bb, bb + flange, metal) + box(x + plate / 2 - 6, x + plate / 2, bb, bb + flange, metal));

  let footing = '';
  let top = '';
  let rebar = '';
  const pw = pier ? pierWidth(pier) : 0;
  // a hosszvasak a vasalt keresztmetszet sarkaiban (zsalucsőnél a beírt négyzetben), takarással
  const barHalf = (pier === 'tube200' ? pw / Math.SQRT2 : pier ? pw : size) / 2 - REBAR_COVER;
  const barTop = pier ? bb - REBAR_COVER : -REBAR_COVER;
  for (const x of axes) {
    footing += box(x - size / 2, x + size / 2, -depth, 0, concrete);
    for (const bx of [x - barHalf, x + barHalf]) rebar += kit.line(bx, depth - REBAR_COVER, bx, -barTop, kit.stroke('line', 0.8, [6, 4]));
    if (pier) {
      top += box(x - pw / 2, x + pw / 2, 0, bb - BRACKET_T, concrete);
      if (pier !== 'tube200') {
        for (let z = PIER_ROW_H; z < bb - BRACKET_T; z += PIER_ROW_H) top += kit.line(x - pw / 2, -z, x + pw / 2, -z, kit.stroke('line', 0.6));
      }
      top += box(x - plate / 2, x + plate / 2, bb - BRACKET_T, bb, metal) + ears(x);
    } else {
      top += box(x - POST_ROD / 2, x + POST_ROD / 2, -POST_EMBED, bb - HEAD_PLATE, metal);
      top += box(x - plate / 2, x + plate / 2, bb - HEAD_PLATE, bb, metal) + ears(x);
    }
  }
  // fentről lefelé, a szerkezet sorrendjében: pillér / oszloptalp, majd a talp
  labels.push({ ax: axes[0], az: bb / 2, text: pier ? `${pierDesc(pier)}, gerendapapucs` : 'Állítható oszloptalp U-fejjel' });
  labels.push({ ax: axes[0], az: -depth / 2, text: `Betontalp ${size / 10}×${size / 10} cm` });
  return `<g data-layer="footing">${footing}</g>`
    + `<g data-layer="${pier ? 'pier' : 'postBase'}">${top}</g>`
    + `<g data-layer="rebar">${rebar}</g>`;
}

/**
 * Talajcsavaros alap a metszetben (x: 0…S a metszet mentén, z: a talajtól felfelé). Ha a metszet a főgerendákra merőleges,
 * a főgerendák keresztmetszetben a `beamAxes`-en; ha velük párhuzamos, egy főgerenda hosszmetszete a `supportAxes` támaszaival.
 */
function frameSection(ctx: ViewCtx, S: number, box: Box, labels: Label[]): FrameSection {
  const { plan, kit } = ctx;
  const fl = frameLayout(plan);
  const { length: len, diameter: d } = plan.foundation.groundScrew;
  const { beamBottom: bb, beamTop: bt, joistTop: jt, floorTop: ft } = fl.z;
  const lengthwise = (plan.roof.ridgeDirection === 'x' ? 'y' : 'x') === fl.along;
  const axes = lengthwise ? fl.supportAxes : fl.beamAxes;
  const so = GROUND_MARGIN;
  const screw = plan.foundation.type === 'groundScrew';
  const footingDepth = screw ? null : plan.foundation.footing.depth;
  const bottom = footingDepth === null ? -len - HATCH : -footingDepth - HATCH;
  const wood = kit.fill('wood', 0.55);
  const metal = kit.fill('lineMuted', 0.6);

  // talaj: halvány sáv, a felszín alatt ferde sraffozás
  let ground = box(-so, S + so, bottom, 0, kit.fill('lineMuted', 0.08));
  // a talp tetején ne látszódjon át a sraffozás
  const half = screw ? 0 : plan.foundation.footing.size / 2;
  const hidden = (x: number): boolean => !screw && axes.some(a => x > a - half && x - HATCH < a + half);
  for (let x = -so + HATCH; x <= S + so; x += HATCH) if (!hidden(x)) ground += kit.line(x, HATCH, x - HATCH, 0, kit.stroke('lineMuted', 0.6));
  ground += kit.line(-so, 0, S + so, 0, kit.stroke('line', 1.4));
  let svg = `<g data-layer="ground">${ground}</g>`;

  // csavarok: a talajban szaggatott körvonal, fölötte a cső, az U-fej (szár, talplemez, keresztmetszetben az oldallemezek)
  const plate = lengthwise ? d * 2 : fl.beam.width + 12;
  const flange = Math.min(100, fl.beam.height * 0.6);
  let screws = '';
  for (const x of screw ? axes : []) {
    screws += kit.rect(x - d / 2, 0, d, len, `fill="none" ${kit.stroke('line', 0.8, [6, 4])}`);
    screws += box(x - d / 2, x + d / 2, 0, bb - SCREW_HEAD_H, metal);
    screws += box(x - d / 4, x + d / 4, bb - SCREW_HEAD_H, bb - HEAD_PLATE, metal);
    screws += box(x - plate / 2, x + plate / 2, bb - HEAD_PLATE, bb, metal);
    if (!lengthwise) {
      screws += box(x - plate / 2, x - plate / 2 + 6, bb, bb + flange, metal);
      screws += box(x + plate / 2 - 6, x + plate / 2, bb, bb + flange, metal);
    }
  }
  if (screw) svg += `<g data-layer="groundScrew">${screws}</g>`;
  const concreteLabels: Label[] = [];
  if (!screw) svg += concreteSupports(ctx, axes, lengthwise, box, concreteLabels);

  // főgerenda(k)
  let beams = '';
  if (lengthwise) beams = box(0, S, bb, bt, wood);
  else {
    for (const c of fl.beamAxes) {
      for (let k = 0; k < fl.beam.plies; k++) {
        const x0 = c - fl.beam.width / 2 + k * fl.beam.ply.t;
        beams += box(x0, x0 + fl.beam.ply.t, bb, bt, wood);
      }
    }
  }
  svg += `<g data-layer="beam">${beams}</g>`;

  // padló: párnafák (hosszmetszetben keresztmetszetük) és szigetelés, rajta az OSB
  let floor = box(0, S, bt, ft, kit.fill('insulation', 0.45));
  if (lengthwise) {
    const t = plan.floor.joistSection.t;
    for (const p of fl.joistPositions) floor += box(p, p + t, bt, jt, wood);
  }
  floor += box(0, S, jt, ft, wood);
  svg += `<g data-layer="floor">${floor}</g>`;

  const sw = plan.walls.studSection.w;
  labels.push({ ax: sw + 100, az: (bt + ft) / 2, text: `Padló – ${ft - bt} mm` });
  labels.push({ ax: lengthwise ? sw / 2 : axes[0], az: (bb + bt) / 2, text: `Főgerenda ${BEAM_SECTIONS[plan.foundation.frame.beamSection].label}` });
  if (screw) labels.push({ ax: axes[0], az: -len / 2, text: GROUND_SCREW_LABEL(d, len) });
  labels.push(...concreteLabels);
  return { svg, so, bottom, beamBottom: bb, axes, footingDepth };
}

/** Metszet a gerincre merőlegesen: alap, padló, falak rétegrendje, tető rétegrendje (a régi metszet logikája). */
export function drawSection(ctx: ViewCtx): string {
  const { plan, kit } = ctx;
  const { width: W, length: L, wallHeight: H } = plan.building;
  const { t: st, w: sw } = plan.walls.studSection;
  const plates = plan.walls.topPlate === 'double' ? 2 : 1;
  const { shape, pitch, eaveOverhang: oe, ridgeDirection } = plan.roof;
  const f = plan.foundation;
  const S = ridgeDirection === 'x' ? L : W; // a gerincre merőleges fesztáv
  const tan = Math.tan((pitch * Math.PI) / 180);
  const cos = Math.cos((pitch * Math.PI) / 180);
  const gable = shape === 'gable';
  const rise = (gable ? S / 2 : S) * tan;
  const zFloor = floorTopZ(plan);
  const zBase = zFloor + H;
  const Y = (z: number): number => -z;
  const line = kit.stroke('line', 0.8);
  const poly = (pts: Pt[], fill: string): string => kit.poly(pts.map(([x, z]): Pt => [x, Y(z)]), `${fill} ${line}`);
  const box = (x0: number, x1: number, z0: number, z1: number, fill: string): string =>
    kit.rect(Math.min(x0, x1), Y(z1), Math.abs(x1 - x0), z1 - z0, `${fill} ${line}`);
  const wood = kit.fill('wood', 0.55);

  const foundationLabels: Label[] = [];
  let body = '';

  let so: number;
  let bedBottom: number;
  let frame: FrameSection | null = null;
  if (hasFrame(plan)) {
    // gerendakeret: talaj, (talajcsavarnál csavarok, U-fejek), főgerenda, padló
    frame = frameSection(ctx, S, box, foundationLabels);
    body += frame.svg;
    so = frame.so;
    bedBottom = frame.bottom;
  } else {
    // sóderágy és lemez
    so = f.slabOverhang;
    bedBottom = -f.slabThickness - f.gravelBedThickness;
    body += `<g data-layer="gravelBed">${box(-so, S + so, bedBottom, -f.slabThickness, kit.fill('concrete', 0.35))}</g>`;
    body += `<g data-layer="slab">${box(-so, S + so, -f.slabThickness, 0, kit.fill('concrete', 0.75))}</g>`;

    if (plan.floor.enabled) {
      const jw = plan.floor.joistSection.w;
      body += `<g data-layer="floor">${box(0, S, 0, zFloor, kit.fill('insulation', 0.45))}${box(0, S, jw, zFloor, wood)}</g>`;
      foundationLabels.push({ ax: sw + 100, az: zFloor / 2, text: `Padló – ${zFloor} mm` });
    }
    foundationLabels.push({ ax: -so / 2, az: -f.slabThickness / 2, text: `Betonlemez – ${f.slabThickness} mm` });
    foundationLabels.push({ ax: -so / 2, az: -f.slabThickness - f.gravelBedThickness / 2, text: `Sóderágy – ${f.gravelBedThickness} mm` });
  }

  // falak: a q koordináta a váz külső síkjától befelé nő (a váz: 0…sw), kifelé negatív
  const wallTops = [zBase + (gable ? 0 : rise), zBase];
  const layers = plan.walls.layers;
  const strips = wallLayerStrips(plan);

  const wx = (side: 0 | 1, q0: number, q1: number): [number, number] => (side === 0 ? [q0, q1] : [S - q0, S - q1]);
  const wallMid = zFloor + H / 2;
  const wallLabels: Label[] = [];
  for (const l of layers) {
    const q = strips.get(l.kind);
    if (!l.enabled || !q) continue;
    const insulation = l.kind === 'insulation';
    body += `<g data-layer="${l.kind}">`;
    for (const side of [0, 1] as const) {
      const [a, b] = wx(side, q[0], q[1]);
      body += box(a, b, zFloor, wallTops[side], insulation ? kit.fill('insulation', 0.45) : kit.fill('wood', 0.35));
    }
    body += '</g>';
    const lt = layerThickness(plan, l);
    wallLabels.push({ ax: (q[0] + q[1]) / 2, az: wallMid, text: lt > 0 ? `${WALL_LABEL[l.kind]} – ${lt} mm` : WALL_LABEL[l.kind] });
  }
  for (const side of [0, 1] as const) {
    const [a, b] = wx(side, 0, sw);
    body += `<g data-frame="wall">${box(a, b, zFloor, zFloor + st, wood)}${box(a, b, wallTops[side] - plates * st, wallTops[side], wood)}</g>`;
  }
  wallLabels.sort((a, b) => b.ax - a.ax); // belülről kifelé, fentről lefelé

  // tető: a szarufák alsó síkja zU(x), erre épülnek a rétegek függőleges eltolással
  const zU = gable
    ? (x: number): number => zBase + tan * (x <= S / 2 ? x : S - x)
    : (x: number): number => zBase + tan * (S - x);
  const planes: Array<[number, number]> = gable ? [[-oe, S / 2], [S / 2, S + oe]] : [[-oe, S + oe]];
  const vert = (t: number): number => t / cos;
  const stripPoly = (v0: number, v1: number, fill: string): string => planes.map(([xa, xb]) =>
    poly([[xa, zU(xa) + v0], [xb, zU(xb) + v0], [xb, zU(xb) + v1], [xa, zU(xa) + v1]], fill)).join('');
  const rafterW = plan.roof.rafterSection.w;
  let v = vert(rafterW);
  body += `<g data-frame="rafters">${stripPoly(0, v, wood)}</g>`;
  const rx = S + oe / 2;
  const roofLabels: Label[] = [{ ax: rx, az: zU(rx) + v / 2, text: `Szarufa ${plan.roof.rafterSection.t}×${rafterW}` }];
  const stack: Array<{ kind: string; label: string; t: number; foil: boolean }> = [];
  // deszkát igénylő héjazatnál a deszkázat mindig, léc és ellenléc soha (mint az anyaglistában és a 3D-ben)
  const forced = DECKING_REQUIRED.has(plan.roof.covering);
  for (const l of plan.roof.layers) {
    const on = forced ? l.kind === 'decking' || (l.enabled && l.kind === 'underlay') : l.enabled;
    if (!on) continue;
    const t = l.kind === 'decking' ? DECKING_T : l.kind === 'underlay' ? FOIL_T
      : l.kind === 'counterBatten' ? COUNTER_BATTEN_SECTION.t : ROOF_BATTEN_SECTION.t;
    stack.push({ kind: l.kind, label: ROOF_LABEL[l.kind], t, foil: l.kind === 'underlay' });
  }
  stack.push({ kind: 'covering', label: COVERING_LABEL[plan.roof.covering], t: COVERING_T[plan.roof.covering], foil: false });
  for (const s of stack) {
    const v1 = v + vert(s.t);
    body += `<g data-layer="${s.kind}">${stripPoly(v, v1, s.foil ? kit.fill('sheet', 0.6) : kit.fill('wood', 0.3))}</g>`;
    roofLabels.push({ ax: rx, az: zU(rx) + (v + v1) / 2, text: s.foil ? s.label : `${s.label} – ${s.t} mm` });
    v = v1;
  }
  roofLabels.reverse(); // a legfelső réteg legyen legfelül

  // a betűméret a szerkezet méretéből; utána a címkék és a méretek
  kit.scaleTo(kit.snapshot());
  const fs = kit.fs;
  const reach = Math.max(oe, so) + fs * 2;
  const gap = fs * 1.7;
  let labels = placeLabels(kit, [...wallLabels, ...foundationLabels], -reach, 'end', gap);
  labels += placeLabels(kit, roofLabels, S + reach, 'start', gap);
  let dims = '';
  if (ctx.on('dims') && frame) {
    // talaj → főgerenda alja a jobb oldalon, alul a csavartengelyek lánca és a teljes méret
    dims += kit.dim(S, Y(0), S, Y(frame.beamBottom), so + fs * 1.2, cm(frame.beamBottom));
    // pontalapnál/betonpillérnél a talp mélysége (talaj → talp alja), ugyanazon az oldalon
    if (frame.footingDepth !== null) dims += kit.dim(S, Y(-frame.footingDepth), S, Y(0), so + fs * 1.2, cm(frame.footingDepth));
    dims += kit.chain([0, ...frame.axes, S].map((x): Pt => [x, Y(bedBottom)]), fs * 2.4);
    dims += kit.dim(0, Y(bedBottom), S, Y(bedBottom), fs * 4.8, cm(S));
  } else if (ctx.on('dims')) {
    dims += kit.dim(0, Y(bedBottom), S, Y(bedBottom), fs * 2.4, cm(S));
    dims += kit.dim(-so, Y(bedBottom), S + so, Y(bedBottom), fs * 4.8, cm(S + 2 * so));
  }
  return body + labels + layerG('dims', dims + kit.takeLabels());
}
