import type { Store } from '../ui/store';
import type { UiStore } from './uiStore';
import { useStore, useUi } from './hooks';
import { CATEGORY_ORDER } from '../calc';
import type { MaterialLine } from '../calc/types';
import { useMemo, useState } from 'preact/hooks';
import { formatFt, formatQty } from '../ui/format';
import { BUNDLED_PRICE_LIST } from '../prices';
import { type CostLine } from '../pricing/cost';
import { useCost, setLinePrice, resetLinePrice } from './useCost';
import { PriceCell } from './PriceCell';
import { sceneFor } from './selection';
import { elementsForLine, stepForView } from './lineElements';

/** Kisbetű, ékezet nélkül (a kereséshez). */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function MaterialTable({ store, ui }: { store: Store; ui: UiStore }) {
  const { output, errors, lastValidPlan } = useStore(store, s => s);
  const { plan, cost } = useCost(store);
  const pl = BUNDLED_PRICE_LIST;
  const costById = useMemo(() => new Map((cost?.lines ?? []).map(c => [c.lineId, c])), [cost]);
  const layers = useUi(ui, s => s.layers);
  const query = useUi(ui, s => s.matQuery);
  const openLines = useUi(ui, s => s.matOpen);
  const closedCats = useUi(ui, s => s.matClosed);
  const onlyMissing = useUi(ui, s => s.matOnlyMissing);
  const toggle = (list: string[], id: string, open: boolean): string[] => {
    const rest = list.filter(x => x !== id);
    return open ? [...rest, id] : rest;
  };
  const target = (l: MaterialLine) => {
    try { return elementsForLine(sceneFor(lastValidPlan), l); } catch { return null; }
  };

  const goTo = (line: MaterialLine) => {
    const t = target(line);
    if (!t) return;
    // a célnézet kamerája visszaáll a teljes nézetre, hogy a kiemelt elemek biztosan látszanak
    const { [t.view]: _drop, ...cameras } = ui.get().cameras;
    ui.set({
      step: stepForView(t.view), view: t.view, cameras,
      layers: t.layer ? { ...layers, [t.layer]: true } : layers,
      highlight: t.ids,
    });
  };

  const setPrice = (c: CostLine, price: number) => setLinePrice(store, c, price);
  const resetPrice = (c: CostLine) => resetLinePrice(store, c);
  /** true, ha a beírt szöveg érvényes (termék vagy „automatikus”). */
  const chooseProduct = (id: string, kind: string, value: string): boolean => {
    const v = value.trim();
    if (fold(v) === 'automatikus') { store.update(d => { delete d.pricing.productChoice[id]; }); return true; }
    const p = pl?.products.find(x => x.kind === kind && x.name === v);
    if (!p) return false;
    store.update(d => { d.pricing.productChoice[id] = p.id; });
    return true;
  };

  const q = fold(query.trim());
  const matches = (l: MaterialLine) => (q === '' || fold(l.name).includes(q))
    && (!onlyMissing || (() => { const c = costById.get(l.id); return c?.source === 'missing' && !c.informational; })());

  return (
    <div class="material-table">
      <input type="search" class="line-search" placeholder="Keresés név szerint…" aria-label="Keresés" value={query}
        onInput={e => ui.set({ matQuery: (e.currentTarget as HTMLInputElement).value })} />
      {onlyMissing && (
        <div class="missing-filter" role="status">Csak az ár nélküli tételek látszanak.
          <button type="button" onClick={() => ui.set({ matOnlyMissing: false })}>Mind mutatása</button></div>
      )}
      {errors.length > 0 && (
        <div class="stale-notice" role="status">A terv hibás mezőt tartalmaz – az anyaglista az utolsó érvényes állapotot mutatja.</div>
      )}
      {output.warnings.length > 0 && (
        <div class="warnings" role="status">
          <strong>Figyelmeztetések</strong>
          <ul>{output.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}
      {onlyMissing && q === '' && !output.lines.some(matches) && <p class="no-results">Nincs hiányzó árú tétel.</p>}
      {q !== '' && !output.lines.some(matches) && <p class="no-results">Nincs találat a(z) „{query.trim()}” keresésre.</p>}
      {cost && (
        <div class="cols" aria-hidden="true">
          <span class="name">Anyag</span><span class="qty">Mennyiség</span><span class="unit">Egység</span>
          <span class="price-cell">Egységár</span><span class="total">Összeg</span><span class="source">Forrás</span><span class="show-slot" />
        </div>
      )}
      {CATEGORY_ORDER.map(cat => {
        const lines = output.lines.filter(l => l.category === cat && matches(l));
        if (lines.length === 0) return null;
        return (
          <details key={cat} class="category" data-category={cat} open={q !== '' || !closedCats.includes(cat)}
            onToggle={e => { if (q === '') ui.set({ matClosed: toggle(ui.get().matClosed, cat, !(e.currentTarget as HTMLDetailsElement).open) }); }}>
            <summary>{cat}{cost && <span class="subtotal">{formatFt(cost.byCategory[cat])}</span>}</summary>
            {lines.map(l => {
              const drawable = target(l) !== null;
              const c = costById.get(l.id);
              const kind = c ? (c.productId ? pl?.products.find(p => p.id === c.productId)?.kind : undefined)
                ?? pl?.products.find(p => p.id === plan.pricing.productChoice[l.id])?.kind : undefined;
              return (
                <details key={l.id} class="line" data-id={l.id} open={openLines.includes(l.id)}>
                  <summary onClick={e => { e.preventDefault(); ui.set({ matOpen: toggle(ui.get().matOpen, l.id, !openLines.includes(l.id)) }); }}>
                    <span class="name">
                      {l.name}
                      {l.secondary && <span class="secondary">{l.secondary}</span>}
                      {c?.productName && c.url && (
                        <a class="product-link" href={c.url} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}>{c.productName} ↗</a>
                      )}
                      {c?.choiceGone && <span class="line-warning">A kiválasztott termék már nem elérhető</span>}
                    </span>
                    <span class="qty">{formatQty(l.quantity)}</span>
                    <span class="unit">{l.unit}</span>
                    {c && !c.informational && <PriceCell line={c} label={l.name}
                      caption={c.productId !== undefined && c.unitPrice !== undefined && (c.qty !== l.quantity || c.unit !== l.unit)
                        ? `${formatQty(c.qty)} ${c.unit} × ${formatFt(c.unitPrice)}` : undefined}
                      onCommit={v => setPrice(c, v)} onReset={() => resetPrice(c)} />}
                    {c && !c.informational && <span class="total">{c.total === undefined ? '—' : formatFt(c.total)}</span>}
                    {c && <SourceTag line={c} />}
                    {drawable ? (
                      <button type="button" class="show" aria-label="Mutasd a rajzon" title="Mutasd a rajzon"
                        onClick={e => { e.preventDefault(); e.stopPropagation(); goTo(l); }}>⌖</button>
                    ) : <span class="show-slot" />}
                  </summary>
                  <p class="explanation">{l.explanation}</p>
                  {c?.source === 'missing' && c.reason && <p class="explanation">{c.reason}</p>}
                  {c?.note && <p class="explanation price-note">{c.note}</p>}
                  {c?.warning && <p class="line-warning">{c.warning}</p>}
                  {c && kind && pl && (
                    <ProductPicker lineId={l.id} products={pl.products.filter(p => p.kind === kind)}
                      current={plan.pricing.productChoice[l.id] ? c.productName ?? '' : ''}
                      onChoose={v => chooseProduct(l.id, kind, v)} />
                  )}
                  {(l.warnings ?? []).map((w, i) => <p key={i} class="line-warning">{w}</p>)}
                </details>
              );
            })}
          </details>
        );
      })}
      {cost && (
        <div class="material-total"><span>Anyagköltség összesen</span><strong>{formatFt(cost.kaplarSubtotal + cost.otherSubtotal)}</strong></div>
      )}
    </div>
  );
}

function ProductPicker({ lineId, products, current, onChoose }: {
  lineId: string; products: { id: string; name: string }[]; current: string; onChoose: (v: string) => boolean;
}) {
  const [bad, setBad] = useState(false);
  return (
    <label class="product-picker">Termék
      <input type="text" class="product-choice" list={`products-${lineId}`} placeholder="automatikus" value={current}
        aria-invalid={bad ? 'true' : undefined}
        onChange={e => {
          const el = e.currentTarget as HTMLInputElement;
          if (el.value.trim() === '') { setBad(false); return; }
          const ok = onChoose(el.value);
          setBad(!ok);
          if (!ok) el.value = current;
        }} />
      {bad && <span class="price-error" role="alert">Nincs ilyen termék</span>}
      <datalist id={`products-${lineId}`}>
        <option value="automatikus" />
        {products.map(p => <option key={p.id} value={p.name} />)}
      </datalist>
    </label>
  );
}

function SourceTag({ line }: { line: CostLine }) {
  const [cls, label] = line.source === 'kaplar' ? ['ok', 'Káplár']
    : line.informational ? ['info', 'tájékoztató']
    : line.source === 'missing' ? ['miss', 'nincs ár'] : ['manual', 'kézi'];
  return (
    <span class="source">
      <span class={`tag ${cls}`}>{label}</span>
      {line.otherSource && <span class="other-source">máshonnan</span>}
    </span>
  );
}
