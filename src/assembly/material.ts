import type { AssemblyFastener, AssemblyLine, AssemblyStep } from './steps';
import { FASTENER_LINES } from '../app/lineElements';
import { formatQty } from '../ui/format';

export const TIMBER_NOTE = 'A faanyagot egyben rendeld meg (lásd Anyaglista).';
/** Csavarként összegzett rögzítők (a viharkapocs külön). */
const SCREWS = new Set<AssemblyFastener['kind']>(['anchor', 'frameScrew', 'osbScrew']);

/** Rövid összesítő a lépéslistába: a legnagyobb darabcsoport és a rögzítők, pl. „7 oszlop, 74 csavar”. */
export function stepSummary(step: AssemblyStep): string {
  const parts: string[] = [];
  const byLabel = new Map<string, number>();
  for (const p of step.pieces) byLabel.set(p.label, (byLabel.get(p.label) ?? 0) + p.count);
  let best: [string, number] | null = null;
  for (const e of byLabel) if (!best || e[1] > best[1]) best = e;
  if (best) parts.push(`${formatQty(best[1])} ${best[0]}`);
  const screws = step.fasteners.filter(f => SCREWS.has(f.kind)).reduce((a, f) => a + f.count, 0);
  const ties = step.fasteners.filter(f => !SCREWS.has(f.kind)).reduce((a, f) => a + f.count, 0);
  if (screws > 0) parts.push(`${formatQty(screws)} csavar`);
  if (ties > 0) parts.push(`${formatQty(ties)} viharkapocs`);
  if (parts.length === 0 && step.id === 'openings') parts.push(`${step.elementIds.length} nyílászáró`);
  else if (parts.length === 0 && step.lines.length > 0) parts.push(`${step.lines.length} tétel`);
  else if (parts.length === 0) parts.push(`${step.elementIds.length} elem`);
  return parts.join(', ');
}

/**
 * A lépés anyaga (felület és PDF). A rajzolt rögzítők beszerzési sora (pl. `fix.frameScrews`, dobozban) nem külön
 * tétel, ha a lépésben ugyanannak a fajtának a darabszáma is szerepel: a rögzítő sorában
 * „rendelés, az egész házra: …” megjegyzés lesz belőle. Rajzolt pont nélkül rendes anyagsor marad.
 */
export function stepMaterial(step: AssemblyStep): { lines: AssemblyLine[]; fasteners: (AssemblyFastener & { order?: string })[] } {
  const orders = new Map<string, string>();
  const lines = step.lines.filter(l => {
    const kind = FASTENER_LINES[l.lineId];
    if (!kind || !step.fasteners.some(f => f.kind === kind)) return true;
    orders.set(kind, `rendelés, az egész házra: ${formatQty(l.quantity)} ${l.unit}`);
    return false;
  });
  return { lines, fasteners: step.fasteners.map(f => ({ ...f, order: orders.get(f.kind) })) };
}
