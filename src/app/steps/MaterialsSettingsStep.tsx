import type { Store } from '../../ui/store';
import { SectionGroup } from '../FieldControl';
import { useStore } from '../hooks';
import { BUNDLED_PRICE_LIST } from '../../prices';
import type { PriceList } from '../../prices/types';
import { formatDateHu } from '../CostView';
import { daysSince } from '../now';

const STALE_DAYS = 60;

export function MaterialsSettingsStep({ store, priceList = BUNDLED_PRICE_LIST }: { store: Store; priceList?: PriceList | null }) {
  const useSupply = useStore(store, s => s.plan.pricing.useSupply);
  const stale = priceList ? daysSince(priceList.fetchedAt) > STALE_DAYS : false;
  return (
    <>
      <section class="group" data-section="prices">
        <h3>Árak</h3>
        <label class="field field-check">
          <input type="checkbox" checked={useSupply} data-pricing="useSupply"
            onChange={e => { const v = (e.currentTarget as HTMLInputElement).checked; store.update(d => { d.pricing.useSupply = v; }); }} />
          <span>Káplár-kínálat szerint számol</span>
        </label>
        {priceList
          ? <p class="price-date">Árlista: {priceList.source}, {formatDateHu(priceList.fetchedAt)}</p>
          : <p class="price-date">Nincs árlista</p>}
        {stale && <p class="price-stale" role="alert">Az árlista régi – frissítés: npm run arak</p>}
      </section>
      <SectionGroup id="settings" store={store} />
    </>
  );
}
