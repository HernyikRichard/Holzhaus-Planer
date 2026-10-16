import type { Mm, Plan, WallSide } from '../model/types';
import { studLengthAt, wallGeometry, type WallGeom } from '../calc/geometry';
import type { Element, ElementKind, Scene } from '../scene/types';
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
  return plan.floor.enabled ? plan.floor.joistSection.w + plan.floor.osbThickness : 0;
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

/** Az elem téglalapja a csoport (u, v) síkjában, az `angle` elforgatással ((u, v) körül). */
function corners(e: Element): [number, number][] {
  const { u, v, w, h } = e.geom;
  if (!e.geom.angle) return rect(u, v, u + w, v + h);
  const a = (e.geom.angle * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]): [number, number] => [u + x * c - y * s, v + x * s + y * c]);
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
  const solids = [...foundationSolids(plan), ...floorSolids(plan, scene), ...wallSolids(plan, scene)];
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
