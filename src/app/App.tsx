import type { Store } from '../ui/store';
import type { UiStore } from './uiStore';
import { TopBar } from './TopBar';
import { StepPanel } from './StepPanel';
import { Viewer } from './Viewer';
import { DetailPanel } from './DetailPanel';
import { StepSummary } from './StepSummary';
import { MaterialsArea } from './MaterialsArea';
import { AssemblyView } from './AssemblyView';
import { useUi } from './hooks';

export function App({ store, ui }: { store: Store; ui: UiStore }) {
  const step = useUi(ui, s => s.step);
  return (
    <div class="app">
      <TopBar store={store} ui={ui} />
      <StepPanel store={store} ui={ui} />
      {/* a Szerelés saját beágyazott 3D-t rajzol: a vászon (és vele a lebegő 3D ablak) ilyenkor nem renderel */}
      {step === 'materials' ? <MaterialsArea store={store} ui={ui} />
        : step === 'assembly' ? <AssemblyView store={store} ui={ui} />
        : <Viewer store={store} ui={ui} />}
      <DetailPanel store={store} ui={ui} />
      <StepSummary store={store} ui={ui} />
    </div>
  );
}
