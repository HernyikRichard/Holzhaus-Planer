import type { Mm, Plan, WallLayerKind, WallSide } from '../model/types';
import { BATTEN_SECTION, BATTEN_SPACING_WALL, COUNTER_BATTEN_SECTION, FASCIA_SECTION, ROOF_BATTEN_SECTION } from '../catalog';
import { roofGeometry, studLengthAt, wallGeometry, type WallGeom } from '../calc/geometry';
import type { Element, ElementKind, Scene } from '../scene/types';
import { COVERING_T, DECKING_T, FOIL_T, floorTopZ, wallLayerStrips } from '../scene/layerStack';
import { corners } from '../viewer/views/common';
import { floorWallMap } from '../viewer/views/floorPlan';

export type Layer3dId = 'foundation' | 'floor' | 'wallFrame' | 'interiorCladding' | 'vaporBarrier' | 'insulation'
  | 'wallOsb' | 'breatherMembrane' | 'wallBattens' | 'exteriorCladding' | 'roofFrame' | 'decking' | 'underlay'
  | 'counterBatten' | 'roofBatten' | 'covering' | 'openings' | 'accessories';
export type Vec3 = [number, number, number];
/** Egy síkbeli sokszög (lyukakkal) kihúzva: a 3D test általános alakja. */
export interface Solid {
  layer: Layer3dId;
  elementId?: string;      // ha scene Element-ből készült
  label: string;
  material: string;        // anyagkulcs a kirajzolóban: 'concrete' | 'timber' | 'osb' | 'openingFrame' | 'glass' | 'door'
  origin: Vec3; uAxis: Vec3; vAxis: Vec3; nAxis: Vec3;   // helyi koordinátarendszer (egységvektorok)
  outline: [number, number][]; holes: [number, number][][]; // (u, v) mm a helyi síkban
  depth: number;           // kihúzás az nAxis mentén, mm
}
export interface Model3d { solids: Solid[]; layers: Layer3dId[]; bounds: { min: Vec3; max: Vec3 } }

export const LAYER3D_NAMES: Record<Layer3dId, string> = {
  foundation: 'Betonlemez', floor: 'Padló', wallFrame: 'Falváz', interiorCladding: 'Belső burkolat',
  vaporBarrier: 'Párazáró fólia', insulation: 'Szigetelés', wallOsb: 'OSB', breatherMembrane: 'Szélzáró fólia',
  wallBattens: 'Léc', exteriorCladding: 'Külső burkolat', roofFrame: 'Tetőváz', decking: 'Deszkázat / OSB',
  underlay: 'Alátétfólia', counterBatten: 'Ellenléc', roofBatten: 'Tetőléc', covering: 'Héjazat',
  openings: 'Nyílászárók', accessories: 'Kiegészítők',
};
export const LAYER3D_GROUPS: { name: string; layers: Layer3dId[] }[] = [
  { name: 'Alap', layers: ['foundation', 'floor'] },
  { name: 'Fal', layers: ['wallFrame', 'interiorCladding', 'vaporBarrier', 'insulation', 'wallOsb', 'breatherMembrane', 'wallBattens', 'exteriorCladding'] },
  { name: 'Tető', layers: ['roofFrame', 'decking', 'underlay', 'counterBatten', 'roofBatten', 'covering'] },
  { name: 'Egyéb', layers: ['openings', 'accessories'] },
];
/** A „Csak váz” gyorsgomb rétegei. */
export const FRAME_ONLY: Layer3dId[] = ['foundation', 'floor', 'wallFrame', 'roofFrame', 'openings'];

const LAYER_ORDER: Layer3dId[] = LAYER3D_GROUPS.flatMap(g => g.layers);
const FRAME_KINDS = new Set<ElementKind>(['stud', 'cornerStud', 'gableStud', 'kingStud', 'jackStud', 'cripple', 'sill', 'header', 'bottomPlate', 'topPlate']);
/** A koszorú alatt álló függőleges elemek: a tetejük a (lejtős) koszorú alsó élére vágva. */
const UNDER_PLATE = new Set<ElementKind>(['stud', 'cornerStud', 'kingStud', 'jackStud', 'cripple']);
/** Nyílászáró tok: a keret szélessége a fal síkjában és mélysége a falra merőlegesen (a fal mélységében középen). */
const OPENING_FRAME = 60;
const GLASS_T = 6;
const DOOR_T = 40;

const X: Vec3 = [1, 0, 0];
const Y: Vec3 = [0, 1, 0];
const Z: Vec3 = [0, 0, 1];
const nz = (x: number): number => x + 0; // −0 → 0
const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [nz(a[0] + b[0] * k), nz(a[1] + b[1] * k), nz(a[2] + b[2] * k)];
const rect = (u0: number, v0: number, u1: number, v1: number): [number, number][] => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];

/**
 * A talpgerenda aljának Z-je: a metszetnézet (`section.ts`) a falat a padló tetejére állítja
 * (zFloor = párnafa `joistSection.w` + `osbThickness`), padló nélkül a betonlemezre (0).
 */
export function wallBaseZ(plan: Plan): Mm {
  return floorTopZ(plan);
}

/**
 * A fal helyi síkja a világban: origin a fal kezdőpontja a külső síkon a talpgerenda alján,
 * `uAxis` a fal mentén (a `floorWallMap` u-irányával egyezően, NEM a falnézet esetleg tükrözött iránya),
 * `vAxis` = +Z, `nAxis` befelé (a külső síktól a belső felé).
 */
export function wallFrameOf(plan: Plan, side: WallSide): { origin: Vec3; uAxis: Vec3; vAxis: Vec3; nAxis: Vec3 } {
  const m = floorWallMap(plan, side);
  const [x0, y0] = m.pt(0, 0);
  const [xu, yu] = m.pt(1, 0);
  const [xn, yn] = m.pt(0, 1);
  return {
    origin: [nz(x0), nz(y0), nz(wallBaseZ(plan))],
    uAxis: [nz(xu - x0), nz(yu - y0), 0],
    vAxis: [...Z],
    nAxis: [nz(xn - x0), nz(yn - y0), 0],
  };
}

/** A test világ-befoglalója (a körvonal pontjai a kihúzás két végén). */
export function solidBounds(s: Solid): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const [u, v] of s.outline) {
    const p = add(add(s.origin, s.uAxis, u), s.vAxis, v);
    for (const q of [p, add(p, s.nAxis, s.depth)]) {
      for (let i = 0; i < 3; i++) {
        if (q[i] < min[i]) min[i] = q[i];
        if (q[i] > max[i]) max[i] = q[i];
      }
    }
  }
  return { min, max };
}

/** Függőleges falelem körvonala: lejtős koszorú alatt ferdére vágott tető, oromoszlopnál az oromvonalig. */
function verticalOutline(plan: Plan, wall: WallGeom, e: Element): [number, number][] {
  const { u, v, w, h } = e.geom;
  const t = plan.walls.studSection.t;
  let limit: ((x: number) => number) | null = null;
  if (UNDER_PLATE.has(e.kind)) limit = x => t + studLengthAt(plan, wall, x);
  else if (e.kind === 'gableStud' && wall.gableRise > 0) {
    const half = wall.length / 2;
    limit = x => wall.hStart + wall.gableRise * (1 - Math.abs(x - half) / half);
  }
  const top = (x: number): number => (limit ? Math.min(v + h, limit(x)) : v + h);
  return [[u, v], [u + w, v], [u + w, top(u + w)], [u, top(u)]];
}

function wallSolids(plan: Plan, scene: Scene): Solid[] {
  const { t, w: sw } = plan.walls.studSection;
  const out: Solid[] = [];
  for (const wall of wallGeometry(plan)) {
    const group = `wall.${wall.side}`;
    const f = wallFrameOf(plan, wall.side);
    const els = scene.elements.filter(e => e.group === group);
    const solid = (e: Element | undefined, layer: Layer3dId, label: string, material: string,
      outline: [number, number][], depth: number, offset: number, holes: [number, number][][] = []): void => {
      out.push({
        layer, ...(e ? { elementId: e.id } : {}), label, material,
        origin: add(f.origin, f.nAxis, offset), uAxis: [...f.uAxis], vAxis: [...f.vAxis], nAxis: [...f.nAxis],
        outline, holes, depth,
      });
    };
    // áthidalók: nyílásonként élére állított pallók egymás mellett a fal mélységében (külső és belső sík)
    const headers = new Map<string, Element[]>();
    for (const e of els.filter(x => x.kind === 'header')) {
      const key = e.openingId ?? e.id;
      headers.set(key, [...(headers.get(key) ?? []), e]);
    }
    for (const e of els) {
      if (FRAME_KINDS.has(e.kind)) {
        const vertical = !e.geom.angle && e.kind !== 'bottomPlate' && e.kind !== 'topPlate' && e.kind !== 'sill' && e.kind !== 'header';
        const outline = vertical ? verticalOutline(plan, wall, e) : corners(e);
        if (e.rotated) {
          // elforgatott sarokoszlop: 50 mély, a belső síkhoz simul (az alaprajz L-je)
          solid(e, 'wallFrame', e.label, 'timber', outline, t, sw - t);
        } else if (e.kind === 'header') {
          const hs = headers.get(e.openingId ?? e.id)!;
          const k = hs.indexOf(e);
          const depth = hs.length * t <= sw ? t : sw / hs.length;
          const offset = hs.length > 1 ? (k * (sw - depth)) / (hs.length - 1) : (sw - depth) / 2;
          solid(e, 'wallFrame', e.label, 'timber', outline, depth, offset);
        } else {
          solid(e, 'wallFrame', e.label, 'timber', outline, e.section?.w ?? sw, 0);
        }
      } else if (e.kind === 'opening') {
        const o = plan.openings.find(op => op.id === e.openingId);
        const door = o?.type === 'door';
        const { u, v, w, h } = e.geom;
        const F = OPENING_FRAME;
        const mid = (d: number): number => (sw - d) / 2;
        if (door) {
          // ajtótok küszöb nélkül: U alak
          solid(e, 'openings', `${e.label} – tok`, 'openingFrame',
            [[u, v], [u + F, v], [u + F, v + h - F], [u + w - F, v + h - F], [u + w - F, v], [u + w, v], [u + w, v + h], [u, v + h]],
            F, mid(F));
          solid(e, 'openings', `${e.label} – ajtólap`, 'door', rect(u + F, v, u + w - F, v + h - F), DOOR_T, mid(DOOR_T));
        } else {
          const inner = rect(u + F, v + F, u + w - F, v + h - F);
          solid(e, 'openings', `${e.label} – tok`, 'openingFrame', rect(u, v, u + w, v + h), F, mid(F), [inner]);
          solid(e, 'openings', `${e.label} – üveg`, 'glass', inner, GLASS_T, mid(GLASS_T));
        }
      }
    }
  }
  return out;
}

// ---- fali réteglapok ----

type P2 = [number, number];
interface Rect { u: number; v: number; w: number; h: number }
const GEOM_EPS = 1e-6;

/** Konvex sokszög vágása az f(p) ≥ 0 félsíkra (f lineáris; Sutherland–Hodgman). */
function clipHalf(poly: P2[], f: (p: P2) => number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const fa = f(a);
    const fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** Az a→b él bal oldala (az óramutatóval ellentétes körüljárású sokszög belseje) ≥ 0. */
const leftOf = (a: P2, b: P2) => (p: P2): number => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

function clipConvex(poly: P2[], convex: P2[]): P2[] {
  let out = poly;
  for (let i = 0; i < convex.length && out.length > 0; i++) out = clipHalf(out, leftOf(convex[i], convex[(i + 1) % convex.length]));
  return out;
}

function area(poly: P2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

const rectPts = (r: Rect): P2[] => rect(r.u, r.v, r.u + r.w, r.v + r.h);

/**
 * Konvex lap a nyílások kivágásával. A lapon belül teljesen bent fekvő nyílás lyuk lesz; ha valamelyik nyílás
 * a lap szélébe metsz, a lapot a nyílások u-élei mentén függőleges sávokra, a sávokat a nyílások alá/fölé bontja.
 */
function cutOpenings(poly: P2[], ops: Rect[]): { outline: P2[]; holes: P2[][] }[] {
  if (poly.length < 3 || area(poly) < 1) return [];
  const edges = poly.map((a, i) => leftOf(a, poly[(i + 1) % poly.length]));
  const len = (i: number): number => Math.hypot(poly[(i + 1) % poly.length][0] - poly[i][0], poly[(i + 1) % poly.length][1] - poly[i][1]);
  const strictlyInside = (r: Rect): boolean =>
    rectPts(r).every(p => edges.every((f, i) => f(p) / len(i) > GEOM_EPS));
  const hits = ops.filter(r => area(clipConvex(rectPts(r), poly)) > GEOM_EPS);
  if (hits.every(strictlyInside)) return [{ outline: poly, holes: hits.map(rectPts) }];
  const us = poly.map(p => p[0]);
  const cuts = [...new Set([Math.min(...us), Math.max(...us), ...hits.flatMap(r => [r.u, r.u + r.w])])]
    .filter(u => u >= Math.min(...us) && u <= Math.max(...us)).sort((a, b) => a - b);
  const out: { outline: P2[]; holes: P2[][] }[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const [a, b] = [cuts[i], cuts[i + 1]];
    if (b - a < GEOM_EPS) continue;
    const strip = clipHalf(clipHalf(poly, p => p[0] - a), p => b - p[0]);
    const across = hits.filter(r => r.u <= a + GEOM_EPS && r.u + r.w >= b - GEOM_EPS).sort((x, y) => x.v - y.v);
    let lo = -Infinity;
    for (const r of [...across, null]) {
      const hi = r ? r.v : Infinity;
      let piece = strip;
      if (lo > -Infinity) piece = clipHalf(piece, p => p[1] - lo);
      if (hi < Infinity) piece = clipHalf(piece, p => hi - p[1]);
      if (piece.length >= 3 && area(piece) >= 1) out.push({ outline: piece, holes: [] });
      if (r) lo = r.v + r.h;
    }
  }
  return out;
}

/**
 * A fali réteg körvonala az [u0, u1] sávban: lejtős falon trapéz (a fal lejtésének meghosszabbításával),
 * oromfalon ötszög (a csúcs a fal közepén, a végek a váz oromvonalán, a vázon kívül a fal tetején).
 */
function layerOutline(wall: WallGeom, u0: number, u1: number): P2[] {
  if (wall.gableRise > 0) {
    const half = wall.length / 2;
    const gable = (u: number): number => wall.hStart + wall.gableRise * Math.max(0, 1 - Math.abs(u - half) / half);
    return [[u0, 0], [u1, 0], [u1, gable(u1)], [half, wall.hStart + wall.gableRise], [u0, gable(u0)]];
  }
  const h = (u: number): number => wall.hStart + ((wall.hEnd - wall.hStart) * u) / wall.length;
  return [[u0, 0], [u1, 0], [u1, h(u1)], [u0, h(u0)]];
}

const LAYER_OF: Record<WallLayerKind, Layer3dId> = {
  interiorCladding: 'interiorCladding', vaporBarrier: 'vaporBarrier', insulation: 'insulation', osb: 'wallOsb',
  breatherMembrane: 'breatherMembrane', battens: 'wallBattens', exteriorCladding: 'exteriorCladding',
};

/**
 * Fali réteglapok (a bekapcsolt rétegekből, a `wallLayerStrips` sávjaiban). Sarokszabály: a teljes (futó) fal
 * külső rétegei a sarkon a külső rétegek teljes vastagságával túlnyúlnak, a rövid falé a futó fal vázának külső
 * síkjáig ér; belül a futó fal rétegei a rövid falak belső síkjai között futnak, a rövid falé ezek közé ér.
 * A szigetelés a váz mélységében, a váz hosszán. Így egy sarokban minden térrészt pontosan egy fal lapja fed.
 */
function wallLayerSolids(plan: Plan, scene: Scene): Solid[] {
  const sw = plan.walls.studSection.w;
  const strips = wallLayerStrips(plan, true);
  const qs = [...strips.values()];
  const tOut = -Math.min(0, ...qs.map(q => q[0]));
  const tIn = Math.max(sw, ...qs.map(q => q[1])) - sw;
  const out: Solid[] = [];
  for (const wall of wallGeometry(plan)) {
    const len = wall.length;
    if (len <= 0) continue;
    const group = `wall.${wall.side}`;
    const f = wallFrameOf(plan, wall.side);
    const ops: Rect[] = scene.elements.filter(e => e.group === group && e.kind === 'opening').map(e => e.geom);
    const span = (q: [number, number]): [number, number] => {
      if (q[1] <= GEOM_EPS) return wall.full ? [-tOut, len + tOut] : [-sw, len + sw];
      if (q[0] >= sw - GEOM_EPS) return wall.full ? [sw, len - sw] : [tIn, len - tIn];
      return [0, len];
    };
    const push = (layer: Layer3dId, label: string, material: string, q: [number, number],
      pieces: { outline: P2[]; holes: P2[][] }[], elementId?: string): void => {
      for (const pc of pieces) {
        out.push({
          layer, ...(elementId ? { elementId } : {}), label, material,
          origin: add(f.origin, f.nAxis, q[0]), uAxis: [...f.uAxis], vAxis: [...f.vAxis], nAxis: [...f.nAxis],
          outline: pc.outline, holes: pc.holes, depth: q[1] - q[0],
        });
      }
    };
    for (const l of plan.walls.layers) {
      const q = strips.get(l.kind);
      if (!l.enabled || !q) continue;
      const layer = LAYER_OF[l.kind];
      const [u0, u1] = span(q);
      const outline = layerOutline(wall, u0, u1);
      if (l.kind === 'osb') {
        // az OSB táblák egyenként; a fal végén álló tábla a sarokszabály szerint a rétegsáv végéig nyúlik
        for (const e of scene.elements.filter(x => x.group === group && x.kind === 'osbSheet')) {
          const { u, v, w, h } = e.geom;
          const a = u <= GEOM_EPS ? u0 : u;
          const b = u + w >= len - GEOM_EPS ? u1 : u + w;
          push(layer, e.label, 'osb', q, cutOpenings(clipConvex(rect(a, v, b, v + h), outline), ops), e.id);
        }
      } else if (l.kind === 'battens') {
        // függőleges lécek BATTEN_SPACING_WALL osztással, a nyílásoknál megszakítva (csak megjelenítés)
        const bw = BATTEN_SECTION.w;
        const xs: number[] = [];
        for (let x = u0; x <= u1 - bw + GEOM_EPS; x += BATTEN_SPACING_WALL) xs.push(x);
        if (xs.length === 0 || xs[xs.length - 1] < u1 - bw - GEOM_EPS) xs.push(u1 - bw);
        const top = Math.max(...outline.map(p => p[1])) + 1;
        for (const x of xs) push(layer, LAYER3D_NAMES[layer], 'timber', q, cutOpenings(clipConvex(rect(x, 0, x + bw, top), outline), ops));
      } else {
        const material = l.kind === 'vaporBarrier' || l.kind === 'breatherMembrane' ? 'foil'
          : l.kind === 'insulation' ? 'insulation' : l.material;
        push(layer, LAYER3D_NAMES[layer], material, q, cutOpenings(outline, ops));
      }
    }
  }
  return out;
}

// ---- tető és kiegészítők ----

const GUTTER_R = 62.5;    // félköríves ereszcsatorna sugara (125 mm-es csatorna), csak megjelenítés
const GUTTER_WALL = 3;
const GUTTER_SEGMENTS = 12;

/** Egy tetősík az eresz helyével és a gerinc / a túlsó vég felé mutató iránnyal a gerincre merőleges p tengelyen. */
interface RoofPlane { group: string; pEave: number; dir: 1 | -1; pEnd: number }

/** A sokszög (u, v)-ben az óramutatóval ellentétes körüljárással. */
const ccw = (pts: P2[]): P2[] => (area(pts) < 0 ? [...pts].reverse() : pts);

/**
 * Tetőtestek. Minden test egy függőleges (p, z) profil, a gerinc irányában (r) kihúzva:
 * `uAxis` = a gerincre merőleges vízszintes világirány (+p), `vAxis` = +Z, `nAxis` = a gerinc iránya (+r).
 * p, r a `roofMap` koordinátái (p = 0 az x = 0 / y = 0 oldal külső síkja, r = 0 a gerinc menti épületkezdet);
 * a tetősík (u, v) → p = `roofMap` P(v), r = −gableOverhang + u.
 * A szarufák alsó síkja a metszetnézet zU(p)-je: az eresz fal külső síkján a koszorú teteje, onnan a hajlásszöggel
 * emelkedik (madárszáj nélkül). A rétegek a szarufák felső síkjától a tetősík normálisa mentén, függőleges végvágással
 * az eresznél és a gerincnél, mint a metszetnézetben. Lapos tető (`flat`): egy sík a kis hajlásszöggel (a falak
 * teteje is ezt követi), ellenléc nélkül.
 */
function roofSolids(plan: Plan, scene: Scene): Solid[] {
  const g = roofGeometry(plan);
  const { eaveOverhang: oe, gableOverhang: og, rafterSection, covering, layers } = plan.roof;
  const gable = g.shape === 'gable';
  const flat = plan.roof.shape === 'flat';
  const ridgeY = plan.roof.ridgeDirection === 'y';
  const Pv: Vec3 = ridgeY ? [...X] : [...Y];
  const Rv: Vec3 = ridgeY ? [...Y] : [...X];
  const sin = Math.sin(g.pitchRad);
  const cos = Math.cos(g.pitchRad);
  const tan = Math.tan(g.pitchRad);
  const W = g.W;
  const Lr = g.roofLengthAlongRidge;
  const zBase = wallBaseZ(plan) + plan.building.wallHeight; // a koszorú teteje az ereszfalon
  const zU = (p: number): number => zBase + tan * (gable ? Math.min(p, W - p) : W - p);
  const th = rafterSection.w / cos; // a szarufa függőleges metszetmagassága
  const t = rafterSection.t;
  const planes: RoofPlane[] = gable
    ? [{ group: 'roof.L', pEave: -oe, dir: 1, pEnd: W / 2 }, { group: 'roof.R', pEave: W + oe, dir: -1, pEnd: W / 2 }]
    : [{ group: 'roof.M', pEave: W + oe, dir: -1, pEnd: -oe }];
  const planeOf = (group: string): RoofPlane => planes.find(pl => pl.group === group) ?? planes[0];
  const pAt = (pl: RoofPlane, v: number): number => pl.pEave + pl.dir * v * cos;
  /** Tetősík (v: a lejtő mentén az eresztől, n: a szarufa alsó síkjától a normális mentén) → (p, z). */
  const inPlane = (pl: RoofPlane, v: number, n: number): P2 =>
    [pl.pEave + pl.dir * (v * cos - n * sin), zU(pl.pEave) + v * sin + n * cos];
  /** Függőleges végű sáv p ∈ [pa, pb] között, a szarufa alsó síkja fölött n0…n1 (merőleges) távolságban. */
  const strip = (pa: number, pb: number, n0: number, n1: number): P2[] =>
    [[pa, zU(pa) + n0 / cos], [pb, zU(pb) + n0 / cos], [pb, zU(pb) + n1 / cos], [pa, zU(pa) + n1 / cos]];
  const out: Solid[] = [];
  const push = (layer: Layer3dId, label: string, material: string, pts: P2[], r0: number, depth: number, elementId?: string): void => {
    out.push({
      layer, ...(elementId ? { elementId } : {}), label, material,
      origin: add([0, 0, 0], Rv, r0), uAxis: [...Pv], vAxis: [...Z], nAxis: [...Rv],
      outline: ccw(pts), holes: [], depth,
    });
  };
  const els = scene.elements.filter(e => e.group.startsWith('roof.'));
  const hasRidge = els.some(e => e.kind === 'ridge');
  /** A gerincpalló két oldala: a szarufák eddig érnek. */
  const toRidge = (pl: RoofPlane, p: number): number =>
    !hasRidge ? p : pl.dir > 0 ? Math.min(p, W / 2 - t / 2) : Math.max(p, W / 2 + t / 2);

  // tetőváz: szarufák (a gerincpallóig), gerincpalló, fogópárok
  for (const e of els) {
    const r0 = -og + e.geom.u;
    if (e.kind === 'rafter') {
      const pl = planeOf(e.group);
      const pa = toRidge(pl, pAt(pl, e.geom.v));
      const pb = toRidge(pl, pAt(pl, e.geom.v + e.geom.h));
      push('roofFrame', e.label, 'timber', strip(pa, pb, 0, rafterSection.w), r0, e.geom.w, e.id);
    } else if (e.kind === 'ridge') {
      // gerincpalló: a teteje a két sík szarufáinak felső síkja szerint ferdén levágva, a csúcs a szarufák felső élén
      const c = W / 2;
      const h = t / 2;
      const apex = zBase + g.rise + th;
      const hgt = e.section?.w ?? rafterSection.w;
      push('roofFrame', e.label, 'timber',
        [[c - h, apex - hgt], [c + h, apex - hgt], [c + h, apex - h * tan], [c, apex], [c - h, apex - h * tan]], r0, e.geom.w, e.id);
    } else if (e.kind === 'collar') {
      // fogópár: vízszintes, a falnézettel egyezően a koszorú tetején; a vége a szarufa alsó síkjáig vágva
      const piece = clipHalf(rect(e.geom.v, zBase, e.geom.v + e.geom.h, zBase + rafterSection.w), pt => zU(pt[0]) - pt[1]);
      if (piece.length >= 3) push('roofFrame', e.label, 'timber', piece, r0, e.geom.w, e.id);
    }
  }

  // tetőrétegek a szarufák felső síkjától, a rétegrend sorrendjében
  const forced = covering === 'shingle' || covering === 'epdm';
  const counters = flat ? [] : els.filter(e => e.kind === 'counterBatten');
  const battens = els.filter(e => e.kind === 'roofBatten');
  let n = rafterSection.w;
  const sheet = (layer: Layer3dId, material: string, tk: number): void => {
    for (const pl of planes) push(layer, LAYER3D_NAMES[layer], material, strip(pl.pEave, pl.pEnd, n, n + tk), -og, Lr);
    n += tk;
  };
  for (const l of layers) {
    if (l.kind === 'decking' && (l.enabled || forced)) sheet('decking', l.material, DECKING_T);
    else if (l.kind === 'underlay' && l.enabled) sheet('underlay', 'foil', FOIL_T);
    else if (l.kind === 'counterBatten' && counters.length > 0) {
      const tk = COUNTER_BATTEN_SECTION.t;
      for (const e of counters) {
        const pl = planeOf(e.group);
        push('counterBatten', e.label, 'timber', strip(pAt(pl, e.geom.v), pAt(pl, e.geom.v + e.geom.h), n, n + tk),
          -og + e.geom.u, e.geom.w, e.id);
      }
      n += tk;
    } else if (l.kind === 'batten' && battens.length > 0) {
      const tk = ROOF_BATTEN_SECTION.t;
      for (const e of battens) {
        const pl = planeOf(e.group);
        const { v, h } = e.geom;
        push('roofBatten', e.label, 'timber',
          [inPlane(pl, v, n), inPlane(pl, v + h, n), inPlane(pl, v + h, n + tk), inPlane(pl, v, n + tk)], -og + e.geom.u, e.geom.w, e.id);
      }
      n += tk;
    }
  }
  sheet('covering', covering, COVERING_T[covering]);
  const nTop = n;

  // kiegészítők: homlokdeszka a szarufavégek előtt, oromdeszka a tetősík szélén kívül, ereszcsatorna
  for (const e of scene.elements.filter(x => x.kind === 'fascia' || x.kind === 'barge')) {
    const pl = planeOf(e.group);
    const sec = e.section ?? FASCIA_SECTION;
    if (e.kind === 'fascia') {
      const atEave = e.geom.v + e.geom.h / 2 < g.rafterLength / 2;
      const pe = atEave ? pl.pEave : pl.pEnd;
      const pf = pe + (atEave ? -pl.dir : pl.dir) * sec.t; // kifelé
      const top = zU(pe) + th;
      push('accessories', e.label, 'timber', rect(Math.min(pe, pf), top - sec.w, Math.max(pe, pf), top), -og + e.geom.u, e.geom.w, e.id);
    } else {
      const outward = e.geom.u + e.geom.w / 2 < Lr / 2 ? -sec.t : sec.t;
      push('accessories', e.label, 'timber', strip(pAt(pl, e.geom.v), pAt(pl, e.geom.v + e.geom.h), nTop - sec.w, nTop),
        -og + e.geom.u + outward, e.geom.w, e.id);
    }
  }
  if (plan.accessories.gutter) {
    const fasciaT = plan.accessories.fascia ? FASCIA_SECTION.t : 0;
    const eaves = gable ? planes : planes.filter(pl => pl.pEave > W);
    for (const pl of eaves) {
      const pc = pl.pEave - pl.dir * (fasciaT + GUTTER_R);
      const rim = zU(pl.pEave) + th;
      const arc = (r: number): P2[] => Array.from({ length: GUTTER_SEGMENTS + 1 }, (_, i): P2 => {
        const a = Math.PI + (Math.PI * i) / GUTTER_SEGMENTS;
        return [pc + r * Math.cos(a), rim + r * Math.sin(a)];
      });
      push('accessories', 'Ereszcsatorna', 'metal', [...arc(GUTTER_R), ...arc(GUTTER_R - GUTTER_WALL).reverse()], -og, Lr);
    }
  }
  return out;
}

function foundationSolids(plan: Plan): Solid[] {
  const { width: W, length: L } = plan.building;
  const { slabOverhang: ov, slabThickness: st } = plan.foundation;
  return [{
    layer: 'foundation', label: LAYER3D_NAMES.foundation, material: 'concrete',
    origin: [0, 0, -st], uAxis: [...X], vAxis: [...Y], nAxis: [...Z],
    outline: rect(-ov, -ov, W + ov, L + ov), holes: [], depth: st,
  }];
}

function floorSolids(plan: Plan, scene: Scene): Solid[] {
  if (!plan.floor.enabled) return [];
  const jw = plan.floor.joistSection.w;
  const out: Solid[] = scene.elements.filter(e => e.group === 'floor' && e.kind === 'joist').map((e): Solid => ({
    layer: 'floor', elementId: e.id, label: e.label, material: 'timber',
    origin: [0, 0, 0], uAxis: [...X], vAxis: [...Y], nAxis: [...Z],
    outline: corners(e), holes: [], depth: e.section?.w ?? jw,
  }));
  // padló-OSB: egy lap a párnafák tetején, a metszetnézet szerint az épület teljes alapterületén (a falak is ezen állnak)
  out.push({
    layer: 'floor', label: 'Padló OSB', material: 'osb',
    origin: [0, 0, jw], uAxis: [...X], vAxis: [...Y], nAxis: [...Z],
    outline: rect(0, 0, plan.building.width, plan.building.length), holes: [], depth: plan.floor.osbThickness,
  });
  return out;
}

/** A terv és a scene → 3D testek világkoordinátában (mm, Z = 0 a betonlemez teteje). Tiszta függvény. */
export function buildModel3d(plan: Plan, scene: Scene): Model3d {
  const solids = [...foundationSolids(plan), ...floorSolids(plan, scene), ...wallSolids(plan, scene), ...wallLayerSolids(plan, scene),
    ...roofSolids(plan, scene)];
  const present = new Set(solids.map(s => s.layer));
  const layers = LAYER_ORDER.filter(l => present.has(l));
  const min: Vec3 = [0, 0, 0];
  const max: Vec3 = [0, 0, 0];
  solids.forEach((s, i) => {
    const b = solidBounds(s);
    for (let k = 0; k < 3; k++) {
      min[k] = i === 0 ? b.min[k] : Math.min(min[k], b.min[k]);
      max[k] = i === 0 ? b.max[k] : Math.max(max[k], b.max[k]);
    }
  });
  return { solids, layers, bounds: { min, max } };
}
