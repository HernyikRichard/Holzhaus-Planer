import { useMemo } from 'preact/hooks';
import type { Store } from '../ui/store';
import { useStore } from './hooks';
import { BUNDLED_PRICE_LIST } from '../prices';
import { costOf, type CostLine, type CostSummary } from '../pricing/cost';
import type { Plan } from '../model/types';

/**
 * Az aktuális költségösszesítés: a geometria az utolsó érvényes tervből, az árazási beállítások
 * (kézi árak, szállítás) az aktuális tervből, így hibás terven is érvényesek.
 */
export function useCost(store: Store): { plan: Plan; cost: CostSummary | null } {
  const { output, lastValidPlan } = useStore(store, s => s);
  const livePricing = useStore(store, st => st.plan.pricing);
  const plan = useMemo(() => ({
    ...lastValidPlan,
    pricing: {
      ...lastValidPlan.pricing, overrides: livePricing.overrides, custom: livePricing.custom,
      pickup: livePricing.pickup, shippingFee: livePricing.shippingFee,
    },
  }), [lastValidPlan, livePricing.overrides, livePricing.custom, livePricing.pickup, livePricing.shippingFee]);
  const pl = BUNDLED_PRICE_LIST;
  const cost = useMemo(() => (pl ? costOf(plan, output, pl) : null), [plan, output, pl]);
  return { plan, cost };
}

/** Egy tétel egységárának írása: Káplár-terméknél felülírás, egyébként kézi (custom) ár. */
export function setLinePrice(store: Store, c: CostLine, price: number): void {
  store.update(d => {
    if (c.source === 'override' || c.source === 'kaplar') d.pricing.overrides[c.lineId] = price;
    else d.pricing.custom[c.lineId] = price;
  });
}

export function resetLinePrice(store: Store, c: CostLine): void {
  store.update(d => {
    if (c.source === 'override') delete d.pricing.overrides[c.lineId]; else delete d.pricing.custom[c.lineId];
  });
}
