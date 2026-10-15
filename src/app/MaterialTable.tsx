import type { Store } from '../ui/store';
import type { UiStore } from './uiStore';
import { useStore, useUi } from './hooks';
import { CATEGORY_ORDER } from '../calc';
import type { MaterialLine } from '../calc/types';
import { useMemo } from 'preact/hooks';
import { formatFt, formatQty } from '../ui/format';
import { BUNDLED_PRICE_LIST } from '../prices';
import { costOf, type CostLine } from '../pricing/cost';
import { PriceCell } from './PriceCell';
import { sceneFor } from './selection';
import { elementsForLine, stepForView } from './lineElements';

/** Kisbetű, ékezet nélkül (a kereséshez). */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function MaterialTable({ store, ui }: { store: Store; ui: UiStore }) {
  const { output, errors, lastValidPlan } = useStore(store, s => s);
  const plan = lastValidPlan;
  const pl = BUNDLED_PRICE_LIST;
  const cost = useMemo(() => (pl ? costOf(plan, output, pl) : null), [plan, output, pl]);
  const costById = useMemo(() => new Map((cost?.lines ?? []).map(c => [c.lineId, c])), [cost]);
  const layers = useUi(ui, s => s.layers);
  const query = useUi(ui, s => s.matQuery);
  const openLines = useUi(ui, s => s.matOpen);
  const closedCats = useUi(ui, s => s.matClosed);
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

  const setPrice = (c: CostLine, price: number) => store.update(d => {
    if (c.productId !== undefined) d.pricing.overrides[c.lineId] = price; else d.pricing.custom[c.lineId] = price;
  });
  const resetPrice = (c: CostLine) => store.update(d => {
    if (c.source === 'override') delete d.pricing.overrides[c.lineId]; else delete d.pricing.custom[c.lineId];
  });
  const chooseProduct = (id: string, kind: string, value: string) => {
    const v = value.trim();
    if (v === '') return;
    if (fold(v) === 'automatikus') { store.update(d => { delete d.pricing.productChoice[id]; }); return; }
    const p = pl?.products.find(x => x.kind === kind && x.name === v);
    if (p) store.update(d => { d.pricing.productChoice[id] = p.id; });
  };

  const q = fold(query.trim());
  const matches = (l: MaterialLine) => q === '' || fold(l.name).includes(q);

  return (
    <div class="material-table">
      <input type="search" class="line-search" placeholder="Keresés név szerint…" aria-label="Keresés" value={query}
        onInput={e => ui.set({ matQuery: (e.currentTarget as HTMLInputElement).value })} />
      {errors.length > 0 && (
        <div class="stale-notice" role="status">A terv hibás mezőt tartalmaz – az anyaglista az utolsó érvényes állapotot mutatja.</div>
      )}
      {output.warnings.length > 0 && (
        <div class="warnings" role="status">
          <strong>Figyelmeztetések</strong>
          <ul>{output.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}
      {q !== '' && !output.lines.some(matches) && <p class="no-results">Nincs találat a(z) „{query.trim()}” keresésre.</p>}
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
                      {c?.productName && c.url && (
                        <a class="product-link" href={c.url} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}>{c.productName} ↗</a>
                      )}
                      {c?.choiceGone && <span class="line-warning">A kiválasztott termék már nem elérhető</span>}
                    </span>
                    <span class="qty">{formatQty(l.quantity)}</span>
                    <span class="unit">{l.unit}</span>
                    <span class="secondary">{l.secondary ?? ''}</span>
                    {c && <PriceCell line={c} onCommit={v => setPrice(c, v)} onReset={() => resetPrice(c)} />}
                    {c && <span class="total">{c.total === undefined ? '—' : formatFt(c.total)}</span>}
                    {c && <SourceTag line={c} />}
                    {drawable ? (
                      <button type="button" class="show" aria-label="Mutasd a rajzon" title="Mutasd a rajzon"
                        onClick={e => { e.preventDefault(); e.stopPropagation(); goTo(l); }}>⌖</button>
                    ) : <span class="show-slot" />}
                  </summary>
                  <p class="explanation">{l.explanation}</p>
                  {c?.source === 'missing' && c.reason && <p class="explanation">{c.reason}</p>}
                  {c && kind && pl && (
                    <label class="product-picker">Termék
                      <input type="text" class="product-choice" list={`products-${l.id}`} placeholder="automatikus"
                        defaultValue={plan.pricing.productChoice[l.id] ? c.productName ?? '' : ''}
                        onChange={e => chooseProduct(l.id, kind, (e.currentTarget as HTMLInputElement).value)} />
                      <datalist id={`products-${l.id}`}>
                        <option value="automatikus" />
                        {pl.products.filter(p => p.kind === kind).map(p => <option key={p.id} value={p.name} />)}
                      </datalist>
                    </label>
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

function SourceTag({ line }: { line: CostLine }) {
  const [cls, label] = line.source === 'kaplar' ? ['ok', 'Káplár']
    : line.source === 'missing' ? ['miss', 'nincs ár'] : ['manual', 'kézi'];
  return (
    <span class="source">
      <span class={`tag ${cls}`}>{label}</span>
      {line.otherSource && <span class="other-source">máshonnan</span>}
    </span>
  );
}
