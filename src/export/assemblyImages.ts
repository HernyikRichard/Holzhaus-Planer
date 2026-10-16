import type { Model3d, Solid } from '../three-d/model';
import type { AssemblyStep } from '../assembly/steps';
import { filterModel } from '../assembly/solids';
// csak típus: a kirajzoló (és vele a Three.js) dinamikusan töltődik, külön chunkba
import type { Renderer3d } from '../three-d/renderer';

/** A kirajzoló betöltése; objektumban, hogy a tesztek a betöltési hibát is ki tudják próbálni. */
export const assemblyRendererLoader = { load: () => import('../three-d/renderer') };

export interface ImageSize { w: number; h: number }

const PNG_PREFIX = 'data:image/png';

/** Egy esemény-kör szünet a lépések között, hogy a felület (a „PDF készül…” gomb) ne fagyjon le. */
const yieldToUi = (): Promise<void> => new Promise(r => setTimeout(r, 0));

/**
 * Lépésenként egy perspektív kép (PNG data URL) az addig felépült házról, a lépés elemei kiemelve.
 * Egy láthatatlan (DOM-ba nem csatolt) vásznon készül; WebGL / import hiányában vagy bármely hibánál
 * az adott kép (indításkor mind) `null`. Sosem dob.
 */
export async function renderAssemblyImages(
  model: Model3d, steps: AssemblyStep[], stepOf: (s: Solid) => number, size: ImageSize,
): Promise<(string | null)[]> {
  const none = steps.map((): string | null => null);
  if (steps.length === 0) return none;
  let r: Renderer3d;
  try {
    const mod = await assemblyRendererLoader.load();
    const canvas = document.createElement('canvas');
    r = mod.createRenderer(canvas, { preserveDrawingBuffer: true });
  } catch (err) {
    if (!(err instanceof Error && err.message === 'webgl')) console.warn('Szerelési útmutató: a 3D képek kimaradnak.', err);
    return none;
  }
  const out = [...none];
  try {
    // a vászon pixelmérete pontosan `size` legyen (a kirajzoló a devicePixelRatio-val szoroz)
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    r.resize(size.w / dpr, size.h / dpr);
    for (let i = 0; i < steps.length; i++) {
      try {
        r.setModel(filterModel(model, i, stepOf));
        r.setHighlight(steps[i].elementIds);
        r.setView('persp');
        const url = r.snapshot();
        out[i] = url.startsWith(PNG_PREFIX) ? url : null;
      } catch (err) {
        console.warn(`Szerelési útmutató: a(z) ${i + 1}. lépés képe kimarad.`, err);
      }
      if (i + 1 < steps.length) await yieldToUi();
    }
  } catch (err) {
    console.warn('Szerelési útmutató: a 3D képek kimaradnak.', err);
  } finally {
    try { r.dispose(); } catch { /* elengedési hiba: a képek már megvannak */ }
  }
  return out;
}
