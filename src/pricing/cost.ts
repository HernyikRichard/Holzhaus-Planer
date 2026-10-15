import type { CalcOutput } from '../calc';
import { CATEGORY_ORDER } from '../calc';
import type { Category } from '../calc/types';
import type { Plan, PlanPricing } from '../model/types';
import type { PriceList, Product } from '../prices/types';
import { matchLine, isInformational } from './match';

export interface CostLine {
  lineId: string; category: Category; name: string;
  productId?: string; productName?: string; url?: string;
  qty: number; unit: string; unitPrice?: number; total?: number;
  source: 'kaplar' | 'override' | 'custom' | 'missing';
  /** A tétel mindig máshonnan beszerzendő (alap). */
  otherSource: boolean;
  /** Tájékoztató sor: nincs ára, nem számít bele az összegekbe és a hiányzók közé. */
  informational: boolean;
  /** A kézzel választott termék már nincs az árlistában, a szabály szerinti párosítás él. */
  choiceGone?: boolean;
  /** Miért nincs Káplár-termék (hiányzó párosításnál). */
  reason?: string;
  /** A párosítás figyelmeztetése (pl. helyettesítő szelvény). */
  warning?: string;
  /** Az egységátváltás magyarázata (pl. tetődeszka m² → szál). */
  note?: string;
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
  if (pricing.pickup || kaplarSubtotal <= 0) return 0; // nincs Káplár-rendelés, nincs szállítás
  if (pricing.shippingFee !== undefined) return Math.round(pricing.shippingFee);
  return kaplarSubtotal >= shipping.freeAbove ? 0 : shipping.fee;
}

export function costOf(plan: Plan, output: CalcOutput, pl: PriceList): CostSummary {
  const pricing = plan.pricing;
  const byId = new Map(pl.products.map(p => [p.id, p]));
  const lines: CostLine[] = output.lines.map(line => {
    const m = matchLine(line, pl, plan);
    const product = 'productId' in m ? byId.get(m.productId) : undefined;
    const base = { lineId: line.id, category: line.category, name: line.name };
    if (isInformational(line.id)) {
      return { ...base, qty: line.quantity, unit: line.unit as string, source: 'missing', otherSource: true, informational: true };
    }
    const flags = {
      ...('choiceGone' in m && m.choiceGone ? { choiceGone: true } : {}),
      ...('productId' in m && m.warning ? { warning: m.warning } : {}),
      ...('productId' in m && m.note ? { note: m.note } : {}),
    };
    const other = 'missing' in m && m.otherSource === true;
    const reason = 'missing' in m ? m.reason : undefined;

    const matched = product && 'productId' in m
      ? { productId: product.id, productName: product.name, url: product.url, qty: m.qtyInProductUnit, unit: displayUnit(product) }
      : { qty: line.quantity, unit: line.unit as string };
    const priced = (source: CostLine['source'], unitPrice: number): CostLine => ({
      ...base, ...matched, unitPrice, total: Math.round(matched.qty * unitPrice), source,
      otherSource: other, informational: false, ...flags,
    });

    const override = pricing.overrides[line.id];
    if (override !== undefined) return priced('override', override);
    if (product) return priced('kaplar', product.price);
    const custom = pricing.custom[line.id];
    if (custom !== undefined) return priced('custom', custom);
    return { ...base, ...matched, source: 'missing', otherSource: other, informational: false, ...flags, ...(reason ? { reason } : {}) };
  });

  const byCategory = Object.fromEntries(CATEGORY_ORDER.map(c => [c, 0])) as Record<Category, number>;
  let kaplarSubtotal = 0;
  let otherSubtotal = 0;
  let missingCount = 0;
  for (const l of lines) {
    if (l.informational) continue;
    if (l.total === undefined) { missingCount++; continue; }
    byCategory[l.category] += l.total;
    if (isCart(l)) kaplarSubtotal += l.total;
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

/** Káplár-termékhez tartozó sor (kézi áras is: ugyanaz a termék, más ár) – a kosárba és a Káplár-részösszegbe tartozik. */
export const isCart = (l: CostLine): boolean => l.productId !== undefined && (l.source === 'kaplar' || l.source === 'override');

/**
 * A Káplár-kosár: azonos termékek összevonva. Különböző egységáraknál a mennyiség és az összeg összeadódik,
 * az egységár egyező árakra az ár, különben az összeg/mennyiség súlyozott átlaga egész forintra kerekítve.
 */
export function orderList(summary: CostSummary): OrderRow[] {
  const rows = new Map<string, OrderRow & { prices: Set<number> }>();
  for (const l of summary.lines) {
    if (!isCart(l) || l.productId === undefined || l.total === undefined || l.unitPrice === undefined) continue;
    const r = rows.get(l.productId);
    if (r) { r.qty += l.qty; r.total += l.total; r.prices.add(l.unitPrice); }
    else {
      rows.set(l.productId, {
        productId: l.productId, name: l.productName ?? l.name, url: l.url ?? '', qty: l.qty, unit: l.unit,
        unitPrice: l.unitPrice, total: l.total, prices: new Set([l.unitPrice]),
      });
    }
  }
  return [...rows.values()].map(({ prices, ...r }) => ({
    ...r, unitPrice: prices.size === 1 ? r.unitPrice : Math.round(r.total / r.qty),
  }));
}
