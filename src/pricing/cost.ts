import type { CalcOutput } from '../calc';
import { CATEGORY_ORDER } from '../calc';
import type { Category } from '../calc/types';
import { DEFAULT_PRICING } from '../model/defaults';
import type { Plan, PlanPricing } from '../model/types';
import type { PriceList, Product } from '../prices/types';
import { matchLine } from './match';

export interface CostLine {
  lineId: string; category: Category; name: string;
  productId?: string; productName?: string; url?: string;
  qty: number; unit: string; unitPrice?: number; total?: number;
  source: 'kaplar' | 'override' | 'custom' | 'missing';
  /** A tétel mindig máshonnan beszerzendő (alap). */
  otherSource: boolean;
  /** A kézzel választott termék már nincs az árlistában, a szabály szerinti párosítás él. */
  choiceGone?: boolean;
  /** Miért nincs Káplár-termék (hiányzó párosításnál). */
  reason?: string;
}

export interface CostSummary {
  lines: CostLine[]; byCategory: Record<Category, number>;
  kaplarSubtotal: number; otherSubtotal: number; shipping: number; total: number;
  missingCount: number; priceDate: string;
}

/** A termék egysége a megjelenítésben (a szigetelés csomag, a faanyag szál; az árlistában mindkettő „db”). */
function displayUnit(p: Product): string {
  if (p.kind === 'insulation') return 'csomag';
  if (p.kind === 'timber') return 'szál';
  return p.unit;
}

/** Szállítási díj: személyes átvétel 0; megadott díj; különben az ingyenes határ alatt a díj. */
export function shippingCost(
  kaplarSubtotal: number,
  pricing: Pick<PlanPricing, 'pickup' | 'shippingFee'>,
  shipping: PriceList['shipping'],
): number {
  if (pricing.pickup) return 0;
  if (pricing.shippingFee !== undefined) return Math.round(pricing.shippingFee);
  return kaplarSubtotal >= shipping.freeAbove ? 0 : shipping.fee;
}

export function costOf(plan: Plan, output: CalcOutput, pl: PriceList): CostSummary {
  const pricing = plan.pricing ?? DEFAULT_PRICING;
  const byId = new Map(pl.products.map(p => [p.id, p]));
  const lines: CostLine[] = output.lines.map(line => {
    const m = matchLine(line, pl, plan);
    const product = 'productId' in m ? byId.get(m.productId) : undefined;
    const base = { lineId: line.id, category: line.category, name: line.name };
    const flags = { ...('choiceGone' in m && m.choiceGone ? { choiceGone: true } : {}) };
    const other = 'missing' in m && m.otherSource === true;
    const reason = 'missing' in m ? m.reason : undefined;

    const matched = product && 'productId' in m
      ? { productId: product.id, productName: product.name, url: product.url, qty: m.qtyInProductUnit, unit: displayUnit(product) }
      : { qty: line.quantity, unit: line.unit as string };
    const priced = (source: CostLine['source'], unitPrice: number): CostLine => ({
      ...base, ...matched, unitPrice, total: Math.round(matched.qty * unitPrice), source,
      otherSource: other, ...flags,
    });

    const override = pricing.overrides[line.id];
    if (override !== undefined) return priced('override', override);
    if (product) return priced('kaplar', product.price);
    const custom = pricing.custom[line.id];
    if (custom !== undefined) return priced('custom', custom);
    return { ...base, ...matched, source: 'missing', otherSource: other, ...flags, ...(reason ? { reason } : {}) };
  });

  const byCategory = Object.fromEntries(CATEGORY_ORDER.map(c => [c, 0])) as Record<Category, number>;
  let kaplarSubtotal = 0;
  let otherSubtotal = 0;
  let missingCount = 0;
  for (const l of lines) {
    if (l.total === undefined) { missingCount++; continue; }
    byCategory[l.category] += l.total;
    if (l.source === 'kaplar') kaplarSubtotal += l.total;
    else otherSubtotal += l.total;
  }
  const shipping = shippingCost(kaplarSubtotal, pricing, pl.shipping);
  return {
    lines, byCategory, kaplarSubtotal, otherSubtotal, shipping,
    total: kaplarSubtotal + otherSubtotal + shipping, missingCount, priceDate: pl.fetchedAt,
  };
}

export interface OrderRow {
  productId: string; name: string; url: string; qty: number; unit: string; unitPrice: number; total: number;
}

/** A Káplár-kosár: azonos termékek összevonva (csak a Káplár-áras sorok). */
export function orderList(summary: CostSummary): OrderRow[] {
  const rows = new Map<string, OrderRow>();
  for (const l of summary.lines) {
    if (l.source !== 'kaplar' || !l.productId) continue;
    const r = rows.get(l.productId);
    if (r) { r.qty += l.qty; r.total += l.total!; }
    else {
      rows.set(l.productId, {
        productId: l.productId, name: l.productName!, url: l.url!, qty: l.qty, unit: l.unit,
        unitPrice: l.unitPrice!, total: l.total!,
      });
    }
  }
  return [...rows.values()];
}
