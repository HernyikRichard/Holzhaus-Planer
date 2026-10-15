import type { Plan, RoofCovering, RoofLayerKind, WallLayerKind } from '../../model/types';
import { BATTEN_SECTION, COUNTER_BATTEN_SECTION, ROOF_BATTEN_SECTION } from '../../catalog';
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
};
// Sematikus rajzi vastagságok (mm); a tetőrétegeknek nincs vastagsága a modellben.
const DECKING_T = 22;
const FOIL_T = 3;
const COVERING_T: Record<RoofCovering, number> = { tile: 40, trapezoid: 20, shingle: 10, epdm: 5 };

/** Rajzi rétegvastagság: a szigetelés a váz szélessége, a lécezés a katalógus-léc vastagsága. */
function layerThickness(plan: Plan, l: { kind: WallLayerKind; thickness: number }): number {
  if (l.kind === 'insulation') return plan.walls.studSection.w;
  if (l.kind === 'battens') return BATTEN_SECTION.t;
  return l.thickness;
}

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
  const zFloor = plan.floor.enabled ? plan.floor.joistSection.w + plan.floor.osbThickness : 0;
  const zBase = zFloor + H;
  const Y = (z: number): number => -z;
  const line = kit.stroke('line', 0.8);
  const poly = (pts: Pt[], fill: string): string => kit.poly(pts.map(([x, z]): Pt => [x, Y(z)]), `${fill} ${line}`);
  const box = (x0: number, x1: number, z0: number, z1: number, fill: string): string =>
    kit.rect(Math.min(x0, x1), Y(z1), Math.abs(x1 - x0), z1 - z0, `${fill} ${line}`);
  const wood = kit.fill('wood', 0.55);

  const foundationLabels: Label[] = [];
  let body = '';

  // sóderágy és lemez
  const so = f.slabOverhang;
  const bedBottom = -f.slabThickness - f.gravelBedThickness;
  body += `<g data-layer="gravelBed">${box(-so, S + so, bedBottom, -f.slabThickness, kit.fill('concrete', 0.35))}</g>`;
  body += `<g data-layer="slab">${box(-so, S + so, -f.slabThickness, 0, kit.fill('concrete', 0.75))}</g>`;

  if (plan.floor.enabled) {
    const jw = plan.floor.joistSection.w;
    body += `<g data-layer="floor">${box(0, S, 0, zFloor, kit.fill('insulation', 0.45))}${box(0, S, jw, zFloor, wood)}</g>`;
    foundationLabels.push({ ax: sw + 100, az: zFloor / 2, text: `Padló – ${zFloor} mm` });
  }
  foundationLabels.push({ ax: -so / 2, az: -f.slabThickness / 2, text: `Betonlemez – ${f.slabThickness} mm` });
  foundationLabels.push({ ax: -so / 2, az: -f.slabThickness - f.gravelBedThickness / 2, text: `Sóderágy – ${f.gravelBedThickness} mm` });

  // falak: a q koordináta a váz külső síkjától befelé nő (a váz: 0…sw), kifelé negatív
  const wallTops = [zBase + (gable ? 0 : rise), zBase];
  const layers = plan.walls.layers;
  const insIdx = layers.findIndex(l => l.kind === 'insulation');
  const strips = new Map<WallLayerKind, [number, number]>();
  let acc = sw;
  for (let i = insIdx - 1; i >= 0; i--) {
    const l = layers[i];
    if (!l.enabled) continue;
    const lt = layerThickness(plan, l);
    const t = lt > 0 ? lt : FOIL_T;
    strips.set(l.kind, [acc, acc + t]);
    acc += t;
  }
  acc = 0;
  for (let i = insIdx + 1; i < layers.length; i++) {
    const l = layers[i];
    if (!l.enabled) continue;
    const lt = layerThickness(plan, l);
    const t = lt > 0 ? lt : FOIL_T;
    strips.set(l.kind, [acc - t, acc]);
    acc -= t;
  }
  if (layers[insIdx]?.enabled) strips.set('insulation', [0, sw]);

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
  for (const l of plan.roof.layers) {
    if (!l.enabled) continue;
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
  if (ctx.on('dims')) {
    dims += kit.dim(0, Y(bedBottom), S, Y(bedBottom), fs * 2.4, cm(S));
    dims += kit.dim(-so, Y(bedBottom), S + so, Y(bedBottom), fs * 4.8, cm(S + 2 * so));
  }
  return body + labels + layerG('dims', dims + kit.takeLabels());
}
