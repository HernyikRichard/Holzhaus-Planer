import type { Store } from '../ui/store';
import type { UiStore } from './uiStore';
import { useUi } from './hooks';
import { MaterialTable } from './MaterialTable';
import { CutPlanView } from './CutPlanView';

const TABS = [{ id: 'table', name: 'Anyaglista' }, { id: 'cutplan', name: 'Vágási terv' }] as const;

/** Az Anyaglista lépés: a vászon helyén füles táblázat / vágási terv. */
export function MaterialsArea({ store, ui }: { store: Store; ui: UiStore }) {
  const view = useUi(ui, s => s.view);
  return (
    <main class="viewer materials-area" aria-label="Anyaglista">
      <div class="viewer-bar">
        <div class="view-switch" role="tablist" aria-label="Anyaglista nézetei">
          {TABS.map(t => (
            <button type="button" role="tab" key={t.id} class={view === t.id ? 'active' : ''} aria-selected={view === t.id}
              onClick={() => ui.set({ view: t.id })}>{t.name}</button>
          ))}
        </div>
      </div>
      <div class="materials-body">
        {view === 'cutplan' ? <CutPlanView store={store} ui={ui} /> : <MaterialTable store={store} ui={ui} />}
      </div>
    </main>
  );
}
