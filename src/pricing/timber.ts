import type { Product } from '../prices/types';

interface Sec { t: number; w: number }

/** A helyettesítő szelvény oldalanként legfeljebb ennyivel (mm) térhet el a tervezettől. */
export const SECTION_TOLERANCE = 2;

const norm = (s: Sec): [number, number] => (s.t <= s.w ? [s.t, s.w] : [s.w, s.t]);

/**
 * A szelvény Káplár-faanyagai: a pontos szelvény (bármely állásban), ha van; különben a legközelebbi,
 * oldalanként legfeljebb 2 mm-rel eltérő szelvény (kisebb összeltérés, majd több kapható hossz). Nincs ilyen: null.
 */
export function timberFor(ps: Product[], s: Sec): { products: Product[]; section: Sec; exact: boolean } | null {
  const [a, b] = norm(s);
  const groups = new Map<string, { section: Sec; products: Product[]; diff: number }>();
  for (const p of ps) {
    if (p.kind !== 'timber' || !p.section || !p.length) continue;
    const [x, y] = norm(p.section);
    const dx = Math.abs(x - a);
    const dy = Math.abs(y - b);
    if (dx > SECTION_TOLERANCE || dy > SECTION_TOLERANCE) continue;
    const k = `${x}x${y}`;
    const g = groups.get(k);
    if (g) g.products.push(p);
    else groups.set(k, { section: { t: x, w: y }, products: [p], diff: dx + dy });
  }
  const lens = (g: { products: Product[] }): number => new Set(g.products.map(p => p.length)).size;
  const best = [...groups.values()].sort((g, h) =>
    g.diff - h.diff || lens(h) - lens(g) || g.section.t - h.section.t || g.section.w - h.section.w)[0];
  return best ? { products: best.products, section: best.section, exact: best.diff === 0 } : null;
}

/** Figyelmeztetés a helyettesítő szelvényről. */
export const substituteWarning = (planned: Sec, sub: Sec): string =>
  `Helyettesítő termék: ${sub.t}×${sub.w} (a tervezett ${planned.t}×${planned.w} helyett)`;
