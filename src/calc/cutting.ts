import type { Mm } from '../model/types';
import type { Category, MaterialLine, TimberPiece } from './types';
import { KERF } from '../catalog';
import type { CutRef } from '../scene/types';
import { ceilTo, sectionKey, sectionLabel } from './util';
import { missingSupplyWarning, type Supply } from '../pricing/supplyTypes';

export interface CutBin { stock: Mm; pieces: Mm[] }

interface Part { len: Mm; src: number; spliced: boolean }
interface PartBin { stock: Mm; parts: Part[] }

/**
 * A csoport szálhosszai: kínálattal a kínálat hosszai a beállítás hosszaival metszve (üres metszetnél a kínálaté);
 * kínálat nélkül, vagy ha a kínálatban nincs ilyen szelvény, a beállítás hosszai (supplied: false).
 */
function stockFor(category: Category, section: TimberPiece['section'], stockLengths: Mm[], supply?: Supply): { lengths: Mm[]; supplied: boolean } {
  const s = supply?.stockLengths(category, section);
  if (!s) return { lengths: stockLengths, supplied: false };
  const both = s.filter(x => stockLengths.includes(x));
  return { lengths: both.length ? both : s, supplied: true };
}

const used = (parts: Part[], kerf: Mm): Mm =>
  parts.reduce((a, b) => a + b.len, 0) + kerf * Math.max(0, parts.length - 1);

function packParts(lengths: Mm[], stockLengths: Mm[], kerf: Mm): { bins: PartBin[]; warnings: string[] } {
  const stocks = [...stockLengths].sort((a, b) => a - b);
  const max = stocks[stocks.length - 1];
  const warnings: string[] = [];
  const parts: Part[] = [];
  lengths.forEach((len, src) => {
    if (!(len > 0)) return;
    if (len > max) {
      const n = Math.ceil(len / max);
      warnings.push(`${Math.round(len)} mm-es darab toldással (${n} részből)`);
      for (let i = 0; i < n - 1; i++) parts.push({ len: max, src, spliced: true });
      parts.push({ len: len - (n - 1) * max, src, spliced: true });
    } else parts.push({ len, src, spliced: false });
  });
  parts.sort((a, b) => b.len - a.len);
  const open: Part[][] = [];
  for (const p of parts) {
    const bin = open.find(b => used([...b, p], kerf) <= max);
    if (bin) bin.push(p); else open.push([p]);
  }
  const bins = open.map(ps => {
    const need = used(ps, kerf);
    return { stock: stocks.find(s => s >= need) ?? max, parts: ps };
  });
  return { bins, warnings: [...new Set(warnings)] };
}

export function packPieces(lengths: Mm[], stockLengths: Mm[], kerf: Mm): { bins: CutBin[]; warnings: string[] } {
  const r = packParts(lengths, stockLengths, kerf);
  return { bins: r.bins.map(b => ({ stock: b.stock, pieces: b.parts.map(p => p.len) })), warnings: r.warnings };
}

/** Darab → vágási hely, ugyanazzal a csoportosítással és csomagolással, mint a `cutTimber`. */
export function assignCuts(pieces: TimberPiece[], stockLengths: Mm[], supply?: Supply): Record<string, CutRef> {
  const groups = new Map<string, TimberPiece[]>();
  for (const p of pieces) {
    const k = `${p.category}|${sectionKey(p.section)}`;
    const g = groups.get(k);
    if (g) g.push(p); else groups.set(k, [p]);
  }
  const out: Record<string, CutRef> = {};
  for (const group of groups.values()) {
    const { category, section } = group[0];
    const { bins } = packParts(group.map(p => p.length), stockFor(category, section, stockLengths, supply).lengths, KERF);
    const counter = new Map<Mm, number>();
    for (const b of bins) {
      const stockIndex = (counter.get(b.stock) ?? 0) + 1;
      counter.set(b.stock, stockIndex);
      const ids = b.parts.map(part => group[part.src].id);
      let offset = 0;
      b.parts.forEach((part, i) => {
        const id = ids[i];
        if (id !== undefined && out[id] === undefined) {
          out[id] = {
            stockLength: b.stock, stockIndex, offset,
            siblings: [...new Set(ids.filter((x): x is string => x !== undefined && x !== id))],
          };
        }
        offset += part.len + KERF;
      });
    }
  }
  return out;
}

const fmt = (x: number, d: number) => x.toFixed(d).replace('.', ',');

export function cutTimber(pieces: TimberPiece[], stockLengths: Mm[], waste: number, supply?: Supply): MaterialLine[] {
  const groups = new Map<string, TimberPiece[]>();
  for (const p of pieces) {
    const k = `${p.category}|${sectionKey(p.section)}`;
    const g = groups.get(k);
    if (g) g.push(p); else groups.set(k, [p]);
  }
  const lines: MaterialLine[] = [];
  for (const group of groups.values()) {
    const { category, section } = group[0];
    const { lengths, supplied } = stockFor(category, section, stockLengths, supply);
    const { bins, warnings } = packParts(group.map(p => p.length), lengths, KERF);
    if (supply && !supplied) warnings.push(missingSupplyWarning(sectionLabel(section)));
    const byStock = new Map<Mm, PartBin[]>();
    for (const b of bins) byStock.set(b.stock, [...(byStock.get(b.stock) ?? []), b]);
    const stockKeys = [...byStock.keys()].sort((a, b) => a - b);
    const longest = stockKeys[stockKeys.length - 1];
    const extraSticks = ceilTo(bins.length * (1 + waste), 1) - bins.length;
    for (const stock of stockKeys) {
      const sb = byStock.get(stock)!;
      const extra = stock === longest ? extraSticks : 0;
      const quantity = sb.length + extra;
      const counts = new Map<string, number>();
      for (const b of sb) for (const part of b.parts) {
        const label = group[part.src].label;
        const key = part.spliced ? `${label} (toldott rész, ${Math.round(part.len)} mm)` : `${label} (${Math.round(part.len)} mm)`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const list = [...counts].map(([k, n]) => `${k} × ${n}`).join(', ');
      const fm = quantity * stock / 1000;
      const m3 = fm * section.t * section.w / 1e6;
      const kind = section.t <= 30 ? (section.w >= 100 ? 'deszka' : 'léc') : 'palló';
      const stockM = stock % 1000 === 0 ? `${stock / 1000}` : fmt(stock / 1000, 1).replace(/,0$/, '');
      lines.push({
        id: `timber.${category}.${sectionKey(section)}.${stock}`,
        category: category as Category,
        name: `Fenyő ${kind} ${sectionLabel(section)}, ${stockM} m`,
        quantity, unit: 'szál',
        secondary: `${fmt(fm, 1)} fm, ${fmt(m3, 3)} m³`,
        explanation: `${sb.length} szál ${stockM} m-es alapanyagból${extra > 0 ? ` + ${extra} szál ráhagyás (a ${bins.length} szálas csoport ${Math.round(waste * 100)}%-a, felfelé kerekítve)` : ''}. Darabok: ${list}.`,
        ...(warnings.length ? { warnings: [...warnings] } : {}),
      });
    }
  }
  return lines;
}
