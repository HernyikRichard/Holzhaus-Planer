import { useState } from 'preact/hooks';
import type { Store } from '../ui/store';
import type { UiStore } from './uiStore';
import { CATEGORY_ORDER } from '../calc';
import { BUNDLED_PRICE_LIST } from '../prices';
import { orderList, isCart } from '../pricing/cost';
import { formatDateHu, formatFt, formatQty } from '../ui/format';
import { PriceCell, parsePrice } from './PriceCell';
import { useCost, setLinePrice, resetLinePrice } from './useCost';

export { formatDateHu };

/** Átírható szállítási díj: üres = automatikus; érvénytelen szövegnél piros mező és üzenet, a terv nem változik. */
function ShippingFeeInput({ store, fee, disabled }: { store: Store; fee: number | undefined; disabled: boolean }) {
  const [invalid, setInvalid] = useState(false);
  return (
    <label class="fee">Szállítási díj (Ft)
      <input type="text" inputMode="numeric" class="shipping-fee" placeholder="automatikus" disabled={disabled}
        defaultValue={fee === undefined ? '' : String(fee)} aria-invalid={invalid ? 'true' : undefined}
        onInput={() => setInvalid(false)}
        onChange={e => {
          const el = e.currentTarget as HTMLInputElement;
          if (el.value.trim() === '') { setInvalid(false); store.update(d => { delete d.pricing.shippingFee; }); return; }
          const n = parsePrice(el.value);
          if (n === null) { setInvalid(true); return; }
          setInvalid(false);
          store.update(d => { d.pricing.shippingFee = n; });
        }} />
      {invalid && <span class="price-error" role="alert">Érvénytelen összeg</span>}
    </label>
  );
}

/** A Költség és rendelés fül: összesítők, kategóriasávok, Káplár-kosár, máshonnan beszerzendő tételek. */
export function CostView({ store, ui }: { store: Store; ui: UiStore }) {
  const { plan, cost } = useCost(store);
  const pl = BUNDLED_PRICE_LIST;
  if (!cost || !pl) return <div class="cost-view"><p class="no-prices">Nincs árlista</p></div>;

  const pricing = plan.pricing;
  const catOf = (productId: string) => cost.lines.find(l => l.productId === productId)!.category;
  const kaplarCart = orderList(cost).sort((a, b) =>
    CATEGORY_ORDER.indexOf(catOf(a.productId)) - CATEGORY_ORDER.indexOf(catOf(b.productId)) || a.name.localeCompare(b.name, 'hu'));
  const others = cost.lines.filter(l => l.otherSource || (!isCart(l) && !l.informational));
  const materialTotal = cost.kaplarSubtotal + cost.otherSubtotal;
  const bars = CATEGORY_ORDER.filter(c => cost.byCategory[c] > 0);
  const sum = bars.reduce((a, c) => a + cost.byCategory[c], 0);

  const shippingText = pricing.pickup ? 'személyes átvétel: 0 Ft'
    : pricing.shippingFee !== undefined ? formatFt(cost.shipping)
    : cost.kaplarSubtotal <= 0 ? '0 Ft'
    : cost.shipping === 0 ? `ingyenes (${formatFt(pl.shipping.freeAbove)} felett)` : formatFt(cost.shipping);

  return (
    <div class="cost-view">
      <div class="cost-cards">
        <section class="cost-card materials-card">
          <h3>Anyagköltség</h3>
          <strong class="big">{formatFt(materialTotal)}</strong>
          <span class="sub">Káplár: {formatFt(cost.kaplarSubtotal)} · egyéb: {formatFt(cost.otherSubtotal)}</span>
        </section>
        <section class="cost-card shipping-card">
          <h3>Szállítás</h3>
          <strong class="big shipping-value">{shippingText}</strong>
          <label class="check"><input type="checkbox" checked={pricing.pickup}
            onChange={e => { const v = (e.currentTarget as HTMLInputElement).checked; store.update(d => { d.pricing.pickup = v; }); }} />
            Személyes átvétel</label>
          <ShippingFeeInput key={String(pricing.shippingFee)} store={store} fee={pricing.shippingFee} disabled={pricing.pickup} />
        </section>
        <section class="cost-card total-card">
          <h3>Végösszeg</h3>
          <strong class="big grand-total">{formatFt(cost.total)}</strong>
          <span class="sub">bruttó</span>
        </section>
        {cost.missingCount > 0 && (
          <section class="cost-card warn-card" role="status">
            <h3>{cost.missingCount} tétel ára hiányzik</h3>
            <span class="sub">A végösszeg ezek nélkül értendő.</span>
            <button type="button" class="show-missing"
              onClick={() => ui.set({ view: 'table', matOnlyMissing: true, matQuery: '' })}>Mutasd</button>
          </section>
        )}
      </div>

      {bars.length > 0 && (
        <section class="cost-bars" aria-label="Költség kategóriánként">
          {bars.map(c => {
            const pct = sum > 0 ? (cost.byCategory[c] / sum) * 100 : 0;
            return (
              <div class="bar-row" key={c} data-category={c}>
                <div class="bar-label">{c} – {formatFt(cost.byCategory[c])} ({Math.round(pct)}%)</div>
                <div class="bar-track"><div class="bar-fill" style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
        </section>
      )}

      <section class="cost-section">
        <h3>Káplár-kosár</h3>
        {kaplarCart.length === 0 ? <p class="muted">Nincs Káplár-termék a tervben.</p> : (
          <table class="cart-table">
            <thead><tr><th>Termék</th><th class="num">Mennyiség</th><th>Egység</th><th class="num">Egységár</th><th class="num">Összeg</th></tr></thead>
            <tbody>
              {kaplarCart.map(r => (
                <tr key={r.productId} data-product={r.productId}>
                  <td><a href={r.url} target="_blank" rel="noopener noreferrer">{r.name} ↗</a></td>
                  <td class="num">{formatQty(r.qty)}</td>
                  <td>{r.unit}</td>
                  <td class="num">{formatFt(r.unitPrice)}</td>
                  <td class="num">{formatFt(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={4}>Káplár részösszeg</td><td class="num cart-subtotal">{formatFt(cost.kaplarSubtotal)}</td></tr></tfoot>
          </table>
        )}
      </section>

      <section class="cost-section">
        <h3>Máshonnan beszerzendő</h3>
        {others.length === 0 ? <p class="muted">Minden tétel megrendelhető a Káplárnál.</p> : (
          <ul class="other-list">
            {others.map(l => (
              <li key={l.lineId} data-id={l.lineId}>
                <span class="name">{l.name}</span>
                <span class="qty">{formatQty(l.qty)} {l.unit}</span>
                {l.informational ? <span class="tag info">tájékoztató</span> : (<>
                  <PriceCell line={l} label={l.name} onCommit={v => setLinePrice(store, l, v)} onReset={() => resetLinePrice(store, l)} />
                  <span class="total">{l.total === undefined ? '—' : formatFt(l.total)}</span></>)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p class="cost-note">Árak: {pl.source}, {formatDateHu(pl.fetchedAt)} – bruttó, tájékoztató jellegű. A tényleges árak és készlet a webshopban ellenőrizendők.</p>
    </div>
  );
}
