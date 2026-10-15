import type { Store } from '../ui/store';
import type { UiStore } from './uiStore';
import { useStore, useUi } from './hooks';
import { CATEGORY_ORDER } from '../calc';
import type { MaterialLine } from '../calc/types';
import { formatQty } from '../ui/format';
import { sceneFor } from './selection';
import { elementsForLine, stepForView } from './lineElements';

/** Kisbetű, ékezet nélkül (a kereséshez). */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function MaterialTable({ store, ui }: { store: Store; ui: UiStore }) {
  const { output, errors, lastValidPlan } = useStore(store, s => s);
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
            <summary>{cat}</summary>
            {lines.map(l => {
              const drawable = target(l) !== null;
              return (
                <details key={l.id} class="line" data-id={l.id} open={openLines.includes(l.id)}>
                  <summary onClick={e => { e.preventDefault(); ui.set({ matOpen: toggle(ui.get().matOpen, l.id, !openLines.includes(l.id)) }); }}>
                    <span class="name">{l.name}</span>
                    <span class="qty">{formatQty(l.quantity)}</span>
                    <span class="unit">{l.unit}</span>
                    {l.secondary && <span class="secondary">{l.secondary}</span>}
                    {drawable && (
                      <button type="button" class="show" aria-label="Mutasd a rajzon" title="Mutasd a rajzon"
                        onClick={e => { e.preventDefault(); e.stopPropagation(); goTo(l); }}>⌖</button>
                    )}
                  </summary>
                  <p class="explanation">{l.explanation}</p>
                  {(l.warnings ?? []).map((w, i) => <p key={i} class="line-warning">{w}</p>)}
                </details>
              );
            })}
          </details>
        );
      })}
    </div>
  );
}
