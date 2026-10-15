import type { Store } from '../ui/store';
import type { UiStore } from './uiStore';
import { useUi } from './hooks';
import { STEPS } from './steps';
import { BuildingStep } from './steps/BuildingStep';
import { FoundationStep } from './steps/FoundationStep';
import { WallsStep } from './steps/WallsStep';
import { OpeningsStep } from './steps/OpeningsStep';
import { RoofStep } from './steps/RoofStep';
import { MaterialsSettingsStep } from './steps/MaterialsSettingsStep';

export function StepPanel({ store, ui }: { store: Store; ui: UiStore }) {
  const step = useUi(ui, s => s.step);
  const def = STEPS.find(s => s.id === step)!;
  return (
    <aside class="step-panel" aria-label="Beállítások">
      <h2>{def.title}</h2>
      {step === 'building' && <BuildingStep store={store} />}
      {step === 'foundation' && <FoundationStep store={store} />}
      {step === 'walls' && <WallsStep store={store} />}
      {step === 'openings' && <OpeningsStep store={store} ui={ui} />}
      {step === 'roof' && <RoofStep store={store} />}
      {step === 'materials' && <MaterialsSettingsStep store={store} />}
    </aside>
  );
}
