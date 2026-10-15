import type { Mm, Plan, RoofShape, WallSide } from '../model/types';

export interface WallGeom {
  side: WallSide; length: Mm;          // vázhossz (rövidebb falpár: −2 × studSection.w)
  full: boolean;                       // teljes hosszúságú (hosszabb) falpár-e
  hStart: Mm; hEnd: Mm;                // falmagasság a fal elején/végén (talp alja → koszorú teteje)
  gableRise: Mm;                       // oromháromszög magassága (csak nyereg oromfalán, egyébként 0)
}

export interface RoofGeom {
  shape: RoofShape; W: Mm; L: Mm;      // W: a gerincre merőleges, L: a gerinccel párhuzamos épületméret
  pitchRad: number; planes: 1 | 2; rise: Mm;
  rafterLength: Mm; raftersPerPlane: number; roofLengthAlongRidge: Mm;
  planeArea: number;                   // m², egy tetősík
  eaveCount: 1 | 2; ridgeLength: Mm;
  rakeEdges: number;
  horizontalSpan: Mm;
}

const toRad = (deg: number): number => (deg * Math.PI) / 180;

export function wallGeometry(plan: Plan): WallGeom[] {
  const { width, length, wallHeight: H } = plan.building;
  const { shape, pitch, ridgeDirection } = plan.roof;
  const sw = plan.walls.studSection.w;
  const tan = Math.tan(toRad(pitch));
  const spanW = ridgeDirection === 'x' ? length : width; // a gerincre merőleges méret
  const nsFull = width >= length; // döntetlennél az N/S a teljes
  const sides: WallSide[] = ['N', 'E', 'S', 'W'];
  return sides.map((side): WallGeom => {
    const ns = side === 'N' || side === 'S';
    const full = ns === nsFull;
    const sideLen = ns ? width : length;
    const len = full ? sideLen : sideLen - 2 * sw;
    const eaveWall = ridgeDirection === 'x' ? ns : !ns;
    let hStart = H;
    let hEnd = H;
    let gableRise = 0;
    if (shape === 'gable') {
      if (!eaveWall) gableRise = (spanW / 2) * tan;
    } else {
      const rise = spanW * tan;
      const highSide: WallSide = ridgeDirection === 'x' ? 'N' : 'W';
      if (eaveWall) {
        if (side === highSide) { hStart = H + rise; hEnd = H + rise; }
      } else {
        hStart = H + rise; hEnd = H; // a magas oldaltól (x=0 vagy y=0) indul
      }
    }
    return { side, length: len, full, hStart, hEnd, gableRise };
  });
}

export function wallHeightAt(w: WallGeom, pos: Mm): Mm {
  if (w.length <= 0) return w.hStart;
  return w.hStart + ((w.hEnd - w.hStart) * pos) / w.length;
}

export function studLengthAt(plan: Plan, w: WallGeom, pos: Mm): Mm {
  const t = plan.walls.studSection.t;
  const plates = plan.walls.topPlate === 'double' ? 2 : 1;
  return wallHeightAt(w, pos) - t - plates * t;
}

export function studPositions(plan: Plan, wall: WallGeom, skipOpenings = true): Mm[] {
  const { t } = plan.walls.studSection;
  const spacing = plan.walls.studSpacing;
  const n = Math.ceil(wall.length / spacing - 1e-9);
  const set = new Set<number>();
  for (let i = 0; i <= n; i++) set.add(Math.min(i * spacing, wall.length - t));
  const ops = plan.openings.filter(o => o.wall === wall.side);
  return [...set]
    .sort((a, b) => a - b)
    .filter(p => !skipOpenings || !ops.some(o => o.offset <= p && p <= o.offset + o.width));
}

export function roofGeometry(plan: Plan): RoofGeom {
  const { width, length } = plan.building;
  const { shape, pitch, ridgeDirection, eaveOverhang, gableOverhang, rafterSpacing } = plan.roof;
  const W = ridgeDirection === 'x' ? length : width;
  const L = ridgeDirection === 'x' ? width : length;
  const pitchRad = toRad(pitch);
  const gable = shape === 'gable';
  const run = gable ? W / 2 : W;
  const rise = run * Math.tan(pitchRad);
  const rafterLength = (run + eaveOverhang * (gable ? 1 : 2)) / Math.cos(pitchRad); // egyhajlású: mindkét oldalon kinyúlik
  const roofLengthAlongRidge = L + 2 * gableOverhang;
  return {
    shape, W, L, pitchRad, planes: gable ? 2 : 1, rise,
    rafterLength,
    raftersPerPlane: Math.ceil(roofLengthAlongRidge / rafterSpacing) + 1,
    roofLengthAlongRidge,
    planeArea: (rafterLength * roofLengthAlongRidge) / 1e6,
    eaveCount: gable ? 2 : 1,
    ridgeLength: gable ? roofLengthAlongRidge : 0,
    rakeEdges: gable ? 4 : 2,
    horizontalSpan: run,
  };
}
