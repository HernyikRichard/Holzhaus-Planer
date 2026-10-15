import type { Scene } from '../scene/types';
import { cutSticks, cutVariants } from '../app/lineElements';
import { formatQty, sectionLabelWithUnit } from '../ui/format';

/** A PDF-export tiszta (DOM- és jsPDF-mentes) segédfüggvényei. */

export const DEFAULT_PALETTE: Record<string, string> = {
  '--line': '#2b2b2b',
  '--fill-wood': '#d9b27c',
  '--fill-concrete': '#c9c9c4',
  '--fill-insulation': '#f2e06b',
  '--opening': '#bfe3f5',
  '--invalid': '#e57373',
};

/**
 * A rajz SVG-stringjében a var(--x) hivatkozásokat konkrét színre cseréli
 * (a megadott értékek, majd az alapértelmezett paletta, majd a CSS-tartalék, végül fekete),
 * a "sans-serif" betűcsaládot pedig a PDF-be töltött betűre.
 */
export function substituteCssVars(svg: string, values: Record<string, string>, fontFamily?: string): string {
  const out = svg.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*?))?\s*\)/g, (_m, name: string, fallback?: string) => {
    const v = values[name]?.trim() || DEFAULT_PALETTE[name] || fallback?.trim();
    return v || '#000000';
  });
  return fontFamily ? out.replace(/font-family="(?:DejaVu Sans, )?sans-serif"/g, `font-family="${fontFamily}"`) : out;
}

/** (w×h) méretű rajz arányos illesztése a (boxW×boxH) dobozba, középre igazítva. */
export function fitRect(w: number, h: number, boxW: number, boxH: number, boxX: number, boxY: number):
  { x: number; y: number; width: number; height: number } {
  const s = Math.min(boxW / w, boxH / h);
  const width = w * s;
  const height = h * s;
  return { x: boxX + (boxW - width) / 2, y: boxY + (boxH - height) / 2, width, height };
}

export interface TableItem { kind: 'subtitle' | 'row'; height: number }

/**
 * Táblázatelemek oldalakra osztása. Minden oldalon `headerHeight` hely a (ismétlődő) fejlécé.
 * Az alcím mindig együtt marad a következő sorral; a túl magas sor külön oldalra kerül.
 * Visszatérés: oldalanként az elemek indexei.
 */
export function paginateRows(items: TableItem[], pageHeight: number, headerHeight: number): number[][] {
  const avail = pageHeight - headerHeight;
  const pages: number[][] = [];
  let cur: number[] = [];
  let used = 0;
  items.forEach((it, i) => {
    const need = it.kind === 'subtitle' && i + 1 < items.length ? it.height + items[i + 1].height : it.height;
    if (cur.length > 0 && used + need > avail) {
      pages.push(cur);
      cur = [];
      used = 0;
    }
    cur.push(i);
    used += it.height;
  });
  if (cur.length > 0) pages.push(cur);
  return pages;
}

export const CUT_PLAN_HEADER = ['Keresztmetszet', 'Szál', 'Darabok', 'Maradék'];

/** A vágási terv táblázatsorai: az azonos látható szövegű szálak egy sorban ("5 m × 11"), a darabok hossza cm-ben. */
export function cutPlanRows(scene: Scene): string[][] {
  const merged = new Map<string, { cells: [string, string, string]; len: string; count: number }>();
  const groups = new Map<string, ReturnType<typeof cutSticks>>();
  for (const s of cutSticks(scene)) {
    const k = `${s.category}|${s.section.t}x${s.section.w}`;
    const g = groups.get(k);
    if (g) g.push(s); else groups.set(k, [s]);
  }
  for (const g of groups.values()) {
    for (const v of cutVariants(g)) {
      const first = v[0];
      const cells: [string, string, string] = [
        `${first.category} – ${sectionLabelWithUnit(first.section.t, first.section.w)}`,
        first.pieces.map(p => String(Math.round(p.length / 10))).join(' + ') + ' cm',
        `${Math.max(0, Math.round(first.rest / 10))} cm`,
      ];
      const len = `${formatQty(first.stockLength / 1000, 2)} m`;
      const key = [cells[0], len, cells[1], cells[2]].join('|');
      const m = merged.get(key);
      if (m) m.count += v.length; else merged.set(key, { cells, len, count: v.length });
    }
  }
  return [...merged.values()].map(m => [m.cells[0], `${m.len} × ${m.count}`, m.cells[1], m.cells[2]]);
}
