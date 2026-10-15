import type { Mm } from '../model/types';

export interface Camera { x: Mm; y: Mm; w: Mm; h: Mm } // a viewBox
export interface Bounds { minX: Mm; minY: Mm; maxX: Mm; maxY: Mm }

const MIN_SCALE = 0.2;
const MAX_SCALE = 20;

export function fitCamera(b: Bounds, vpW: number, vpH: number, margin = 0.06): Camera {
  const bw = Math.max(b.maxX - b.minX, 1);
  const bh = Math.max(b.maxY - b.minY, 1);
  const k = 1 + 2 * margin;
  const vw = Math.max(vpW, 1);
  const vh = Math.max(vpH, 1);
  const scale = Math.max((bw * k) / vw, (bh * k) / vh); // mm / px
  const w = vw * scale;
  const h = vh * scale;
  return { x: (b.minX + b.maxX) / 2 - w / 2, y: (b.minY + b.maxY) / 2 - h / 2, w, h };
}

export function screenToWorld(c: Camera, px: number, py: number, vpW: number, vpH: number): [Mm, Mm] {
  return [c.x + (px / vpW) * c.w, c.y + (py / vpH) * c.h];
}

export function zoomAt(c: Camera, factor: number, px: number, py: number, vpW: number, vpH: number, fit: Camera): Camera {
  const wanted = c.w / factor;
  const w = Math.min(Math.max(wanted, fit.w / MAX_SCALE), fit.w / MIN_SCALE);
  const k = w / c.w;
  const h = c.h * k;
  const [wx, wy] = screenToWorld(c, px, py, vpW, vpH);
  return { x: wx - (px / vpW) * w, y: wy - (py / vpH) * h, w, h };
}

export function panBy(c: Camera, dxPx: number, dyPx: number, vpW: number, vpH: number): Camera {
  return { x: c.x - (dxPx / vpW) * c.w, y: c.y - (dyPx / vpH) * c.h, w: c.w, h: c.h };
}

/** A kamera középpontját és szélességét megtartja, a magasságot a viewport képarányához igazítja. */
export function reaspect(c: Camera, vpW: number, vpH: number): Camera {
  const h = (c.w * Math.max(vpH, 1)) / Math.max(vpW, 1);
  return { x: c.x, y: c.y + c.h / 2 - h / 2, w: c.w, h };
}
